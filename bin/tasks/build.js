import execa from 'execa';
import fs from 'fs';
import path from 'path';
import semver from 'semver';
import tmp from 'tmp-promise';
import yarnOrNpm, { hasYarn } from 'yarn-or-npm';

import { createTask, transitionTo } from '../lib/tasks';
import buildFailed from '../ui/messages/errors/buildFailed';
import { failed, initial, pending, skipped, success } from '../ui/tasks/build';

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

export const setSpawnParams = (ctx) => {
  ctx.spawnParams = {
    client: yarnOrNpm(),
    platform: process.platform,
    command: yarnOrNpm(),
    clientArgs: ['run', '--silent'],
    scriptArgs: [
      ctx.options.buildScriptName,
      hasYarn() ? '' : '--',
      '--output-dir',
      ctx.sourceDir,
    ].filter(Boolean),
    spawnOptions: {
      preferLocal: true,
      localDir: path.resolve('node_modules/.bin'),
    },
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
    const { command, clientArgs, scriptArgs, spawnOptions } = ctx.spawnParams;
    ctx.log.debug('Using spawnParams:', JSON.stringify(ctx.spawnParams, null, 2));
    await Promise.race([
      execa(command, [...clientArgs, ...scriptArgs], {
        stdio: [null, logFile, logFile],
        ...spawnOptions,
      }),
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
