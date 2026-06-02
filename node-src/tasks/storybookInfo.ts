import * as Sentry from '@sentry/node';

import { isE2EBuild } from '../lib/e2eUtils';
import { getStorybookBaseDirectory } from '../lib/getStorybookBaseDirectory';
import getStorybookInfo from '../lib/getStorybookInfo';
import { createTask } from '../lib/tasks';
import { Context, Deps, Storybook, TaskFunction } from '../types';
import missingBuildScriptName from '../ui/messages/errors/missingBuildScriptName';
import { initial, pending, success } from '../ui/tasks/storybookInfo';

export type StorybookInfoDeps = Pick<Deps, 'log' | 'options' | 'env' | 'packageJson'>;

export interface StorybookInfoInput {
  gitRootPath?: string;
  isReactNativeApp: boolean;
}

export interface StorybookInfoOutput {
  storybook: Storybook;
}

export const setStorybookInfo: TaskFunction<
  StorybookInfoInput,
  StorybookInfoOutput,
  StorybookInfoDeps
> = async (deps, input) => {
  // Validate the build script for web storybooks. The throw that was previously in
  // getOptions.ts has moved here because it must be gated on isReactNativeApp, which
  // is only known after auth runs. The script-finding/defaulting logic remains in
  // getOptions.ts because getStorybookMetadata reads options.buildScriptName during
  // this task and needs the value resolved in advance.
  // Skip validation when a build script is not needed: react-native apps use their
  // own build process, a pre-built storybook dir was provided, a custom build command
  // was specified, or an E2E runner is in use.
  if (
    !input.isReactNativeApp &&
    !deps.options.storybookBuildDir &&
    !deps.options.buildCommand &&
    !isE2EBuild(deps.options)
  ) {
    const { buildScriptName } = deps.options;
    const scripts = (deps.packageJson.scripts ?? {}) as Record<string, string>;
    if (!buildScriptName || !scripts[buildScriptName]) {
      throw new Error(missingBuildScriptName(buildScriptName ?? ''));
    }
  }

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
      isReactNativeApp: ctx.isReactNativeApp ?? false,
    }),
    applyOutput: applyStorybookInfoOutput,
    run: setStorybookInfo,
  });
}
