import semver from 'semver';
import treeKill from 'tree-kill';

import startApp, { resolveIsolatorUrl } from '../lib/startStorybook';
import { createTask, transitionTo } from '../lib/tasks';
import { Context } from '../types';
import { initial, pending, skipFailed, skipped, success } from '../ui/tasks/start';

export const startStorybook = async (ctx: Context) => {
  const child = await startApp(ctx, {
    args: ctx.options.scriptName &&
      ctx.storybook.version &&
      semver.gte(ctx.storybook.version, ctx.env.STORYBOOK_CLI_FLAGS_BY_VERSION['--ci']) && [
        '--',
        '--ci',
      ],
    options: { stdio: 'pipe' },
  });

  ctx.stopApp = () =>
    child &&
    new Promise((resolve, reject) =>
      treeKill(child.pid, 'SIGHUP', (err) => (err ? reject(err) : resolve(undefined)))
    );
};

export default createTask({
  title: initial.title,
  skip: async (ctx: Context) => {
    if (ctx.skip) return true;
    const isolatorUrl = await resolveIsolatorUrl(ctx, ctx.options.url);
    if (isolatorUrl) {
      ctx.isolatorUrl = isolatorUrl;
      return skipped(ctx).output;
    }
    return false;
  },
  steps: [transitionTo(pending), startStorybook, transitionTo(success, true)],
});
