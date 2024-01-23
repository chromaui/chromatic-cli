import 'any-observable/register/zen';
import Listr from 'listr';
import readPkgUp from 'read-pkg-up';
import { v4 as uuid } from 'uuid';

import { getBranch, getCommit, getSlug, getUncommittedHash, getUserEmail } from './git/git';
import GraphQLClient from './io/GraphQLClient';
import HTTPClient from './io/HTTPClient';
import LoggingRenderer from './lib/LoggingRenderer';
import NonTTYRenderer from './lib/NonTTYRenderer';
import checkForUpdates from './lib/checkForUpdates';
import checkPackageJson from './lib/checkPackageJson';
import { emailHash } from './lib/emailHash';
import { getConfiguration } from './lib/getConfiguration';
import getEnv from './lib/getEnv';
import getOptions from './lib/getOptions';
import { createLogger } from './lib/log';
import parseArgs from './lib/parseArgs';
import { exitCodes, setExitCode } from './lib/setExitCode';
import { uploadMetadataFiles } from './lib/uploadMetadataFiles';
import { rewriteErrorMessage } from './lib/utils';
import { writeChromaticDiagnostics } from './lib/writeChromaticDiagnostics';
import getTasks from './tasks';
import { Context, Flags, Logger, Options } from './types';
import { endActivity } from './ui/components/activity';
import buildCanceled from './ui/messages/errors/buildCanceled';
import { default as fatalError } from './ui/messages/errors/fatalError';
import fetchError from './ui/messages/errors/fetchError';
import graphqlError from './ui/messages/errors/graphqlError';
import invalidPackageJson from './ui/messages/errors/invalidPackageJson';
import missingStories from './ui/messages/errors/missingStories';
import noPackageJson from './ui/messages/errors/noPackageJson';
import runtimeError from './ui/messages/errors/runtimeError';
import taskError from './ui/messages/errors/taskError';
import intro from './ui/messages/info/intro';

/**
 Make keys of `T` outside of `R` optional.
*/
type AtLeast<T, R extends keyof T> = Partial<T> & Pick<T, R>;

interface Output {
  code: number;
  url: string;
  buildUrl: string;
  storybookUrl: string;
  specCount: number;
  componentCount: number;
  testCount: number;
  changeCount: number;
  errorCount: number;
  interactionTestFailuresCount: number;
  actualTestCount: number;
  actualCaptureCount: number;
  inheritedCaptureCount: number;
}

export type { Configuration, Context, Flags, Options, TaskName, Logger } from './types';

export type InitialContext = Omit<
  AtLeast<
    Context,
    | 'argv'
    | 'flags'
    | 'help'
    | 'pkg'
    | 'extraOptions'
    | 'packagePath'
    | 'packageJson'
    | 'env'
    | 'log'
    | 'sessionId'
  >,
  'options'
>;

const isContext = (ctx: InitialContext): ctx is Context => 'options' in ctx;

// Entry point for the CLI, GitHub Action, and Node API
export async function run({
  argv = [],
  flags,
  options: extraOptions,
  logger
}: {
  argv?: string[];
  flags?: Flags;
  options?: Partial<Options>;
  logger?: Logger;
}): Promise<Output> {
  const sessionId = uuid();
  const env = getEnv();
  const log = logger ?? createLogger();

  const pkgInfo = await readPkgUp({ cwd: process.cwd() });
  if (!pkgInfo) {
    log.error(noPackageJson());
    process.exit(253);
  }

  const { path: packagePath, packageJson } = pkgInfo;
  if (typeof packageJson !== 'object' || typeof packageJson.scripts !== 'object') {
    log.error(invalidPackageJson(packagePath));
    process.exit(252);
  }

  const ctx: InitialContext = {
    ...parseArgs(argv),
    ...(flags && { flags }),
    ...(extraOptions && { extraOptions }),
    packagePath,
    packageJson,
    env,
    log,
    sessionId,
  };

  await runAll(ctx);

  return {
    // Keep this in sync with the configured outputs in action.yml
    code: ctx.exitCode,
    url: ctx.build?.webUrl,
    buildUrl: ctx.build?.webUrl,
    storybookUrl: ctx.build?.storybookUrl,
    specCount: ctx.build?.specCount,
    componentCount: ctx.build?.componentCount,
    testCount: ctx.build?.testCount,
    changeCount: ctx.build?.changeCount,
    errorCount: ctx.build?.errorCount,
    interactionTestFailuresCount: ctx.build?.interactionTestFailuresCount,
    actualTestCount: ctx.build?.actualTestCount,
    actualCaptureCount: ctx.build?.actualCaptureCount,
    inheritedCaptureCount: ctx.build?.inheritedCaptureCount,
  };
}

// Entry point for testing only (typically invoked via `run` above)
export async function runAll(ctx: InitialContext) {
  ctx.log.info('');
  ctx.log.info(intro(ctx));
  ctx.log.info('');

  const onError = (e: Error | Error[]) => {
    ctx.log.info('');
    ctx.log.error(fatalError(ctx, [].concat(e)));
    ctx.extraOptions?.experimental_onTaskError?.(ctx, {
      formattedError: fatalError(ctx, [].concat(e)),
      originalError: e,
    });
    setExitCode(ctx, exitCodes.INVALID_OPTIONS, true);
  };

  try {
    ctx.http = new HTTPClient(ctx);
    ctx.client = new GraphQLClient(ctx, `${ctx.env.CHROMATIC_INDEX_URL}/graphql`, {
      headers: {
        'x-chromatic-session-id': ctx.sessionId,
        'x-chromatic-cli-version': ctx.pkg.version,
      },
      retries: 3,
    });
    ctx.configuration = await getConfiguration(
      ctx.extraOptions?.configFile || ctx.flags.configFile
    );
    const options = getOptions(ctx);
    (ctx as Context).options = options;
    ctx.log.setLogFile(options.logFile);
    setExitCode(ctx, exitCodes.OK);
  } catch (e) {
    return onError(e);
  }

  if (!isContext(ctx)) {
    return onError(new Error('Invalid context'));
  }

  // Run these in parallel; neither should ever reject
  await Promise.all([runBuild(ctx), checkForUpdates(ctx)]).catch(onError);

  if ([0, 1].includes(ctx.exitCode)) {
    await checkPackageJson(ctx);
  }

  if (ctx.options.diagnosticsFile) {
    await writeChromaticDiagnostics(ctx);
  }

  if (ctx.options.uploadMetadata) {
    await uploadMetadataFiles(ctx);
  }
}

async function runBuild(ctx: Context) {
  try {
    try {
      const options = {
        log: ctx.log,
        renderer: NonTTYRenderer,
      };
      if (ctx.options.interactive) {
        // Use an enhanced version of Listr's default renderer, which also logs to a file
        options.renderer = LoggingRenderer;
        // Queue up any non-Listr log messages while Listr is running
        ctx.log.queue();
      }
      await new Listr(getTasks(ctx.options), options).run(ctx);
    } catch (err) {
      endActivity(ctx);
      if (err.code === 'ECONNREFUSED' || err.name === 'StatusCodeError') {
        setExitCode(ctx, exitCodes.FETCH_ERROR);
        throw rewriteErrorMessage(err, fetchError(ctx, err));
      }
      if (err.name === 'GraphQLError') {
        setExitCode(ctx, exitCodes.GRAPHQL_ERROR);
        throw rewriteErrorMessage(err, graphqlError(ctx, err));
      }
      if (err.message.startsWith('Cannot run a build with no stories')) {
        setExitCode(ctx, exitCodes.BUILD_NO_STORIES);
        throw rewriteErrorMessage(err, missingStories(ctx));
      }
      if (ctx.options.experimental_abortSignal?.aborted) {
        setExitCode(ctx, exitCodes.BUILD_WAS_CANCELED, true);
        throw rewriteErrorMessage(err, buildCanceled());
      }
      throw rewriteErrorMessage(err, taskError(ctx, err));
    } finally {
      // Handle potential runtime errors from JSDOM
      const { runtimeErrors, runtimeWarnings } = ctx;
      if ((runtimeErrors && runtimeErrors.length) || (runtimeWarnings && runtimeWarnings.length)) {
        ctx.log.info('');
        ctx.log.error(runtimeError(ctx));
      }

      ctx.log.flush();
    }
  } catch (error) {
    const errors = [].concat(error); // GraphQLClient might throw an array of errors
    const formattedError = fatalError(ctx, errors);

    ctx.options.experimental_onTaskError?.(ctx, {
      formattedError,
      originalError: errors[0],
    });

    if (!ctx.userError) {
      ctx.log.info('');
      ctx.log.error(formattedError);
    }

    if (!ctx.exitCode) {
      setExitCode(ctx, exitCodes.UNKNOWN_ERROR);
    }
  }
}

export type GitInfo = {
  slug: string;
  branch: string;
  commit: string;
  committedAt: number;
  committerEmail: string;
  committerName: string;
  uncommittedHash: string;
  userEmail: string;
  userEmailHash: string;
};

export async function getGitInfo(): Promise<GitInfo> {
  const slug = await getSlug();
  const branch = await getBranch();
  const commitInfo = await getCommit();
  const userEmail = await getUserEmail();
  const userEmailHash = emailHash(userEmail);

  const [ownerName, repoName, ...rest] = slug ? slug.split('/') : [];
  const isValidSlug = !!ownerName && !!repoName && !rest.length;

  const uncommittedHash = await getUncommittedHash();
  return {
    slug: isValidSlug ? slug : '',
    branch,
    ...commitInfo,
    uncommittedHash,
    userEmail,
    userEmailHash,
  };
}

export { getConfiguration } from './lib/getConfiguration';
