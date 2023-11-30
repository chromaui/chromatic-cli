import { execaCommand } from 'execa';
import { createWriteStream, readFileSync } from 'fs';
import path from 'path';
import semver from 'semver';
import tmp from 'tmp-promise';

import { exitCodes, setExitCode } from '../lib/setExitCode';
import { createTask, transitionTo } from '../lib/tasks';
import { Context } from '../types';
import { endActivity, startActivity } from '../ui/components/activity';
import buildFailed from '../ui/messages/errors/buildFailed';
import { failed, initial, pending, skipped, success } from '../ui/tasks/build';
import { getPackageManagerRunCommand } from '../lib/getPackageManager';

export const setSourceDir = async (ctx: Context) => {
  if (ctx.options.outputDir) {
    ctx.sourceDir = ctx.options.outputDir;
  } else if (ctx.storybook && ctx.storybook.version && semver.lt(ctx.storybook.version, '5.0.0')) {
    // Storybook v4 doesn't support absolute paths like tmp.dir would yield
    ctx.sourceDir = 'storybook-static';
  } else {
    const tmpDir = await tmp.dir({ unsafeCleanup: true, prefix: `chromatic-` });
    ctx.sourceDir = tmpDir.path;
  }
};

export const setBuildCommand = async (ctx: Context) => {
  const webpackStatsSupported =
    ctx.storybook && ctx.storybook.version
      ? semver.gte(semver.coerce(ctx.storybook.version), '6.2.0')
      : true;

  if (ctx.git.changedFiles && !webpackStatsSupported) {
    ctx.log.warn('Storybook version 6.2.0 or later is required to use the --only-changed flag');
  }

  ctx.buildCommand = await getPackageManagerRunCommand(
    [
      ctx.options.buildScriptName,
      '--output-dir',
      ctx.sourceDir,
      ctx.git.changedFiles && webpackStatsSupported && '--webpack-stats-json',
      ctx.git.changedFiles && webpackStatsSupported && ctx.sourceDir,
    ].filter(Boolean)
  );
};

const timeoutAfter = (ms) =>
  new Promise((resolve, reject) => setTimeout(reject, ms, new Error(`Operation timed out`)));

export const buildStorybook = async (ctx: Context) => {
  let logFile = null;
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
    ctx.log.debug('Runtime metadata:', JSON.stringify(ctx.runtimeMetadata, null, 2));

    const subprocess = execaCommand(ctx.buildCommand, {
      stdio: [null, logFile, logFile],
      signal,
      env: { NODE_ENV: 'production' },
    });
    await Promise.race([subprocess, timeoutAfter(ctx.env.STORYBOOK_BUILD_TIMEOUT)]);
  } catch (e) {
    signal?.throwIfAborted();

    const buildLog = ctx.buildLogFile && readFileSync(ctx.buildLogFile, 'utf8');
    ctx.log.error(buildFailed(ctx, e, buildLog));
    setExitCode(ctx, exitCodes.NPM_BUILD_STORYBOOK_FAILED, true);
    throw new Error(failed(ctx).output);
  } finally {
    logFile?.end();
  }
};

export default createTask({
  name: 'build',
  title: initial.title,
  skip: async (ctx) => {
    if (ctx.skip) return true;
    if (ctx.options.storybookBuildDir) {
      ctx.sourceDir = ctx.options.storybookBuildDir;
      return skipped(ctx).output;
    }
    return false;
  },
  steps: [
    setSourceDir,
    setBuildCommand,
    transitionTo(pending),
    startActivity,
    buildStorybook,
    endActivity,
    transitionTo(success, true),
  ],
});
