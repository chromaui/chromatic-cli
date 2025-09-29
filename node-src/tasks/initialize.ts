import * as Sentry from '@sentry/node';

import { emailHash } from '../lib/emailHash';
import { getPackageManagerName, getPackageManagerVersion } from '../lib/getPackageManager';
import { createTask, transitionTo } from '../lib/tasks';
import { Context } from '../types';
import noAncestorBuild from '../ui/messages/warnings/noAncestorBuild';
import { initial, pending, success } from '../ui/tasks/initialize';

const AnnounceBuildMutation = `
  mutation AnnounceBuildMutation($input: AnnounceBuildInput!) {
    announceBuild(input: $input) {
      id
      number
      # no need for legacy:false on AnnouncedBuild.status
      status
      autoAcceptChanges
      reportToken
      app {
        id
        turboSnapAvailability
      }
    }
  }
`;

interface AnnounceBuildMutationResult {
  announceBuild: Context['announcedBuild'];
}

export const setEnvironment = async (ctx: Context) => {
  if (!ctx.environment) {
    ctx.environment = {};
  }

  // We send up all environment variables provided by these complicated systems.
  // We don't want to send up *all* environment vars as they could include sensitive information
  // about the user's build environment
  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue;

    if (ctx.env.ENVIRONMENT_WHITELIST.some((regex) => key.match(regex))) {
      ctx.environment[key] = value;
    }
  }

  ctx.log.debug(`Got environment:\n${JSON.stringify(ctx.environment, undefined, 2)}`);
};

export const setRuntimeMetadata = async (ctx: Context) => {
  ctx.runtimeMetadata = {
    nodePlatform: process.platform,
    nodeVersion: process.versions.node,
  };

  try {
    const packageManager = await getPackageManagerName();
    if (!packageManager) {
      throw new Error('Failed to determine package manager');
    }

    ctx.runtimeMetadata.packageManager = packageManager as any;
    Sentry.setTag('packageManager', packageManager);

    const packageManagerVersion = await getPackageManagerVersion(packageManager);
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
    storybookVersion: ctx.storybook.version,
    projectMetadata: {
      ...ctx.projectMetadata,
      storybookBaseDir: ctx.storybook?.baseDir,
    },
  };
};

export const announceBuild = async (ctx: Context) => {
  const input = announceBuildInput(ctx);
  const { announceBuild: announcedBuild } = await ctx.client.runQuery<AnnounceBuildMutationResult>(
    AnnounceBuildMutation,
    { input },
    { retries: 3 }
  );

  Sentry.setTag('app_id', announcedBuild.app.id);
  Sentry.setContext('build', { id: announcedBuild.id });

  ctx.announcedBuild = announcedBuild;
  ctx.isOnboarding =
    // possibly set from LastBuildQuery in setGitInfo
    ctx.isOnboarding ||
    announcedBuild.number === 1 ||
    (announcedBuild.autoAcceptChanges && !input.autoAcceptChanges);

  if (ctx.turboSnap && announcedBuild.app.turboSnapAvailability === 'UNAVAILABLE') {
    ctx.turboSnap.unavailable = true;
  }

  if (!ctx.isOnboarding && !ctx.git.parentCommits) {
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
    steps: [
      transitionTo(pending),
      setEnvironment,
      setRuntimeMetadata,
      announceBuild,
      transitionTo(success, true),
    ],
  });
}
