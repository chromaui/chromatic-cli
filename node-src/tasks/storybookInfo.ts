import * as Sentry from '@sentry/node';

import { isE2EBuild } from '../lib/e2eUtils';
import getStorybookInfo from '../lib/getStorybookInfo';
import { getStorybookProjectRoot } from '../lib/getStorybookProjectRoot';
import { describeProjectSetup, detectProjectSetup, ProjectSetup } from '../lib/projectSetup';
import { AbsolutePath, Context, Deps, Storybook, TaskFunction } from '../types';
import missingBuildScriptName from '../ui/messages/errors/missingBuildScriptName';

export type StorybookInfoDeps = Pick<Deps, 'log' | 'options' | 'env' | 'packageJson'>;

export interface StorybookInfoInput {
  gitRootPath?: AbsolutePath;
  isReactNativeApp: boolean;
}

export const extractStorybookInfoInput = (ctx: Context): StorybookInfoInput => ({
  // git.rootPath is truly optional here, so we don't need to verify that it's present
  gitRootPath: ctx.git?.rootPath,
  isReactNativeApp: ctx.isReactNativeApp ?? false,
});

export interface StorybookInfoOutput {
  storybook: Storybook;
  projectSetup: ProjectSetup;
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

  const projectRoot = getStorybookProjectRoot({
    storybookBaseDir: deps.options.storybookBaseDir,
    gitRootPath: input.gitRootPath,
  });

  const storybook = await getStorybookInfo(deps, projectRoot);
  // Detected once, from the config directory, because that is where Storybook resolves its own
  // packages from; everything that needs to know how dependencies are installed reads this.
  const projectSetup = detectProjectSetup(storybook.configDir);
  deps.log.debug('Detected project setup:', projectSetup);
  return { kind: 'continue', output: { storybook, projectSetup } };
};

// extracted so we can test it more easily
export const applyStorybookInfoOutput = (
  ctx: Context,
  { storybook, projectSetup }: StorybookInfoOutput
) => {
  ctx.storybook = storybook;
  ctx.projectSetup = projectSetup;
  Sentry.setTag('project_setup', describeProjectSetup(projectSetup));
  Sentry.setContext('project_setup', projectSetup);
  if (storybook.version) {
    Sentry.setTag('storybookVersion', storybook.version);
  }
  const {
    projectRoot: _projectRoot,
    configDir: _configDirectory,
    staticDirs: _staticDirectories,
    ...metadata
  } = storybook;
  Sentry.setContext('storybook', metadata);
};
