import { execaCommand } from 'execa';
import { createWriteStream, readFileSync } from 'fs';
import path from 'path';
import semver from 'semver';
import tmp from 'tmp-promise';

import { buildBinName as e2eBuildBinName, getE2EBuildCommand } from '../lib/e2e';
import { isE2EBuild } from '../lib/e2eUtils';
import { getPackageManagerRunCommand } from '../lib/getPackageManager';
import { exitCodes, setExitCode } from '../lib/setExitCode';
import { createTask, transitionTo } from '../lib/tasks';
import { Context } from '../types';
import { endActivity, startActivity } from '../ui/components/activity';
import buildFailed from '../ui/messages/errors/buildFailed';
import e2eBuildFailed from '../ui/messages/errors/e2eBuildFailed';
import missingDependency from '../ui/messages/errors/missingDependency';
import { failed, initial, pending, skipped, success } from '../ui/tasks/build';

export const setSourceDirectory = async (ctx: Context) => {
  if (ctx.options.outputDir) {
    ctx.sourceDir = ctx.options.outputDir;
  } else if (ctx.storybook && ctx.storybook.version && semver.lt(ctx.storybook.version, '5.0.0')) {
    // Storybook v4 doesn't support absolute paths like tmp.dir would yield
    ctx.sourceDir = 'storybook-static';
  } else {
    const temporaryDirectory = await tmp.dir({ unsafeCleanup: true, prefix: `chromatic-` });
    ctx.sourceDir = temporaryDirectory.path;
  }
};

// TODO: refactor this function
// eslint-disable-next-line complexity
export const setBuildCommand = async (ctx: Context) => {
  const webpackStatsSupported =
    ctx.storybook && ctx.storybook.version
      ? semver.gte(semver.coerce(ctx.storybook.version) || '0.0.0', '6.2.0')
      : true;

  if (ctx.git.changedFiles && !webpackStatsSupported) {
    ctx.log.warn('Storybook version 6.2.0 or later is required to use the --only-changed flag');
  }

  const buildCommand = ctx.flags.buildCommand || ctx.options.buildCommand;

  const buildCommandOptions = [
    // NOTE: There is a bug in NX that outputs an invalid Storybook if the `--output-dir` flag is
    // passed. Therefore, we need to skip that until it's fixed: https://github.com/nrwl/nx/issues/28594
    // When that's fixed, we can remove the `!buildCommand &&` below.
    !buildCommand && `--output-dir=${ctx.sourceDir}`,
    ctx.git.changedFiles && webpackStatsSupported && `--webpack-stats-json=${ctx.sourceDir}`,
  ].filter((c): c is string => !!c);

  if (buildCommand) {
    ctx.buildCommand = `${buildCommand} ${buildCommandOptions.join(' ')}`;
    return;
  }

  if (isE2EBuild(ctx.options)) {
    ctx.buildCommand = await getE2EBuildCommand(
      ctx,
      ctx.options.playwright ? 'playwright' : 'cypress',
      buildCommandOptions
    );
    return;
  }

  if (!ctx.options.buildScriptName) {
    throw new Error('Unable to determine build script');
  }

  ctx.buildCommand = await getPackageManagerRunCommand([
    ctx.options.buildScriptName,
    ...buildCommandOptions,
  ]);
};

const timeoutAfter = (ms) =>
  new Promise((_resolve, reject) => setTimeout(reject, ms, new Error(`Operation timed out`)));

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
  const flag = ctx.options.playwright ? 'playwright' : 'cypress';
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

export const buildStorybook = async (ctx: Context) => {
  let logFile;
  if (ctx.options.storybookLogFile) {
    ctx.buildLogFile = path.resolve(ctx.options.storybookLogFile);
    logFile = createWriteStream(ctx.buildLogFile);
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

    const subprocess = execaCommand(ctx.buildCommand, {
      stdio: [undefined, logFile, undefined],
      // When `true`, this will run in the node version set by the
      // action (node20), not the version set in the workflow
      preferLocal: false,
      signal,
      env: { CI: '1', NODE_ENV: ctx.env.STORYBOOK_NODE_ENV || 'production' },
    });
    await Promise.race([subprocess, timeoutAfter(ctx.env.STORYBOOK_BUILD_TIMEOUT)]);
  } catch (err) {
    // If we tried to run the E2E package's bin directly (due to being in the action)
    // and it failed, that means we couldn't find it. This probably means they haven't
    // installed the right dependency or run from the right directory
    if (isE2EBuild(ctx.options)) {
      const errorInfo = e2eBuildErrorMessage(err, process.cwd(), ctx);
      ctx.log.error(errorInfo.message);
      setExitCode(ctx, errorInfo.exitCode, true);
      throw new Error(failed(ctx).output);
    }

    signal?.throwIfAborted();

    const buildLog = ctx.buildLogFile && readFileSync(ctx.buildLogFile, 'utf8');
    ctx.log.error(buildFailed(ctx, err, buildLog));
    setExitCode(ctx, exitCodes.NPM_BUILD_STORYBOOK_FAILED, true);
    throw new Error(failed(ctx).output);
  } finally {
    logFile?.end();
  }
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
      endActivity,
      transitionTo(success, true),
    ],
  });
}
