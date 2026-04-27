import * as Sentry from '@sentry/node';

import { createAnalyticsClient } from '../lib/analytics';
import { emailHash } from '../lib/emailHash';
import { validateStorybookReactNativeVersion } from '../lib/react-native/validateStorybookVersion';
import { createTask, transitionTo } from '../lib/tasks';
import { Context } from '../types';
import turboSnapNotAvailableForReactNative from '../ui/messages/errors/turboSnapNotAvailableForReactNative';
import noAncestorBuild from '../ui/messages/warnings/noAncestorBuild';
import { initial, pending, success } from '../ui/tasks/initialize';

export const setEnvironment = async (ctx: Context) => {
  if (!ctx.environment) {
    ctx.environment = {};
  }

  // We send up all environment variables provided by these complicated systems.
  // We don't want to send up *all* environment vars as they could include sensitive information
  // about the user's build environment
  for (const [key, value] of Object.entries(ctx.ports.host.all())) {
    if (!value) continue;

    if (ctx.env.ENVIRONMENT_WHITELIST.some((regex) => key.match(regex))) {
      ctx.environment[key] = value;
    }
  }

  ctx.log.debug(`Got environment:\n${JSON.stringify(ctx.environment, undefined, 2)}`);
};

export const setRuntimeMetadata = async (ctx: Context) => {
  ctx.runtimeMetadata = {
    nodePlatform: ctx.ports.host.platform(),
    nodeVersion: ctx.ports.host.nodeVersion(),
  };

  try {
    const { name: packageManager, version: packageManagerVersion } =
      await ctx.ports.pkgMgr.detect();

    ctx.runtimeMetadata.packageManager = packageManager as any;
    Sentry.setTag('packageManager', packageManager);

    ctx.runtimeMetadata.packageManagerVersion = packageManagerVersion;
    Sentry.setTag('packageManagerVersion', packageManagerVersion);
  } catch (err) {
    ctx.log.debug(`Failed to set runtime metadata: ${err.message}`);
  }
};

const announceBuildInput = (ctx: Context) => {
  const { patchBaseRef, patchHeadRef, preserveMissingSpecs, isLocalBuild } = ctx.options;
  const {
    version,
    matchesBranch,
    changedFiles,
    changedDependencyNames,
    replacementBuildIds,
    committedAt,
    baselineCommits,
    packageMetadataChanges,
    gitUserEmail,
    rootPath,
    ...commitInfo
  } = ctx.git; // omit some fields;
  const { rebuildForBuildId, turboSnap } = ctx;
  const autoAcceptChanges = matchesBranch?.(ctx.options.autoAcceptChanges);

  return {
    autoAcceptChanges,
    patchBaseRef,
    patchHeadRef,
    preserveMissingSpecs,
    ...(gitUserEmail && { gitUserEmailHash: emailHash(gitUserEmail) }),
    ...commitInfo,
    committedAt: new Date(committedAt),
    ciVariables: ctx.environment,
    isLocalBuild,
    needsBaselines: !!turboSnap && !turboSnap.bailReason,
    packageVersion: ctx.pkg.version,
    ...ctx.runtimeMetadata,
    rebuildForBuildId,
    storybookAddons: ctx.storybook.addons,
    storybookRefs: ctx.storybook.refs,
    storybookVersion: ctx.storybook.version,
    projectMetadata: {
      ...ctx.projectMetadata,
      storybookBaseDir: ctx.storybook?.baseDir,
    },
  };
};

export const announceBuild = async (ctx: Context) => {
  const input = announceBuildInput(ctx);
  const announcedBuild = await ctx.ports.chromatic.announceBuild({ input });

  Sentry.setTag('app_id', announcedBuild.app.id);
  Sentry.setContext('build', { id: announcedBuild.id });

  updateContextFromAnnouncedBuild(ctx, announcedBuild, input);

  if (ctx.isReactNativeApp) {
    await validateStorybookReactNativeVersion(ctx);
  }

  if (ctx.turboSnap && ctx.isReactNativeApp) {
    throw new Error(turboSnapNotAvailableForReactNative());
  }

  if (!ctx.isOnboarding && !ctx.git.parentCommits) {
    ctx.log.warn(noAncestorBuild(ctx));
  }
};

function updateContextFromAnnouncedBuild(
  ctx: Context,
  announcedBuild: Context['announcedBuild'],
  input: ReturnType<typeof announceBuildInput>
) {
  ctx.announcedBuild = announcedBuild;
  ctx.isOnboarding =
    // possibly set from LastBuildQuery in setGitInfo
    ctx.isOnboarding ||
    announcedBuild.number === 1 ||
    (announcedBuild.autoAcceptChanges && !input.autoAcceptChanges);

  ctx.isReactNativeApp = announcedBuild.features?.isReactNativeApp ?? false;

  if (ctx.turboSnap && announcedBuild.app.turboSnapAvailability === 'UNAVAILABLE') {
    ctx.turboSnap.unavailable = true;
  }
}

/**
 * Creates the analytics client and attaches it to the context.
 *
 * @param ctx The context set when executing the CLI.
 */
export const initializeAnalytics = async (ctx: Context) => {
  ctx.analytics = createAnalyticsClient(ctx);
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
    steps: [
      transitionTo(pending),
      setEnvironment,
      setRuntimeMetadata,
      initializeAnalytics,
      announceBuild,
      transitionTo(success, true),
    ],
  });
}
