import 'any-observable/register/zen';

import * as Sentry from '@sentry/node';
import Listr from 'listr';
import { readPackageUp } from 'read-package-up';
import { v4 as uuid } from 'uuid';

import { setupContext } from './context';
import getCommitAndBranch from './git/getCommitAndBranch';
import {
  getBranch,
  getCommit,
  getRepositoryRoot,
  getSlug,
  getUncommittedHash,
  getUserEmail,
} from './git/git';
import checkForUpdates from './lib/checkForUpdates';
import checkNodeVersion from './lib/checkNodeVersion';
import checkPackageJson from './lib/checkPackageJson';
import { isE2EBuild } from './lib/e2eUtils';
import { emailHash } from './lib/emailHash';
import getEnvironment from './lib/getEnvironment';
import getOptions, { DEFAULT_DIAGNOSTICS_FILE, getPartialOptions } from './lib/getOptions';
import { createLogger } from './lib/log';
import LoggingRenderer from './lib/loggingRenderer';
import matchesBranch from './lib/matchesBranch';
import NonTTYRenderer from './lib/nonTTYRenderer';
import parseArguments from './lib/parseArguments';
import { exitCodes, setExitCode } from './lib/setExitCode';
import { uploadMetadataFiles } from './lib/uploadMetadataFiles';
import { rewriteErrorMessage } from './lib/utilities';
import {
  removeChromaticDiagnostics,
  writeChromaticDiagnostics,
} from './lib/writeChromaticDiagnostics';
import { intro as clackIntro } from './renderer';
import { renderAuth } from './renderer/auth';
import { renderGitInfo } from './renderer/gitInfo';
import { renderStorybookInfo } from './renderer/storybookInfo';
import getTasks from './tasks';
import { Context, Flags, Options } from './types';
import { endActivity } from './ui/components/activity';
import buildCanceled from './ui/messages/errors/buildCanceled';
import fatalError from './ui/messages/errors/fatalError';
import fetchError from './ui/messages/errors/fetchError';
import graphqlError from './ui/messages/errors/graphqlError';
import missingStories from './ui/messages/errors/missingStories';
import noPackageJson from './ui/messages/errors/noPackageJson';
import runtimeError from './ui/messages/errors/runtimeError';
import taskError from './ui/messages/errors/taskError';
import intro from './ui/messages/info/intro';
import skipNoProjectToken from './ui/messages/warnings/skipNoProjectToken';

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
  'options' | 'runtime'
>;

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

  checkNodeVersion(log, config.pkg.engines?.node);

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
    url: ctx.build?.webUrl ?? ctx.rebuildForBuild?.webUrl,
    buildUrl: ctx.build?.webUrl ?? ctx.rebuildForBuild?.webUrl,
    storybookUrl: ctx.build?.storybookUrl || ctx.storybookUrl,
    specCount: ctx.build?.specCount ?? ctx.rebuildForBuild?.specCount,
    componentCount: ctx.build?.componentCount ?? ctx.rebuildForBuild?.componentCount,
    testCount: ctx.build?.testCount ?? ctx.rebuildForBuild?.testCount,
    changeCount: ctx.build?.changeCount ?? ctx.rebuildForBuild?.changeCount,
    errorCount: ctx.build?.errorCount ?? ctx.rebuildForBuild?.errorCount,
    interactionTestFailuresCount:
      ctx.build?.interactionTestFailuresCount ?? ctx.rebuildForBuild?.interactionTestFailuresCount,
    actualTestCount: ctx.build?.actualTestCount ?? ctx.rebuildForBuild?.actualTestCount,
    actualCaptureCount: ctx.build?.actualCaptureCount ?? ctx.rebuildForBuild?.actualCaptureCount,
    inheritedCaptureCount:
      ctx.build?.inheritedCaptureCount ?? ctx.rebuildForBuild?.inheritedCaptureCount,
  };
}

/**
 * Entry point for testing only (typically invoked via `run` above)
 *
 * @param initialContext The context set when executing the CLI.
 *
 * @returns A promise that resolves when all steps are completed.
 */
// TODO: refactor this function
// eslint-disable-next-line complexity
export async function runAll(initialContext: InitialContext) {
  const onError = (err: Error | Error[]) => {
    initialContext.log.info('');
    initialContext.log.error(fatalError(initialContext, [err].flat()));
    initialContext.extraOptions?.experimental_onTaskError?.(initialContext, {
      formattedError: fatalError(initialContext, [err].flat()),
      originalError: err,
    });
    setExitCode(initialContext, exitCodes.INVALID_OPTIONS, true);
  };

  let ctx: Context;
  try {
    initialContext = await setupContext(
      initialContext,
      initialContext.extraOptions?.configFile || initialContext.flags.configFile
    );

    const partialOptions = getPartialOptions(initialContext);
    if (partialOptions.interactive) {
      clackIntro(initialContext);
      initialContext.log.file(intro(initialContext)); // noop if file logging not enabled
    } else {
      initialContext.log.info(intro(initialContext));
    }

    if (await shouldSkipWithoutProjectToken(initialContext, partialOptions)) {
      initialContext.log.warn(skipNoProjectToken());
      setExitCode(initialContext, exitCodes.OK);
      return;
    }

    ctx = initialContext as Context;
    ctx.options = getOptions(ctx, partialOptions);
    ctx.runtime = { forceRebuild: ctx.options.forceRebuild };
    ctx.log.setLogFile(ctx.options.logFile);

    setExitCode(ctx, exitCodes.OK);
  } catch (err) {
    return onError(err);
  }

  // Run these in parallel; neither should ever reject
  await Promise.all([runBuild(ctx), checkForUpdates(ctx)]).catch((error) => {
    Sentry.captureException(error);
    onError(error);
  });

  if (shouldWriteDiagnosticsFile(ctx)) {
    // Ensure we set the diagnostic file output location (in the case of `uploadMetadata` but no
    // diagnostic file was set)
    ctx.options.diagnosticsFile ??= DEFAULT_DIAGNOSTICS_FILE;
    await writeChromaticDiagnostics(ctx);
  }

  if (shouldUploadMetadata(ctx)) {
    if (ctx.options.uploadMetadata === undefined && isTurboSnapEnabled(ctx)) {
      ctx.log.info('Uploading metadata files automatically because TurboSnap was enabled');
    }
    await uploadMetadataFiles(ctx);
  }

  cleanupTemporaryFiles(ctx);

  if (!isE2EBuild(ctx.options) && [0, 1].includes(ctx.exitCode)) {
    await checkPackageJson(ctx);
  }
}

/**
 * Remove the log and diagnostics files we wrote during the run, unless they were explicitly
 * configured (or persisted via --debug). This avoids leaving behind files we only created to
 * upload as metadata.
 *
 * @param ctx The context set when executing the CLI.
 */
function cleanupTemporaryFiles(ctx: Context) {
  if (ctx.options.logFile && !ctx.options.persistLogFile) {
    ctx.log.removeLogFile();
  }
  if (ctx.options.diagnosticsFile && !ctx.options.persistDiagnosticsFile) {
    removeChromaticDiagnostics(ctx);
  }
}

function shouldWriteDiagnosticsFile(ctx: Context): boolean {
  return !!ctx.options.diagnosticsFile || shouldUploadMetadata(ctx);
}

/**
 * Decide whether to upload metadata files. An explicit --upload-metadata /
 * --no-upload-metadata always wins. Otherwise we default to uploading when
 * TurboSnap was enabled.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns True if metadata files should be uploaded.
 */
export function shouldUploadMetadata(ctx: Context): boolean {
  // Don't upload if we don't have a valid URL to S3
  if (!ctx.build?.storybookUrl) {
    return false;
  }

  return ctx.options.uploadMetadata ?? isTurboSnapEnabled(ctx);
}

function isTurboSnapEnabled(ctx: Context): boolean {
  return !!ctx.turboSnap;
}

async function shouldSkipWithoutProjectToken(
  ctx: InitialContext,
  partialOptions: Partial<Options>
) {
  if (!partialOptions.skip) {
    return false;
  }

  const hasProjectCredentials =
    !!partialOptions.projectToken || !!(partialOptions.projectId && partialOptions.userToken);
  if (hasProjectCredentials) {
    return false;
  }

  const branch = await getBranchForSkip(ctx, partialOptions);
  if (!branch) {
    return false;
  }

  if (!matchesBranch(branch, partialOptions.skip)) {
    return false;
  }

  return true;
}

async function getBranchForSkip(ctx: InitialContext, partialOptions: Partial<Options>) {
  try {
    const { branch } = await getCommitAndBranch(ctx, {
      branchName: partialOptions.branchName,
      patchBaseRef: partialOptions.patchBaseRef,
      ci: partialOptions.fromCI,
    });

    return branch;
  } catch (err) {
    ctx.log.debug('Failed to determine branch while handling --skip without a project token', err);
    return false;
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
      await renderAuth(ctx);
      await renderGitInfo(ctx);
      await renderStorybookInfo(ctx);
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

      try {
        await ctx.analytics?.shutdown();
      } catch (error) {
        // Analytics shutdown should never crash the CLI, but we want to know about it
        Sentry.captureException(error);
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
export { share, type ShareOptions, type ShareOutput } from './share';
