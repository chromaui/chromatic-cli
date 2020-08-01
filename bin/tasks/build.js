import execa from 'execa';
import fs from 'fs';
import path from 'path';
import semver from 'semver';
import tmp from 'tmp-promise';

import { createTask, transitionTo } from '../lib/tasks';
import buildFailed from '../ui/messages/errors/buildFailed';
import { initial, pending, skipped, success } from '../ui/tasks/build';

export const setSourceDir = async ctx => {
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

export const setSpawnParams = ctx => {
  // Run either:
  //   npm/yarn run scriptName (depending on npm_execpath)
  //   node path/to/npm.js run scriptName (if npm run via node)
  // Based on https://github.com/mysticatea/npm-run-all/blob/52eaf86242ba408dedd015f53ca7ca368f25a026/lib/run-task.js#L156-L174
  const npmExecPath = process.env.npm_execpath;
  const isJsPath = typeof npmExecPath === 'string' && /\.m?js/.test(path.extname(npmExecPath));
  const isYarn = npmExecPath && path.basename(npmExecPath) === 'yarn.js';
  ctx.spawnParams = {
    command: isJsPath ? process.execPath : npmExecPath || 'npm',
    clientArgs: [isJsPath ? npmExecPath : '', isYarn ? '' : 'run', '--silent'].filter(Boolean),
    scriptArgs: [
      ctx.options.buildScriptName,
      isYarn ? '' : '--',
      '--output-dir',
      ctx.sourceDir,
    ].filter(Boolean),
  };
};

export const buildStorybook = async ctx => {
  ctx.buildLogFile = path.resolve('./build-storybook.log');
  const logFile = fs.createWriteStream(ctx.buildLogFile);
  await new Promise((resolve, reject) => {
    logFile.on('open', resolve);
    logFile.on('error', reject);
  });

  try {
    const { command, clientArgs, scriptArgs } = ctx.spawnParams;
    await execa(command, [...clientArgs, ...scriptArgs], { stdio: [null, logFile, logFile] });
  } catch (e) {
    e.message = buildFailed(ctx, e);
    throw e;
  } finally {
    logFile.end();
  }
};

export default createTask({
  title: initial.title,
  skip: async ctx => {
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
