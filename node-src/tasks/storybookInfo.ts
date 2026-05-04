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
  return { kind: 'continue', output: { storybook } };
};

// extracted so we can test it more easily
export const applyStorybookInfoOutput = (ctx: Context, { storybook }: StorybookInfoOutput) => {
  ctx.storybook = storybook;
  if (storybook.version) {
    Sentry.setTag('storybookVersion', storybook.version);
  }
  Sentry.setContext('storybook', { ...storybook });
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
    extractInput: (ctx): StorybookInfoInput => ({
      // git.rootPath is truly optional here, so we don't need to verify that it's present
      gitRootPath: ctx.git?.rootPath,
    }),
    applyOutput: applyStorybookInfoOutput,
    run: setStorybookInfo,
  });
}
