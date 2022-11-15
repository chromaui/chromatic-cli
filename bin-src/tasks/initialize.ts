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
  // We send up all environment variables provided by these complicated systems.
  // We don't want to send up *all* environment vars as they could include sensitive information
  // about the user's build environment
  ctx.environment = Object.entries(process.env).reduce((acc, [key, value]) => {
    if (ctx.env.ENVIRONMENT_WHITELIST.find((regex) => key.match(regex))) {
      acc[key] = value;
    }
    return acc;
  }, {});

  ctx.log.debug(`Got environment:\n${JSON.stringify(ctx.environment, null, 2)}`);
};

export const announceBuild = async (ctx: Context) => {
  const { patchBaseRef, patchHeadRef, preserveMissingSpecs } = ctx.options;
  const {
    version,
    matchesBranch,
    changedFiles,
    replacementBuildIds,
    committedAt,
    changedPackageManifests,
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
        ...commitInfo,
        committedAt: new Date(committedAt),
        ciVariables: ctx.environment,
        needsBaselines: !!turboSnap && !turboSnap.bailReason,
        packageVersion: ctx.pkg.version,
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
  title: initial.title,
  skip: (ctx: Context) => ctx.skip,
  steps: [transitionTo(pending), setEnvironment, announceBuild, transitionTo(success, true)],
});
