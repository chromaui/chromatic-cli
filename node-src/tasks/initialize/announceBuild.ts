import { emailHash } from '@cli/emailHash';
import * as Sentry from '@sentry/node';

import { relativeTo } from '../../lib/getStorybookProjectRoot';
import { runUsageQuery } from '../../lib/runUsageQuery';
import { isHashCollectionDisabled } from '../../lib/turbosnap/isHashCollectionDisabled';
import { logUsageStatus, usageStatusSelection } from '../../lib/usageStatus';
import {
  AnnouncedBuild,
  Deps,
  Git,
  ProjectMetadata,
  RuntimeMetadata,
  Storybook,
  TurboSnap,
} from '../../types';

export type AnnounceBuildDeps = Pick<Deps, 'log' | 'client' | 'options' | 'pkg' | 'env'>;

export interface AnnounceBuildInput {
  git: Git;
  environment?: Record<string, string>;
  turboSnap?: TurboSnap;
  rebuildForBuildId?: string;
  runtimeMetadata: RuntimeMetadata;
  storybook: Storybook;
  projectMetadata: ProjectMetadata;
}

const AnnounceBuildMutation = (includeUsage: boolean) => `
  mutation AnnounceBuildMutation($input: AnnounceBuildInput!) {
    announceBuild(input: $input) {
      id
      number
      browsers
      # no need for legacy:false on AnnouncedBuild.status
      status
      autoAcceptChanges
      reportToken
      ${includeUsage ? usageStatusSelection : ''}
      features {
        uiTests
        uiReview
        isReactNativeApp
      }
      app {
        id
        turboSnapAvailability
        isOnboarding
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
    visitedCommits,
    cloneFilter,
    cloneDepth,
    shallowBoundaryCommits,
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
      storybookBaseDir: relativeTo(rootPath ?? process.cwd(), input.storybook.projectRoot) || '.',
    },
  };
};

export const announceBuild = async (
  deps: AnnounceBuildDeps,
  input: AnnounceBuildInput
): Promise<AnnouncedBuild> => {
  const gqlInput = parseAnnounceBuildMutationInput(deps, input);
  const { announceBuild: announcedBuild } = await runUsageQuery<AnnounceBuildMutationResult>(
    deps.client,
    AnnounceBuildMutation,
    { input: gqlInput },
    { retries: 3 }
  );

  logUsageStatus(deps.log, announcedBuild.usageStatus);
  if (
    !input.turboSnap &&
    ['UNUSED', 'APPLIED'].includes(announcedBuild.app.turboSnapAvailability) &&
    (announcedBuild.features?.uiTests || announcedBuild.features?.uiReview) &&
    !announcedBuild.features.isReactNativeApp
  ) {
    if (isHashCollectionDisabled(deps)) {
      deps.log.warn(
        'TurboSnap is available but is disabled for this run. Review your onlyChanged setting and CHROMATIC_TURBOSNAP_DISABLE_HASHES before starting further builds: https://www.chromatic.com/docs/turbosnap/'
      );
    } else {
      deps.log.info(
        "Hash-based TurboSnap may apply automatically, but optimization is not confirmed yet. Check this build's optimization status before starting further builds: https://www.chromatic.com/docs/turbosnap/"
      );
    }
  }

  Sentry.setTag('app_id', announcedBuild.app.id);
  Sentry.setContext('build', { id: announcedBuild.id });

  return announcedBuild;
};
