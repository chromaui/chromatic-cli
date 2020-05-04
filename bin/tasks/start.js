import { gte } from 'semver';
import treeKill from 'tree-kill';

import { STORYBOOK_CLI_FLAGS_BY_VERSION } from '../constants';
import { createTask, setTitle, setOutput } from '../lib/tasks';
import { baseStorybookUrl } from '../lib/utils';
import startApp, { checkResponse } from '../storybook/start-app';

const startStorybook = async ctx => {
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
  title: 'Start Storybook',
  skip: async ctx => {
    if (await checkResponse(ctx.options.url)) {
      ctx.isolatorUrl = ctx.options.url;
      return ctx.options.noStart
        ? `Skipped due to --do-not-start; using ${baseStorybookUrl(ctx.isolatorUrl)}`
        : `Storybook already running at ${baseStorybookUrl(ctx.isolatorUrl)}`;
    }
    if (ctx.options.noStart) {
      throw new Error(
        `No server responding at ${baseStorybookUrl(
          ctx.options.url
        )} -- make sure you've started it`
      );
    }
    return false;
  },
  steps: [
    setTitle('Starting your Storybook'),
    setOutput(ctx => `Running '${ctx.options.scriptName || ctx.options.commandName}'`),
    startStorybook,
    setTitle('Storybook started', ctx => `Running at ${baseStorybookUrl(ctx.isolatorUrl)}`),
  ],
});
