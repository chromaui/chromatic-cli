import { AnalyticsEvent } from '@cli/analytics/events';
import * as Sentry from '@sentry/node';
import path from 'path';
import semver from 'semver';

import { sanitizeStackTrace } from '../lib/analytics/sanitization';
import { buildBinName as e2eBuildBinName, getE2EBuildCommand } from '../lib/e2e';
import { isE2EBuild } from '../lib/e2eUtils';
import { emailHash } from '../lib/emailHash';
import { generateManifest } from '../lib/react-native/generateManifest';
import { exitCodes, setExitCode } from '../lib/setExitCode';
import { createTask, transitionTo } from '../lib/tasks';
import { Context } from '../types';
import { endActivity, startActivity } from '../ui/components/activity';
import buildFailed from '../ui/messages/errors/buildFailed';
import e2eBuildFailed from '../ui/messages/errors/e2eBuildFailed';
import missingDependency from '../ui/messages/errors/missingDependency';
import missingStorybookBuildDirectory from '../ui/messages/errors/missingStorybookBuildDirectory';
import {
  failed,
  initial,
  missingBuildDirectoryForReactNative,
  pending,
  skipped,
  skippedForReactNative,
  success,
} from '../ui/tasks/build';

export const setSourceDirectory = async (ctx: Context) => {
  if (ctx.options.outputDir) {
    ctx.sourceDir = ctx.options.outputDir;
  } else if (ctx.storybook && ctx.storybook.version && semver.lt(ctx.storybook.version, '5.0.0')) {
    // Storybook v4 doesn't support absolute paths like tmp.dir would yield
    ctx.sourceDir = 'storybook-static';
  } else {
    const temporaryDirectory = await ctx.ports.fs.mkdtemp({
      unsafeCleanup: true,
      prefix: `chromatic-`,
    });
    ctx.sourceDir = temporaryDirectory.path;
  }
};

const isStatsFlagSupported = (ctx: Context) => {
  return ctx.storybook && ctx.storybook.version
    ? semver.gte(semver.coerce(ctx.storybook.version) || '0.0.0', '6.2.0')
    : true;
};

// Storybook 8.0.0 deprecated --webpack-stats-json in favor of --stats-json.
// However, the angular builder did not support it until 8.5.0
const getStatsFlag = (ctx: Context) => {
  return ctx?.storybook?.version &&
    semver.gte(semver.coerce(ctx.storybook.version) || '0.0.0', '8.5.0')
    ? '--stats-json'
    : '--webpack-stats-json';
};

export const setBuildCommand = async (ctx: Context) => {
  // We don't currently support building React Native Storybook so we'll skip this for now
  if (ctx.isReactNativeApp) {
    return;
  }

  const buildCommand = ctx.flags?.buildCommand || ctx.options.buildCommand;
  const buildCommandOptions: string[] = [];

  if (!buildCommand) {
    buildCommandOptions.push(`--output-dir=${ctx.sourceDir}`);
  }

  if (ctx.git.changedFiles) {
    if (isStatsFlagSupported(ctx)) {
      buildCommandOptions.push(`${getStatsFlag(ctx)}=${ctx.sourceDir}`);
    } else {
      ctx.log.warn('Storybook version 6.2.0 or later is required to use the --only-changed flag');
    }
  }

  if (buildCommand) {
    ctx.buildCommand = `${buildCommand} ${buildCommandOptions.join(' ')}`;
    return;
  }

  if (isE2EBuild(ctx.options)) {
    ctx.buildCommand = await getE2EBuildCommand(ctx, resolveE2EFramework(ctx), buildCommandOptions);
    return;
  }

  if (!ctx.options.buildScriptName) {
    throw new Error('Unable to determine build script');
  }

  ctx.buildCommand = await ctx.ports.pkgMgr.getRunCommand([
    ctx.options.buildScriptName,
    ...buildCommandOptions,
  ]);
};

function isE2EBuildCommandNotFoundError(errorMessage: string) {
  // It's hard to know if this is the case as each package manager has a different type of
  // error for this, but we'll try to figure it out.
  const ERROR_PATTERNS = [
    // `Command not found: build-archive-storybook`
    'command not found',
    // `Command "build-archive-storybook" not found`
    `[\\W]?${e2eBuildBinName}[\\W]? not found`,
    // npm not found error can include this code
    'code E404',
    // Exit code 127 is a generic not found exit code
    'exit code 127',
    // A single line error from execa like `Command failed: yarn build-archive-storybook ...`
    `command failed.*${e2eBuildBinName}.*$`,
  ];
  // eslint-disable-next-line security/detect-non-literal-regexp
  return ERROR_PATTERNS.some((PATTERN) => new RegExp(PATTERN, 'gi').test(errorMessage));
}

function e2eBuildErrorMessage(
  err,
  workingDirectory: string,
  ctx: Context
): { exitCode: number; message: string } {
  const flag = resolveE2EFramework(ctx);
  const errorMessage = err.message;

  // If we tried to run the E2E package's bin directly (due to being in the action)
  // and it failed, that means we couldn't find it. This probably means they haven't
  // installed the right dependency or run from the right directory.
  if (isE2EBuildCommandNotFoundError(errorMessage)) {
    const dependencyName = `@chromatic-com/${flag}`;
    return {
      exitCode: exitCodes.MISSING_DEPENDENCY,
      message: missingDependency({ dependencyName, flag, workingDir: workingDirectory }),
    };
  }

  return {
    exitCode: exitCodes.E2E_BUILD_FAILED,
    message: e2eBuildFailed({ flag, errorMessage }),
  };
}

async function handleBuildFailure(ctx: Context, err: any, signal?: AbortSignal): Promise<never> {
  if (isE2EBuild(ctx.options)) {
    // If we tried to run the E2E package's bin directly (due to being in the action)
    // and it failed, that means we couldn't find it. This probably means they haven't
    // installed the right dependency or run from the right directory
    const errorInfo = e2eBuildErrorMessage(err, process.cwd(), ctx);
    const errorCategory =
      errorInfo.exitCode === exitCodes.MISSING_DEPENDENCY
        ? 'e2e_missing_dependency'
        : 'e2e_build_failed';
    trackBuildFailure(ctx, errorCategory, err);
    ctx.log.error(errorInfo.message);
    setExitCode(ctx, errorInfo.exitCode, true);
    throw new Error(failed(ctx).output);
  }

  if (signal?.aborted) {
    trackBuildFailure(ctx, 'aborted', err);
    signal.throwIfAborted();
  }

  trackBuildFailure(ctx, 'storybook_build_failed', err);
  const buildLog = ctx.buildLogFile
    ? await ctx.ports.fs.readFile(ctx.buildLogFile, 'utf8').catch(() => undefined)
    : undefined;
  ctx.log.error(buildFailed(ctx, err, buildLog));
  setExitCode(ctx, exitCodes.NPM_BUILD_STORYBOOK_FAILED, true);
  throw new Error(failed(ctx).output);
}

function trackBuildFailure(ctx: Context, errorCategory: string, err: any) {
  try {
    ctx.analytics?.trackEvent(AnalyticsEvent.CLI_STORYBOOK_BUILD_FAILED, {
      errorCategory,
      stackTrace: sanitizeStackTrace(err?.stack),
      buildCommand: ctx.buildCommand,
      source: 'cli',
      cliVersion: ctx.pkg?.version,
      storybookVersion: ctx.storybook?.version,
      isCI: !!process.env.CI,
      ciService: ctx.git?.ciService,
      gitUserEmailHash: ctx.git?.gitUserEmail ? emailHash(ctx.git.gitUserEmail) : undefined, // avoid hashing empty string
    });
  } catch (error) {
    // Analytics should be best-effort, never fail the build, but we want to know about it
    Sentry.captureException(error);
  }
}

export const buildStorybook = async (ctx: Context) => {
  // We don't currently support building React Native projects so we'll skip this for now
  if (ctx.isReactNativeApp) {
    return;
  }

  let logFile;
  if (ctx.options.storybookLogFile) {
    ctx.buildLogFile = path.resolve(ctx.options.storybookLogFile);
    logFile = ctx.ports.fs.createWriteStream(ctx.buildLogFile);
    await new Promise((resolve, reject) => {
      logFile.on('open', resolve);
      logFile.on('error', reject);
    });
  }

  const { experimental_abortSignal: signal } = ctx.options;
  try {
    ctx.log.debug('Running build command:', ctx.buildCommand);
    ctx.log.debug('Runtime metadata:', JSON.stringify(ctx.runtimeMetadata, undefined, 2));

    if (!ctx.buildCommand) {
      throw new Error('No build command configured');
    }

    await ctx.ports.builder.build({
      command: ctx.buildCommand,
      outputDir: ctx.sourceDir,
      logStream: logFile,
      signal,
      timeoutMs: ctx.env.STORYBOOK_BUILD_TIMEOUT,
      env: {
        CI: '1',
        NODE_ENV: ctx.env.STORYBOOK_NODE_ENV || 'production',
        STORYBOOK_INVOKED_BY: 'chromatic',
      },
    });
  } catch (err) {
    await handleBuildFailure(ctx, err, signal);
  } finally {
    logFile?.end();
  }
};

export const generateManifestForReactNative = async (ctx: Context) => {
  // The manifest file is only needed for React Native builds
  if (!ctx.isReactNativeApp) {
    return;
  }

  ctx.log.debug('Generating manifest.json file for React Native build');
  return await generateManifest(ctx);
};

/**
 * Sets up the Listr task for building the user's Storybook or E2E project.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns A Listr task.
 */
export default function main(ctx: Context) {
  return createTask({
    name: 'build',
    title: initial(ctx).title,
    skip: async (ctx) => {
      if (ctx.skip) return true;
      if (ctx.isReactNativeApp) {
        if (!ctx.options.storybookBuildDir) {
          ctx.log.error(missingStorybookBuildDirectory(ctx.announcedBuild?.browsers));
          setExitCode(ctx, exitCodes.INVALID_OPTIONS, true);
          throw new Error(missingBuildDirectoryForReactNative(ctx).output);
        }

        ctx.sourceDir = ctx.options.storybookBuildDir;
        ctx.options.outputDir = ctx.options.storybookBuildDir;

        // Use manifest.json from the storybook build directory if it exists
        if (
          await ctx.ports.fs.exists(path.resolve(ctx.options.storybookBuildDir, 'manifest.json'))
        ) {
          return skippedForReactNative(ctx).output;
        }
        return false;
      }
      if (ctx.options.storybookBuildDir) {
        ctx.sourceDir = ctx.options.storybookBuildDir;
        return skipped(ctx).output;
      }
      return false;
    },
    steps: [
      setSourceDirectory,
      setBuildCommand,
      transitionTo(pending),
      startActivity,
      buildStorybook,
      generateManifestForReactNative,
      endActivity,
      transitionTo(success, true),
    ],
  });
}

function resolveE2EFramework(ctx: Context) {
  if (ctx.options.playwright) {
    return 'playwright';
  }

  if (ctx.options.vitest) {
    return 'vitest';
  }

  return 'cypress';
}
