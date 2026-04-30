import * as Sentry from '@sentry/node';

import { getStorybookBaseDirectory } from '../lib/getStorybookBaseDirectory';
import getStorybookInfo from '../lib/getStorybookInfo';
import { createTask } from '../lib/tasks';
import { Context, Deps, Storybook, TaskFunction } from '../types';
import { initial, pending, success } from '../ui/tasks/storybookInfo';

export type StorybookInfoDeps = Pick<Deps, 'log' | 'options' | 'env' | 'packageJson'>;

export interface StorybookInfoInput {
  gitRootPath?: string;
}

export interface StorybookInfoOutput {
  storybook: Storybook;
}

export const setStorybookInfo: TaskFunction<
  StorybookInfoInput,
  StorybookInfoOutput,
  StorybookInfoDeps
> = async (deps, input) => {
  const storybook: Storybook = {
    ...((await getStorybookInfo(deps)) as Storybook),
    baseDir: getStorybookBaseDirectory({
      storybookBaseDir: deps.options.storybookBaseDir,
      gitRootPath: input.gitRootPath,
    }),
  };

  if (storybook.version) {
    Sentry.setTag('storybookVersion', storybook.version);
  }
  Sentry.setContext('storybook', storybook as unknown as Record<string, unknown>);

  return { kind: 'continue', output: { storybook } };
};

/**
 * Sets up the Listr task for gathering Storybook information.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns A Listr task.
 */
export default function main(ctx: Context) {
  return createTask({
    name: 'storybookInfo',
    title: initial(ctx).title,
    skip: (ctx: Context) => ctx.skip,
    transitions: { pending, success },
    extractInput: (ctx): StorybookInfoInput => ({ gitRootPath: ctx.git?.rootPath }),
    applyOutput: (ctx, { storybook }) => {
      ctx.storybook = storybook;
    },
    run: setStorybookInfo,
  });
}
