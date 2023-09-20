import execa from 'execa';
import fs from 'fs-extra';
import path from 'path';
import semver from 'semver';
import tmp from 'tmp-promise';

import { exitCodes, setExitCode } from '../lib/setExitCode';
import { createTask, transitionTo } from '../lib/tasks';
import { Context } from '../types';
import { endActivity, startActivity } from '../ui/components/activity';
import buildFailed from '../ui/messages/errors/buildFailed';
import { failed, initial, pending, skipped, success } from '../ui/tasks/build';
import { getPackageManagerName, getPackageManagerRunCommand } from '../lib/getPackageManager';

const trimOutput = ({ stdout }) => stdout && stdout.toString().trim();

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

export const setSpawnParams = async (ctx) => {
  const webpackStatsSupported =
    ctx.storybook && ctx.storybook.version
      ? semver.gte(semver.coerce(ctx.storybook.version), '6.2.0')
      : true;
  if (ctx.git.changedFiles && !webpackStatsSupported) {
    ctx.log.warn('Storybook version 6.2.0 or later is required to use the --only-changed flag');
  }

  const client = await getPackageManagerName();
  const clientVersion = await execa(client, ['--version']).then(trimOutput);
  const nodeVersion = await execa('node', ['--version']).then(trimOutput);

  const command = await getPackageManagerRunCommand(
    [
      ctx.options.buildScriptName,
      '--output-dir',
      ctx.sourceDir,
      ctx.git.changedFiles && webpackStatsSupported && '--webpack-stats-json',
      ctx.git.changedFiles && webpackStatsSupported && ctx.sourceDir,
    ].filter(Boolean)
  );

  ctx.spawnParams = {
    client,
    clientVersion,
    nodeVersion,
    platform: process.platform,
    command,
  };
};

const timeoutAfter = (ms) =>
  new Promise((resolve, reject) => setTimeout(reject, ms, new Error(`Operation timed out`)));

export const buildStorybook = async (ctx: Context) => {
  ctx.buildLogFile = path.resolve('./build-storybook.log');
  const logFile = fs.createWriteStream(ctx.buildLogFile);
  await new Promise((resolve, reject) => {
    logFile.on('open', resolve);
    logFile.on('error', reject);
  });

  const { experimental_abortSignal: abortSignal } = ctx.extraOptions;

  try {
    const { command } = ctx.spawnParams;
    ctx.log.debug('Using spawnParams:', JSON.stringify(ctx.spawnParams, null, 2));

    let subprocess;
    if (abortSignal) {
      abortSignal.onabort = () => {
        subprocess?.kill('SIGTERM', { forceKillAfterTimeout: 2000 });
      };
    }
    subprocess = execa.command(command, { stdio: [null, logFile, logFile] });
    await Promise.race([subprocess, timeoutAfter(ctx.env.STORYBOOK_BUILD_TIMEOUT)]);
  } catch (e) {
    endActivity(ctx);
    abortSignal?.throwIfAborted();

    const buildLog = fs.readFileSync(ctx.buildLogFile, 'utf8');
    ctx.log.error(buildFailed(ctx, e, buildLog));
    setExitCode(ctx, exitCodes.NPM_BUILD_STORYBOOK_FAILED, true);
    throw new Error(failed(ctx).output);
  } finally {
    logFile.end();
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
    setSpawnParams,
    transitionTo(pending),
    startActivity,
    buildStorybook,
    endActivity,
    transitionTo(success, true),
  ],
});
