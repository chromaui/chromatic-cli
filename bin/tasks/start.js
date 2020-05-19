import { gte } from 'semver';
import treeKill from 'tree-kill';

import { STORYBOOK_CLI_FLAGS_BY_VERSION } from '../constants';
import startApp, { checkResponse } from '../lib/startStorybook';
import { createTask, transitionTo } from '../lib/tasks';
import { initial, pending, success, skipped, skipFailed } from '../ui/tasks/start';

export const startStorybook = async ctx => {
  const { exec: commandName, scriptName, url } = ctx.options;

  const child = await startApp({
    scriptName,
    commandName,
    url,
    args: scriptName &&
      ctx.storybook.version &&
      gte(ctx.storybook.version, STORYBOOK_CLI_FLAGS_BY_VERSION['--ci']) && ['--', '--ci'],
    options: { stdio: 'pipe' },
  });

  ctx.isolatorUrl = url;
  ctx.stopApp = () =>
    child &&
    new Promise((resolve, reject) =>
      treeKill(child.pid, 'SIGHUP', err => (err ? reject(err) : resolve()))
    );
};

export default createTask({
  title: initial.title,
  skip: async ctx => {
    if (await checkResponse(ctx.options.url)) {
      ctx.isolatorUrl = ctx.options.url;
      return skipped(ctx).output;
    }
    if (ctx.options.noStart) {
      throw new Error(skipFailed(ctx).output);
    }
    return false;
  },
  steps: [transitionTo(pending), startStorybook, transitionTo(success, true)],
});
