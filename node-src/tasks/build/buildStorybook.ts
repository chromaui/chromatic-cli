import { AnalyticsEvent } from '@cli/analytics/events';
import * as Sentry from '@sentry/node';
import { readFileSync } from 'fs';
import path from 'path';

import { sanitizeStackTrace } from '../../lib/analytics/sanitization';
import { buildBinName as e2eBuildBinName } from '../../lib/e2e';
import { isE2EBuild } from '../../lib/e2eUtils';
import { emailHash } from '../../lib/emailHash';
import { openLogFileStream } from '../../lib/logFile';
import { exitCodes, TaskFailure } from '../../lib/setExitCode';
import { runCommand } from '../../lib/shell/shell';
import { Context, Deps } from '../../types';
import { buildFailed } from '../../ui/messages/errors/buildFailed';
import e2eBuildFailed from '../../ui/messages/errors/e2eBuildFailed';
import missingDependency from '../../ui/messages/errors/missingDependency';
import { resolveE2EFramework } from './resolveE2EFramework';

type BuildStorybookDeps = Pick<Deps, 'options' | 'log' | 'env' | 'analytics' | 'pkg'>;

interface BuildStorybookInput {
  buildCommand?: string;
  runtimeMetadata?: Context['runtimeMetadata'];
  storybook?: Context['storybook'];
  git: Context['git'];
}

interface BuildStorybookOutput {
  buildLogFile?: string;
}

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
  options: Context['options']
): { exitCode: number; message: string } {
  const flag = resolveE2EFramework(options);
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

function handleBuildFailure(
  deps: BuildStorybookDeps,
  input: BuildStorybookInput,
  err: any,
  buildLogFile?: string,
  signal?: AbortSignal
): never {
  if (isE2EBuild(deps.options)) {
    // If we tried to run the E2E package's bin directly (due to being in the action)
    // and it failed, that means we couldn't find it. This probably means they haven't
    // installed the right dependency or run from the right directory
    const errorInfo = e2eBuildErrorMessage(err, process.cwd(), deps.options);
    const errorCategory =
      errorInfo.exitCode === exitCodes.MISSING_DEPENDENCY
        ? 'e2e_missing_dependency'
        : 'e2e_build_failed';
    trackBuildFailure(deps, input, errorCategory, err);
    deps.log.error(errorInfo.message);
    throw new TaskFailure(`Command failed: ${input.buildCommand}`, {
      exitCode: errorInfo.exitCode,
      userError: true,
    });
  }

  if (signal?.aborted) {
    trackBuildFailure(deps, input, 'aborted', err);
    signal.throwIfAborted();
  }

  trackBuildFailure(deps, input, 'storybook_build_failed', err);
  const buildLog = buildLogFile && readFileSync(buildLogFile, 'utf8');
  deps.log.error(
    buildFailed(
      {
        options: deps.options,
        buildCommand: input.buildCommand,
        buildLogFile,
        runtimeMetadata: input.runtimeMetadata,
      },
      err,
      buildLog
    )
  );
  throw new TaskFailure(`Command failed: ${input.buildCommand}`, {
    exitCode: exitCodes.NPM_BUILD_STORYBOOK_FAILED,
    userError: true,
  });
}

function trackBuildFailure(
  deps: BuildStorybookDeps,
  input: BuildStorybookInput,
  errorCategory: string,
  err: any
) {
  try {
    deps.analytics?.trackEvent(AnalyticsEvent.CLI_STORYBOOK_BUILD_FAILED, {
      errorCategory,
      stackTrace: sanitizeStackTrace(err?.stack),
      buildCommand: input.buildCommand,
      source: 'cli',
      cliVersion: deps.pkg?.version,
      storybookVersion: input.storybook?.version,
      isCI: !!process.env.CI,
      ciService: input.git?.ciService,
      gitUserEmailHash: input.git?.gitUserEmail ? emailHash(input.git.gitUserEmail) : undefined, // avoid hashing empty string
    });
  } catch (error) {
    // Analytics should be best-effort, never fail the build, but we want to know about it
    Sentry.captureException(error);
  }
}

export const buildStorybook = async (
  deps: BuildStorybookDeps,
  input: BuildStorybookInput
): Promise<BuildStorybookOutput> => {
  let logFile;
  let buildLogFile: string | undefined;
  if (deps.options.storybookLogFile) {
    buildLogFile = path.resolve(deps.options.storybookLogFile);
    logFile = await openLogFileStream(buildLogFile);
  }

  const { experimental_abortSignal: signal } = deps.options;
  try {
    deps.log.debug('Running build command:', input.buildCommand);
    deps.log.debug('Runtime metadata:', JSON.stringify(input.runtimeMetadata, undefined, 2));

    if (!input.buildCommand) {
      throw new Error('No build command configured');
    }

    await runCommand(input.buildCommand, {
      stdio: [undefined, logFile, undefined],
      // When `true`, this will run in the node version set by the
      // action (node20), not the version set in the workflow
      preferLocal: false,
      cancelSignal: signal,
      timeout: deps.env.STORYBOOK_BUILD_TIMEOUT,
      env: {
        CI: '1',
        NODE_ENV: deps.env.STORYBOOK_NODE_ENV || 'production',
        STORYBOOK_INVOKED_BY: 'chromatic',
      },
    });
  } catch (err) {
    handleBuildFailure(deps, input, err, buildLogFile, signal);
  } finally {
    logFile?.end();
  }

  return { buildLogFile };
};
