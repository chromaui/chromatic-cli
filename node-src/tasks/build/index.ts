import { existsSync } from 'fs';
import path from 'path';

import { Context, Deps, TaskResult } from '../../types';
import { pendingManifest } from '../../ui/tasks/buildReactNative';
import { buildArtifacts, generateManifestStep } from './buildReactNative';
import { buildStorybook } from './buildStorybook';
import { setBuildCommand } from './setBuildCommand';
import { setSourceDirectory } from './setSourceDirectory';

export interface BuildInput {
  isReactNativeApp: boolean;
  sourceDir?: string;
  storybook?: Context['storybook'];
  flags: Context['flags'];
  browsers?: string[];
  runtimeMetadata?: Context['runtimeMetadata'];
  git: Context['git'];
}

export interface BuildOutput {
  sourceDir: string;
  // The user provided prebuilt artifacts (and, for React Native, a manifest), so no build ran.
  skippedWithPrebuilt: boolean;
  buildCommand?: string;
  buildLogFile?: string;
  reactNativeBuildLogFile?: string;
}

async function buildReactNativeProject(
  deps: Deps,
  input: BuildInput
): Promise<TaskResult<BuildOutput>> {
  const { storybookBuildDir } = deps.options;

  if (storybookBuildDir && existsSync(path.resolve(storybookBuildDir, 'manifest.json'))) {
    return {
      kind: 'continue',
      output: { sourceDir: storybookBuildDir, skippedWithPrebuilt: true },
    };
  }

  const sourceDir = await setSourceDirectory(
    { options: deps.options },
    { sourceDir: storybookBuildDir ?? input.sourceDir, storybook: input.storybook }
  );

  let reactNativeBuildLogFile: string | undefined;
  // If the user has not provided build artifacts, we need to build them ourselves.
  if (!storybookBuildDir) {
    const artifacts = await buildArtifacts(
      { options: deps.options, log: deps.log, report: deps.report },
      { sourceDir, browsers: input.browsers, runtimeMetadata: input.runtimeMetadata }
    );
    reactNativeBuildLogFile = artifacts.reactNativeBuildLogFile;
  }

  const { title, output } = pendingManifest();
  deps.report({ title, output });
  await generateManifestStep({ options: deps.options, log: deps.log }, { sourceDir });

  return {
    kind: 'continue',
    output: { sourceDir, skippedWithPrebuilt: false, reactNativeBuildLogFile },
  };
}

async function buildWebProject(deps: Deps, input: BuildInput): Promise<TaskResult<BuildOutput>> {
  const { storybookBuildDir } = deps.options;

  // The user has already built their Storybook and provided the output directory.
  if (storybookBuildDir) {
    return {
      kind: 'continue',
      output: { sourceDir: storybookBuildDir, skippedWithPrebuilt: true },
    };
  }

  const sourceDir = await setSourceDirectory(
    { options: deps.options },
    { sourceDir: input.sourceDir, storybook: input.storybook }
  );

  const buildCommand = await setBuildCommand(
    { options: deps.options, log: deps.log },
    {
      sourceDir,
      flags: input.flags,
      storybook: input.storybook,
      changedFiles: input.git.changedFiles,
    }
  );

  deps.report({ output: `Running command: ${buildCommand}` });

  const { buildLogFile } = await buildStorybook(
    {
      options: deps.options,
      log: deps.log,
      env: deps.env,
      analytics: deps.analytics,
      pkg: deps.pkg,
    },
    {
      buildCommand,
      runtimeMetadata: input.runtimeMetadata,
      storybook: input.storybook,
      git: input.git,
    }
  );

  return {
    kind: 'continue',
    output: { sourceDir, skippedWithPrebuilt: false, buildCommand, buildLogFile },
  };
}

/**
 * Build the user's Storybook, E2E, or React Native project, or skip when prebuilt artifacts were
 * provided.
 *
 * @param deps Narrow set of cross-cutting dependencies the task needs.
 * @param input Per-pipeline-run input extracted from Context at the seam.
 *
 * @returns A TaskResult conveying the build artifacts (or the prebuilt skip).
 */
export async function buildProject(
  deps: Deps,
  input: BuildInput
): Promise<TaskResult<BuildOutput>> {
  return input.isReactNativeApp
    ? buildReactNativeProject(deps, input)
    : buildWebProject(deps, input);
}

export const extractBuildInput = (ctx: Context): BuildInput => ({
  isReactNativeApp: !!ctx.isReactNativeApp,
  sourceDir: ctx.sourceDir,
  storybook: ctx.storybook,
  flags: ctx.flags,
  browsers: ctx.announcedBuild?.browsers,
  runtimeMetadata: ctx.runtimeMetadata,
  git: ctx.git,
});

export const applyBuildOutput = (ctx: Context, output: BuildOutput) => {
  ctx.sourceDir = output.sourceDir;
  if (output.buildCommand) ctx.buildCommand = output.buildCommand;
  if (output.buildLogFile) ctx.buildLogFile = output.buildLogFile;
  if (output.reactNativeBuildLogFile) {
    ctx.reactNativeBuildLogFile = output.reactNativeBuildLogFile;
  }
};
