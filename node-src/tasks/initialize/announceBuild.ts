import { emailHash } from '@cli/emailHash';
import * as Sentry from '@sentry/node';

import {
  AnnouncedBuild,
  Deps,
  Git,
  ProjectMetadata,
  RuntimeMetadata,
  Storybook,
  TurboSnap,
} from '../../types';

export type AnnounceBuildDeps = Pick<Deps, 'log' | 'client' | 'options' | 'pkg'>;

export interface AnnounceBuildInput {
  git: Git;
  environment?: Record<string, string>;
  turboSnap?: TurboSnap;
  rebuildForBuildId?: string;
  runtimeMetadata: RuntimeMetadata;
  storybook: Storybook;
  projectMetadata: ProjectMetadata;
}

const AnnounceBuildMutation = `
  mutation AnnounceBuildMutation($input: AnnounceBuildInput!) {
    announceBuild(input: $input) {
      id
      number
      browsers
      # no need for legacy:false on AnnouncedBuild.status
      status
      autoAcceptChanges
      reportToken
      features {
        uiTests
        uiReview
        isReactNativeApp
      }
      app {
        id
        turboSnapAvailability
      }
    }
  }
`;

interface AnnounceBuildMutationResult {
  announceBuild: AnnouncedBuild;
}

const parseAnnounceBuildMutationInput = (deps: AnnounceBuildDeps, input: AnnounceBuildInput) => {
  const { patchBaseRef, patchHeadRef, preserveMissingSpecs, isLocalBuild } = deps.options;
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
  } = input.git; // omit some fields;
  const { rebuildForBuildId, turboSnap } = input;
  const autoAcceptChanges = matchesBranch?.(deps.options.autoAcceptChanges);

  return {
    autoAcceptChanges,
    patchBaseRef,
    patchHeadRef,
    preserveMissingSpecs,
    ...(gitUserEmail && { gitUserEmailHash: emailHash(gitUserEmail) }),
    ...commitInfo,
    committedAt: new Date(committedAt),
    ciVariables: input.environment,
    isLocalBuild,
    needsBaselines: !!turboSnap && !turboSnap.bailReason,
    packageVersion: deps.pkg.version,
    ...input.runtimeMetadata,
    rebuildForBuildId,
    storybookAddons: input.storybook.addons,
    storybookRefs: input.storybook.refs,
    storybookVersion: input.storybook.version,
    projectMetadata: {
      ...input.projectMetadata,
      storybookBaseDir: input.storybook?.baseDir,
    },
  };
};

export const announceBuild = async (
  deps: AnnounceBuildDeps,
  input: AnnounceBuildInput
): Promise<AnnouncedBuild> => {
  const gqlInput = parseAnnounceBuildMutationInput(deps, input);
  const { announceBuild: announcedBuild } = await deps.client.runQuery<AnnounceBuildMutationResult>(
    AnnounceBuildMutation,
    { input: gqlInput },
    { retries: 3 }
  );

  Sentry.setTag('app_id', announcedBuild.app.id);
  Sentry.setContext('build', { id: announcedBuild.id });

  return announcedBuild;
};
