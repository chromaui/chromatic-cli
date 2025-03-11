import 'any-observable/register/zen';

import * as Sentry from '@sentry/node';
import Listr from 'listr';
import { readPackageUp } from 'read-package-up';
import { v4 as uuid } from 'uuid';

import {
  getBranch,
  getCommit,
  getRepositoryRoot,
  getSlug,
  getUncommittedHash,
  getUserEmail,
} from './git/git';
import GraphQLClient from './io/graphqlClient';
import HTTPClient from './io/httpClient';
import checkForUpdates from './lib/checkForUpdates';
import checkPackageJson from './lib/checkPackageJson';
import { isE2EBuild } from './lib/e2eUtils';
import { emailHash } from './lib/emailHash';
import { getConfiguration } from './lib/getConfiguration';
import getEnvironment from './lib/getEnvironment';
import getOptions from './lib/getOptions';
import { createLogger } from './lib/log';
import LoggingRenderer from './lib/loggingRenderer';
import NonTTYRenderer from './lib/nonTTYRenderer';
import parseArguments from './lib/parseArguments';
import { exitCodes, setExitCode } from './lib/setExitCode';
import { uploadMetadataFiles } from './lib/uploadMetadataFiles';
import { rewriteErrorMessage } from './lib/utils';
import { writeChromaticDiagnostics } from './lib/writeChromaticDiagnostics';
import getTasks from './tasks';
import { Context, Flags, Options } from './types';
import { endActivity } from './ui/components/activity';
import buildCanceled from './ui/messages/errors/buildCanceled';
import { default as fatalError } from './ui/messages/errors/fatalError';
import fetchError from './ui/messages/errors/fetchError';
import graphqlError from './ui/messages/errors/graphqlError';
import missingStories from './ui/messages/errors/missingStories';
import noPackageJson from './ui/messages/errors/noPackageJson';
import runtimeError from './ui/messages/errors/runtimeError';
import taskError from './ui/messages/errors/taskError';
import intro from './ui/messages/info/intro';

// Make keys of `T` outside of `R` optional.
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

export type { Configuration, Context, Flags, Options, TaskName } from './types';

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

/**
 * Entry point for the CLI, GitHub Action, and Node API
 *
 * @param args The arguments set by the environment in which the CLI is running (CLI, GitHub Action,
 * or Node API)
 * @param args.argv The list of arguments passed.
 * @param args.flags Any flags that were passed.
 * @param args.options Any options that were passed.
 *
 * @returns An object with details from the result of the new build.
 */
// TODO: refactor this function
// eslint-disable-next-line complexity
export async function run({
  argv = [],
  flags,
  options: extraOptions,
}: {
  argv?: string[];
  flags?: Flags;
  options?: Partial<Options>;
}): Promise<Partial<Output>> {
  const config = {
    ...parseArguments(argv),
    ...(flags && { flags }),
    ...(extraOptions && { extraOptions }),
  };
  const {
    sessionId = uuid(),
    env: environment = getEnvironment(),
    log = createLogger(config.flags, config.extraOptions),
  } = extraOptions || {};

  // We don't normalize because if the `version` field isn't a proper semver string, the process
  // silently exits.
  const packageInfo = await readPackageUp({ cwd: process.cwd(), normalize: false });
  if (!packageInfo) {
    log.error(noPackageJson());
    process.exit(253);
  }

  const { path: packagePath, packageJson } = packageInfo;
  const ctx: InitialContext = {
    ...config,
    packagePath,
    packageJson,
    env: environment,
    log,
    sessionId,
  };

  await runAll(ctx);

  return {
    // Keep this in sync with the configured outputs in action.yml
    code: ctx.exitCode,
    url: ctx.build?.webUrl,
    buildUrl: ctx.build?.webUrl,
    storybookUrl: ctx.build?.storybookUrl || ctx.storybookUrl,
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

/**
 * Entry point for testing only (typically invoked via `run` above)
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns A promise that resolves when all steps are completed.
 */
export async function runAll(ctx: InitialContext) {
  ctx.log.info('');
  ctx.log.info(intro(ctx));
  ctx.log.info('');

  const onError = (err: Error | Error[]) => {
    ctx.log.info('');
    ctx.log.error(fatalError(ctx, [err].flat()));
    ctx.extraOptions?.experimental_onTaskError?.(ctx, {
      formattedError: fatalError(ctx, [err].flat()),
      originalError: err,
    });
    setExitCode(ctx, exitCodes.INVALID_OPTIONS, true);
  };

  try {
    ctx.http = new HTTPClient(ctx);
    ctx.client = new GraphQLClient(ctx, `${ctx.env.CHROMATIC_INDEX_URL}/graphql`, {
      headers: {
        'x-chromatic-session-id': ctx.sessionId,
        'x-chromatic-cli-version': ctx.pkg.version,
        'apollographql-client-name': 'chromatic-cli',
        'apollographql-client-version': ctx.pkg.version,
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
  } catch (err) {
    return onError(err);
  }

  if (!isContext(ctx)) {
    return onError(new Error('Invalid context'));
  }

  // Run these in parallel; neither should ever reject
  await Promise.all([runBuild(ctx), checkForUpdates(ctx)]).catch((error) => {
    Sentry.captureException(error);
    onError(error);
  });

  if (!isE2EBuild(ctx.options) && [0, 1].includes(ctx.exitCode)) {
    await checkPackageJson(ctx);
  }

  if (ctx.options.diagnosticsFile) {
    await writeChromaticDiagnostics(ctx);
  }

  if (ctx.options.uploadMetadata) {
    await uploadMetadataFiles(ctx);
  }
}

// TODO: refactor this function
// eslint-disable-next-line complexity, max-statements
async function runBuild(ctx: Context) {
  try {
    try {
      // This is an `any` because any parameters set here will be passed in as `options` to the
      // `renderer` class. Therefore, `log` here isn't available on the Listr type but does make it
      // into the `renderer` constructor.
      const options: any = {
        log: ctx.log,
        renderer: NonTTYRenderer,
      };
      if (ctx.options.interactive) {
        // Use an enhanced version of Listr's default renderer, which also logs to a file
        options.renderer = LoggingRenderer;
        // Queue up any non-Listr log messages while Listr is running
        ctx.log.queue();
      }
      await new Listr(getTasks(ctx), options).run(ctx);
      ctx.log.debug('Tasks completed');
    } catch (err) {
      Sentry.captureException(err);
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
      if (
        (runtimeErrors && runtimeErrors.length > 0) ||
        (runtimeWarnings && runtimeWarnings.length > 0)
      ) {
        ctx.log.info('');
        ctx.log.error(runtimeError(ctx));
      }

      ctx.log.flush();
    }
  } catch (error) {
    const errors = [error].flat(); // GraphQLClient might throw an array of errors
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

export interface GitInfo {
  slug: string;
  branch: string;
  commit: string;
  committedAt: number;
  committerEmail: string;
  committerName: string;
  uncommittedHash: string;
  userEmail: string;
  userEmailHash: string;
  repositoryRootDir: string;
}

/**
 * Parse git information from the local repository.
 *
 * Although this function may not be used directly in this project, it can be used externally (such
 * as https://github.com/chromaui/addon-visual-tests).
 *
 * @returns Any git information we were able to gather.
 */
export async function getGitInfo(): Promise<GitInfo> {
  let slug: string;
  try {
    slug = await getSlug();
  } catch {
    slug = '';
  }
  const branch = (await getBranch()) || '';
  const commitInfo = await getCommit();
  const userEmail = (await getUserEmail()) || '';
  const userEmailHash = emailHash(userEmail);
  const repositoryRootDirectory = (await getRepositoryRoot()) || '';

  const [ownerName, repoName, ...rest] = slug ? slug.split('/') : [];
  const isValidSlug = !!ownerName && !!repoName && rest.length === 0;

  const uncommittedHash = (await getUncommittedHash()) || '';
  return {
    slug: isValidSlug ? slug : '',
    branch,
    ...commitInfo,
    uncommittedHash,
    userEmail,
    userEmailHash,
    repositoryRootDir: repositoryRootDirectory,
  };
}

export { getConfiguration } from './lib/getConfiguration';
export { Logger } from './lib/log';
