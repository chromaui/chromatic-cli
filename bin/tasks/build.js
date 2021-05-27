import execa from 'execa';
import fs from 'fs-extra';
import path from 'path';
import semver from 'semver';
import tmp from 'tmp-promise';

import { createTask, transitionTo } from '../lib/tasks';
import buildFailed from '../ui/messages/errors/buildFailed';
import { failed, initial, pending, skipped, success } from '../ui/tasks/build';

const trimOutput = ({ stdout }) => stdout && stdout.toString().trim();

export const setSourceDir = async (ctx) => {
  if (ctx.options.outputDir) {
    ctx.sourceDir = ctx.options.outputDir;
  } else if (semver.lt(ctx.storybook.version, '5.0.0')) {
    // Storybook v4 doesn't support absolute paths like tmp.dir would yield
    ctx.sourceDir = 'storybook-static';
  } else {
    const tmpDir = await tmp.dir({ unsafeCleanup: true, prefix: `chromatic-` });
    ctx.sourceDir = tmpDir.path;
  }
};

export const setSpawnParams = async (ctx) => {
  const webpackStatsSupported = semver.gte(semver.coerce(ctx.storybook.version), '6.2.0');
  if (ctx.git.changedFiles && !webpackStatsSupported) {
    ctx.log.warn('Storybook version 6.2.0 or later is required to use the --only-changed flag');
  }

  // Run either:
  //   node path/to/npm-cli.js run build-storybook
  //   node path/to/yarn.js run build-storybook
  //   npm run build-storybook
  // Based on https://github.com/mysticatea/npm-run-all/blob/52eaf86242ba408dedd015f53ca7ca368f25a026/lib/run-task.js#L156-L174
  const npmExecPath = process.env.npm_execpath;
  const npmExecFile = npmExecPath && path.basename(npmExecPath);
  const isJsPath = npmExecFile && /\.m?js$/.test(npmExecFile);
  const isYarn = npmExecFile && npmExecFile.includes('yarn');
  const isNpx = npmExecFile && npmExecFile.includes('npx');

  const client = isYarn ? 'yarn' : 'npm';
  const clientVersion = await execa(client, ['--version']).then(trimOutput);
  const nodeVersion = await execa('node', ['--version']).then(trimOutput);

  ctx.spawnParams = {
    client,
    clientVersion,
    nodeVersion,
    platform: process.platform,
    command: (!isNpx && (isJsPath ? process.execPath : npmExecPath)) || 'npm',
    clientArgs: !isNpx && isJsPath ? [npmExecPath, 'run'] : ['run', '--silent'],
    scriptArgs: [
      ctx.options.buildScriptName,
      isYarn ? '' : '--',
      '--output-dir',
      ctx.sourceDir,
      ctx.git.changedFiles && webpackStatsSupported && '--webpack-stats-json',
      ctx.git.changedFiles && webpackStatsSupported && ctx.sourceDir,
    ].filter(Boolean),
  };
};

const timeoutAfter = (ms) =>
  new Promise((resolve, reject) => setTimeout(reject, ms, new Error(`Operation timed out`)));

export const buildStorybook = async (ctx) => {
  ctx.buildLogFile = path.resolve('./build-storybook.log');
  const logFile = fs.createWriteStream(ctx.buildLogFile);
  await new Promise((resolve, reject) => {
    logFile.on('open', resolve);
    logFile.on('error', reject);
  });

  try {
    const { command, clientArgs, scriptArgs } = ctx.spawnParams;
    ctx.log.debug('Using spawnParams:', JSON.stringify(ctx.spawnParams, null, 2));
    await Promise.race([
      execa(command, [...clientArgs, ...scriptArgs], { stdio: [null, logFile, logFile] }),
      timeoutAfter(ctx.env.STORYBOOK_BUILD_TIMEOUT),
    ]);
  } catch (e) {
    const buildLog = fs.readFileSync(ctx.buildLogFile, 'utf8');
    ctx.log.error(buildFailed(ctx, e, buildLog));
    ctx.exitCode = 201;
    ctx.userError = true;
    throw new Error(failed(ctx).output);
  } finally {
    logFile.end();
  }
};

export default createTask({
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
    buildStorybook,
    transitionTo(success, true),
  ],
});
