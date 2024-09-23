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
    if (ctx.env.ENVIRONMENT_WHITELIST.some((regex) => key.match(regex))) {
      ctx.environment[key] = value;
    }
  }

  ctx.log.debug(`Got environment:\n${JSON.stringify(ctx.environment, null, 2)}`);
};

export const setRuntimeMetadata = async (ctx: Context) => {
  ctx.runtimeMetadata = {
    nodePlatform: process.platform,
    nodeVersion: process.versions.node,
  };

  try {
    const packageManager = await getPackageManagerName();
    ctx.runtimeMetadata.packageManager = packageManager as any;
    const packageManagerVersion = await getPackageManagerVersion(packageManager);
    ctx.runtimeMetadata.packageManagerVersion = packageManagerVersion;
  } catch (err) {
    ctx.log.debug(`Failed to set runtime metadata: ${err.message}`);
  }
};

export const announceBuild = async (ctx: Context) => {
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
    ...commitInfo
  } = ctx.git; // omit some fields;
  const { rebuildForBuildId, turboSnap } = ctx;
  const autoAcceptChanges = matchesBranch(ctx.options.autoAcceptChanges);

  const { announceBuild: announcedBuild } = await ctx.client.runQuery<AnnounceBuildMutationResult>(
    AnnounceBuildMutation,
    {
      input: {
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
        storybookViewLayer: ctx.storybook.viewLayer,
      },
    },
    { retries: 3 }
  );

  ctx.announcedBuild = announcedBuild;
  ctx.isOnboarding =
    announcedBuild.number === 1 || (announcedBuild.autoAcceptChanges && !autoAcceptChanges);

  if (ctx.turboSnap && announcedBuild.app.turboSnapAvailability === 'UNAVAILABLE') {
    ctx.turboSnap.unavailable = true;
  }

  if (!ctx.isOnboarding && !ctx.git.parentCommits) {
    ctx.log.warn(noAncestorBuild(ctx));
  }
};

export default createTask({
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
