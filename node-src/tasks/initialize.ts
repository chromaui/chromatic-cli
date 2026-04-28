import { createAnalyticsClient } from '../lib/analytics';
import { createRealAnalytics } from '../lib/ports/analyticsRealAdapter';
import { createTask, transitionTo } from '../lib/tasks';
import { runInitializePhase } from '../run/phases/initialize';
import { Context } from '../types';
import { initial, pending, success } from '../ui/tasks/initialize';

/**
 * Creates the analytics client and attaches it to the context. Stays as a
 * separate Listr step because it swaps `ctx.ports.analytics` from the
 * in-memory bootstrap adapter to the real Segment-backed adapter — the phase
 * function itself does not (and should not) mutate the ports bag.
 *
 * @param ctx The context set when executing the CLI.
 */
export const initializeAnalytics = async (ctx: Context) => {
  const client = createAnalyticsClient(ctx);
  ctx.analytics = client;
  ctx.ports.analytics = createRealAnalytics(client);
};

export const announceBuild = async (ctx: Context) => {
  const result = await runInitializePhase({
    options: ctx.options,
    env: ctx.env,
    git: ctx.git,
    storybook: ctx.storybook,
    projectMetadata: ctx.projectMetadata,
    pkg: ctx.pkg,
    turboSnap: ctx.turboSnap,
    isOnboarding: ctx.isOnboarding ?? false,
    rebuildForBuildId: ctx.rebuildForBuildId,
    isReactNativeApp: ctx.isReactNativeApp,
    log: ctx.log,
    ports: ctx.ports,
  });

  // Compatibility copy: downstream phases still read these via `ctx.*`.
  ctx.environment = result.environment;
  ctx.runtimeMetadata = result.runtimeMetadata;
  ctx.announcedBuild = result.announcedBuild;
  ctx.isOnboarding = result.isOnboarding;
  ctx.isReactNativeApp = result.isReactNativeApp;
  if (result.turboSnap !== undefined) ctx.turboSnap = result.turboSnap;
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
    steps: [transitionTo(pending), initializeAnalytics, announceBuild, transitionTo(success, true)],
  });
}
