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
import { confirmShare, ConfirmShareStatus, reserveShareOnAPI } from './lib/share';
import { uploadMetadataFiles } from './lib/uploadMetadataFiles';
import { rewriteErrorMessage } from './lib/utilities';
import { writeChromaticDiagnostics } from './lib/writeChromaticDiagnostics';
import getTasks, { runShareBuild } from './tasks';
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

async function setupContext(ctx: InitialContext, configFile?: string): Promise<Context> {
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
  ctx.configuration = await getConfiguration(configFile);
  const options = getOptions(ctx);
  (ctx as Context).options = options;
  ctx.log.setLogFile(options.logFile);

  return ctx as Context;
}

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
export async function runAll(initialContext: InitialContext) {
  initialContext.log.info('');
  initialContext.log.info(intro(initialContext));
  initialContext.log.info('');

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
    ctx = await setupContext(
      initialContext,
      initialContext.extraOptions?.configFile || initialContext.flags.configFile
    );
    setExitCode(ctx, exitCodes.OK);
  } catch (err) {
    return onError(err);
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

export interface ShareOptions {
  userToken: string;
  onUrl?: (url: string) => void;
  onProgress?: (progress: number, total: number) => void;
  onError?: (error: Error) => void;
  abortSignal?: AbortSignal;
}

export interface ShareOutput {
  shareUrl: string;
}

/**
 * Share a Storybook without creating a full Chromatic build.
 * Reserves a share URL, runs the upload pipeline, and resolves when the upload is complete.
 *
 * @param shareOptions Options for the share operation.
 * @param shareOptions.userToken The user token for authentication.
 * @param shareOptions.onUrl Callback fired as soon as the share URL is reserved.
 * @param shareOptions.onProgress Callback reporting upload progress as (bytesUploaded, totalBytes).
 * @param shareOptions.onError Callback for errors. When provided, share() resolves instead of rejecting.
 * @param shareOptions.abortSignal An AbortSignal to cancel the share operation.
 *
 * @returns An object with the share URL.
 */
// eslint-disable-next-line complexity
export async function share(shareOptions: ShareOptions): Promise<ShareOutput> {
  const { onUrl, onError } = shareOptions;

  let ctx: Context;
  try {
    ctx = await setupShareContext(shareOptions);
  } catch (error) {
    if (onError) {
      onError(error);
      return { shareUrl: '' };
    }
    throw error;
  }

  try {
    ctx.share = await reserveShareOnAPI(ctx);
    ctx.git = { branch: '', commit: '', committedAt: 0, fromCI: false };

    onUrl?.(ctx.share.shareUrl);

    let status: ConfirmShareStatus = 'complete';
    try {
      await runShareTasks(ctx);
    } catch (error) {
      status = ctx.options.experimental_abortSignal?.aborted ? 'cancelled' : 'error';
      throw error;
    } finally {
      await reportShareStatus(ctx, status);
    }
  } catch (error) {
    // If a callback was provided, use that then resolve
    if (onError) {
      onError(error);
      return { shareUrl: ctx.share?.shareUrl ?? '' };
    }
    throw error;
  }

  return { shareUrl: ctx.share?.shareUrl ?? '' };
}

async function reportShareStatus(ctx: Context, status: ConfirmShareStatus) {
  try {
    await confirmShare(ctx, status);
  } catch (error) {
    ctx.log.warn(`Failed to confirm share status (${status}): ${error.message}`);
  }
}

async function setupShareContext(shareOptions: ShareOptions): Promise<Context> {
  const { userToken, onProgress, abortSignal } = shareOptions;

  const extraOptions: Partial<Options> = {
    userToken,
    ...(abortSignal && { experimental_abortSignal: abortSignal }),
    ...(onProgress && {
      experimental_onTaskProgress: (_ctx: Context, status: { progress: number; total: number }) => {
        onProgress(status.progress, status.total);
      },
    }),
  };
  const config = {
    ...parseArguments([]),
    extraOptions,
  };

  const log = createLogger(config.flags, extraOptions);

  const packageInfo = await readPackageUp({ cwd: process.cwd(), normalize: false });
  if (!packageInfo) {
    throw new Error('No package.json found');
  }

  const { path: packagePath, packageJson } = packageInfo;
  const initialContext: InitialContext = {
    ...config,
    flags: {
      ...config.flags,
      interactive: false,
    },
    packagePath,
    packageJson,
    env: getEnvironment(),
    log,
    sessionId: uuid(),
  };

  return setupContext(initialContext);
}

async function runShareTasks(ctx: Context): Promise<void> {
  const listrOptions: any = {
    log: ctx.log,
    renderer: NonTTYRenderer,
  };

  try {
    await new Listr(
      runShareBuild.map((task) => task(ctx)),
      listrOptions
    ).run(ctx);
    ctx.log.debug('Tasks completed');
  } finally {
    endActivity(ctx);
    ctx.log.flush();
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
export { createLogger, Logger } from './lib/log';
