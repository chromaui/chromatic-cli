import execa from 'execa';
import path from 'path';
import tmp from 'tmp-promise';
import fs from 'fs';

import { createTask, transitionTo } from '../lib/tasks';
import { TesterSkipBuildMutation } from '../io/gql-queries';
import {
  initial,
  pending,
  success,
  skipped,
  skippedForCommit,
  skipFailed,
} from '../ui/tasks/build';

const setSourceDir = async ctx => {
  const tmpDir = await tmp.dir({ unsafeCleanup: true, prefix: `chromatic-` });
  ctx.sourceDir = tmpDir.path;
};

const setSpawnParams = ctx => {
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
      '--quiet',
    ].filter(Boolean),
  };
};

const buildStorybook = async ctx => {
  ctx.buildLogFile = path.resolve('./build-storybook.log');
  const logFile = fs.createWriteStream(ctx.buildLogFile);
  await new Promise((resolve, reject) => {
    logFile.on('open', resolve);
    logFile.on('error', reject);
  });

  try {
    const { command, clientArgs, scriptArgs } = ctx.spawnParams;
    await execa(command, [...clientArgs, ...scriptArgs], { stdio: [null, logFile, logFile] });
  } finally {
    logFile.end();
  }
};

export default createTask({
  title: initial.title,
  skip: async ctx => {
    if (ctx.options.skip) {
      if (await ctx.client.runQuery(TesterSkipBuildMutation, { commit: ctx.git.commit })) {
        return skippedForCommit(ctx).output;
      }
      throw new Error(skipFailed(ctx).output);
    }
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
