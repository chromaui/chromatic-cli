import { createAnalyticsClient } from '@cli/analytics';
import { validateStorybookReactNativeVersion } from '@cli/react-native/validateStorybookVersion';
import { createTask } from '@cli/tasks';

import { AnnouncedBuild, Context, Deps, RuntimeMetadata, TaskResult } from '../../types';
import turboSnapNotAvailableForReactNative from '../../ui/messages/errors/turboSnapNotAvailableForReactNative';
import noAncestorBuild from '../../ui/messages/warnings/noAncestorBuild';
import { initial, pending, success } from '../../ui/tasks/initialize';
import { announceBuild, AnnounceBuildInput } from './announceBuild';
import { gatherEnvironment } from './gatherEnvironment';
import { getRuntimeMetadata } from './getRuntimeMetadata';

type InitializeDeps = Pick<Deps, 'log' | 'env' | 'client' | 'options' | 'pkg'>;

interface InitializeInput {
  // currently, only announceBuild takes any input, but I'm structuring this way to match the
  // structure of other tasks. If other subtasks within initialize need input in the future,
  // this is where it goes.
  partialAnnounceBuildInput: Omit<AnnounceBuildInput, 'environment' | 'runtimeMetadata'>; // omitted fields come from subtasks
}

interface InitializeOutput {
  environment: Record<string, string>;
  runtimeMetadata: RuntimeMetadata;
  announcedBuild: AnnouncedBuild;
}

/**
 * Announces a new build on Chromatic and gathers resulting build data and metadata.
 *
 * @param deps Narrow set of cross-cutting dependencies the task needs.
 * @param input Per-pipeline-run input extracted from Context at the seam.
 *
 * @returns A TaskResult conveying the produced announced build, environment, and runtime metadata.
 */
export async function initialize(
  deps: InitializeDeps,
  input: InitializeInput
): Promise<TaskResult<InitializeOutput>> {
  const environment = gatherEnvironment(deps);
  const runtimeMetadata = await getRuntimeMetadata(deps);
  const announcedBuild = await announceBuild(deps, {
    ...input.partialAnnounceBuildInput,
    environment,
    runtimeMetadata,
  });
  return { kind: 'continue', output: { environment, runtimeMetadata, announcedBuild } };
}

export const extractInitializeInput = (ctx: Context): InitializeInput => {
  const partialAnnounceBuildInput: InitializeInput['partialAnnounceBuildInput'] = {
    git: ctx.git,
    turboSnap: ctx.turboSnap,
    rebuildForBuildId: ctx.rebuildForBuildId,
    storybook: ctx.storybook,
    projectMetadata: ctx.projectMetadata,
  };
  return { partialAnnounceBuildInput };
};

// eslint-disable-next-line complexity
export const applyInitializeOutput = async (ctx: Context, output: InitializeOutput) => {
  ctx.environment = output.environment; // deprecated, but still populating it for now. Will remove in a major.
  ctx.runtimeMetadata = output.runtimeMetadata;
  ctx.announcedBuild = output.announcedBuild;
  // possibly set from LastBuildQuery in gatherGitInfo
  ctx.isOnboarding = ctx.isOnboarding || output.announcedBuild.app.isOnboarding;

  ctx.isReactNativeApp = output.announcedBuild.features?.isReactNativeApp ?? false;

  if (ctx.turboSnap && output.announcedBuild.app.turboSnapAvailability === 'UNAVAILABLE') {
    ctx.turboSnap.unavailable = true;
  }
  ctx.analytics = createAnalyticsClient(ctx);

  if (ctx.isReactNativeApp) {
    await validateStorybookReactNativeVersion(ctx);
  }

  if (ctx.turboSnap && ctx.isReactNativeApp) {
    throw new Error(turboSnapNotAvailableForReactNative());
  }

  if (!ctx.isOnboarding && (!ctx.git.parentCommits || ctx.git.parentCommits.length === 0)) {
    ctx.log.warn(noAncestorBuild(ctx));
  }
};

/**
 * Sets up the Listr task for announcing a new build on Chromatic.
 *
 * @param _ The context set when executing the CLI.
 *
 * @returns A Listr task.
 */
export default function main(_: Context) {
  return createTask({
    name: 'initialize',
    title: initial.title,
    skip: (ctx: Context) => ctx.skip,
    transitions: {
      pending,
      success,
    },
    extractInput: extractInitializeInput,
    applyOutput: applyInitializeOutput,
    run: initialize,
  });
}
