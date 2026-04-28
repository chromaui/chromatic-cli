import 'any-observable/register/zen';

import Listr from 'listr';

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
import getOptions from './lib/getOptions';
import LoggingRenderer from './lib/loggingRenderer';
import NonTTYRenderer from './lib/nonTTYRenderer';
import { exitCodes, setExitCode } from './lib/setExitCode';
import { uploadMetadataFiles } from './lib/uploadMetadataFiles';
import { rewriteErrorMessage } from './lib/utilities';
import { writeChromaticDiagnostics } from './lib/writeChromaticDiagnostics';
import { ChromaticRun } from './run/chromaticRun';
import { RunResult } from './run/types';
import getTasks from './tasks';
import { Context, Flags, Options } from './types';
import { endActivity } from './ui/components/activity';
import buildCanceled from './ui/messages/errors/buildCanceled';
import fatalError from './ui/messages/errors/fatalError';
import fetchError from './ui/messages/errors/fetchError';
import graphqlError from './ui/messages/errors/graphqlError';
import missingStories from './ui/messages/errors/missingStories';
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

/**
 * @deprecated Pre-`getOptions` view of {@link Context}. Lives on for the
 * legacy {@link runAll} entry point and tests that hand-build a context;
 * `ChromaticRun` constructs the resolved Context internally so external
 * callers do not need this type. Will be removed in a future major version.
 */
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
    | 'ports'
  >,
  'options'
>;

const isContext = (ctx: InitialContext): ctx is Context => 'options' in ctx;

/**
 * Entry point for the CLI, GitHub Action, and Node API. Thin wrapper around
 * {@link ChromaticRun} that preserves the legacy {@link Output} shape for
 * external consumers. New callers should construct `ChromaticRun` directly and
 * read fields off the returned `RunResult`.
 *
 * @param args The arguments set by the environment in which the CLI is running (CLI, GitHub Action,
 * or Node API)
 * @param args.argv The list of arguments passed.
 * @param args.flags Any flags that were passed.
 * @param args.options Any options that were passed.
 *
 * @returns An object with details from the result of the new build.
 */
export async function run({
  argv,
  flags,
  options,
}: {
  argv?: string[];
  flags?: Flags;
  options?: Partial<Options>;
}): Promise<Partial<Output>> {
  const result = await new ChromaticRun({
    config: {
      ...(argv && { argv }),
      ...(flags && { flags }),
      ...legacyOptionsToConfig(options),
    },
  }).execute(options?.experimental_abortSignal);
  return projectOutput(result);
}

// Legacy `run({ options: Partial<Options> })` callers historically funnelled
// arbitrary options through `extraOptions`. The public `ChromaticConfig` no
// longer exposes that escape hatch, so translate the supported subset onto
// named fields. Unknown options are silently ignored — external consumers that
// pass anything beyond this list should migrate to a named field or the
// `ChromaticRun` constructor directly.
// eslint-disable-next-line complexity
function legacyOptionsToConfig(options: Partial<Options> | undefined) {
  if (!options) return {};
  return {
    ...(options.inAction !== undefined && { inAction: options.inAction }),
    ...(options.configFile !== undefined && { configFile: options.configFile }),
    ...(options.projectId !== undefined && { projectId: options.projectId }),
    ...(options.userToken !== undefined && { userToken: options.userToken }),
    ...(options.sessionId !== undefined && { sessionId: options.sessionId }),
    ...(options.env !== undefined && { env: options.env }),
    ...(options.log !== undefined && { log: options.log }),
    ...(options.experimental_onTaskStart && { onTaskStart: options.experimental_onTaskStart }),
    ...(options.experimental_onTaskComplete && {
      onTaskComplete: options.experimental_onTaskComplete,
    }),
    ...(options.experimental_onTaskProgress && {
      onTaskProgress: options.experimental_onTaskProgress,
    }),
    ...(options.experimental_onTaskError && { onTaskError: options.experimental_onTaskError }),
  };
}

// Keep this in sync with the configured outputs in action.yml.
// eslint-disable-next-line complexity
function projectOutput(result: RunResult): Partial<Output> {
  return {
    code: result.exitCode,
    url: result.build?.webUrl,
    buildUrl: result.build?.webUrl,
    storybookUrl: result.storybookUrl,
    specCount: result.build?.specCount,
    componentCount: result.build?.componentCount,
    testCount: result.build?.testCount,
    changeCount: result.build?.changeCount,
    errorCount: result.build?.errorCount,
    interactionTestFailuresCount: result.build?.interactionTestFailuresCount,
    actualTestCount: result.build?.actualTestCount,
    actualCaptureCount: result.build?.actualCaptureCount,
    inheritedCaptureCount: result.build?.inheritedCaptureCount,
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
    ctx.ports.errors.captureException(error);
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
      ctx.ports.errors.captureException(err);
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

      try {
        await ctx.ports.analytics.flush();
      } catch (error) {
        // Analytics shutdown should never crash the CLI, but we want to know about it
        ctx.ports.errors.captureException(error);
      }
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
 * @param ctx The context set when executing the CLI.
 *
 * @returns Any git information we were able to gather.
 */
export async function getGitInfo(ctx: Pick<Context, 'log'>): Promise<GitInfo> {
  let slug: string;
  try {
    slug = await getSlug(ctx);
  } catch {
    slug = '';
  }
  const branch = (await getBranch(ctx)) || '';
  const commitInfo = await getCommit(ctx);
  const userEmail = (await getUserEmail(ctx)) || '';
  const userEmailHash = emailHash(userEmail);
  const repositoryRootDirectory = (await getRepositoryRoot(ctx)) || '';

  const [ownerName, repoName, ...rest] = slug ? slug.split('/') : [];
  const isValidSlug = !!ownerName && !!repoName && rest.length === 0;

  const uncommittedHash = (await getUncommittedHash(ctx)) || '';
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
export { createLogger } from './lib/log';
export { type Logger } from './lib/log';
