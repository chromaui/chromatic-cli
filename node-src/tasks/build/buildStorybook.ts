import { AnalyticsEvent } from '@cli/analytics/events';
import * as Sentry from '@sentry/node';
import { readFileSync } from 'fs';
import path from 'path';

import { sanitizeStackTrace } from '../../lib/analytics/sanitization';
import { buildBinName as e2eBuildBinName } from '../../lib/e2e';
import { isE2EBuild } from '../../lib/e2eUtils';
import { emailHash } from '../../lib/emailHash';
import { openLogFileStream } from '../../lib/logFile';
import { exitCodes, setExitCode } from '../../lib/setExitCode';
import { runCommand } from '../../lib/shell/shell';
import { Context } from '../../types';
import { buildFailed } from '../../ui/messages/errors/buildFailed';
import e2eBuildFailed from '../../ui/messages/errors/e2eBuildFailed';
import missingDependency from '../../ui/messages/errors/missingDependency';
import { failed } from '../../ui/tasks/build';
import { resolveE2EFramework } from './resolveE2EFramework';

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

function handleBuildFailure(ctx: Context, err: any, signal?: AbortSignal): never {
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
  const buildLog = ctx.buildLogFile && readFileSync(ctx.buildLogFile, 'utf8');
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
  let logFile;
  if (ctx.options.storybookLogFile) {
    ctx.buildLogFile = path.resolve(ctx.options.storybookLogFile);
    logFile = await openLogFileStream(ctx.buildLogFile);
  }

  const { experimental_abortSignal: signal } = ctx.options;
  try {
    ctx.log.debug('Running build command:', ctx.buildCommand);
    ctx.log.debug('Runtime metadata:', JSON.stringify(ctx.runtimeMetadata, undefined, 2));

    if (!ctx.buildCommand) {
      throw new Error('No build command configured');
    }

    await runCommand(ctx.buildCommand, {
      stdio: [undefined, logFile, undefined],
      // When `true`, this will run in the node version set by the
      // action (node20), not the version set in the workflow
      preferLocal: false,
      cancelSignal: signal,
      timeout: ctx.env.STORYBOOK_BUILD_TIMEOUT,
      env: {
        CI: '1',
        NODE_ENV: ctx.env.STORYBOOK_NODE_ENV || 'production',
        STORYBOOK_INVOKED_BY: 'chromatic',
      },
    });
  } catch (err) {
    handleBuildFailure(ctx, err, signal);
  } finally {
    logFile?.end();
  }
};
