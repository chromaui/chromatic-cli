import { emailHash } from '../../lib/emailHash';
import type { Environment } from '../../lib/getEnvironment';
import { Logger } from '../../lib/log';
import { Ports } from '../../lib/ports';
import { validateStorybookReactNativeVersion } from '../../lib/react-native/validateStorybookVersion';
import type { Context, Options, TurboSnap } from '../../types';
import turboSnapNotAvailableForReactNative from '../../ui/messages/errors/turboSnapNotAvailableForReactNative';
import noAncestorBuild from '../../ui/messages/warnings/noAncestorBuild';
import type { AnnouncedState, GitState, ProjectMetadata } from '../types';

export type InitializePhasePorts = Pick<Ports, 'chromatic' | 'host' | 'pkgMgr' | 'errors' | 'fs'>;

export interface InitializePhaseInput {
  options: Options;
  env: Pick<Environment, 'ENVIRONMENT_WHITELIST'>;
  git: GitState;
  storybook: Context['storybook'];
  projectMetadata?: ProjectMetadata;
  pkg: { version: string };
  turboSnap?: TurboSnap;
  /** Onboarding signal inherited from the gitInfo phase. */
  isOnboarding: boolean;
  rebuildForBuildId?: string;
  /**
   * Caller-derived hint for whether this is a React Native app. The
   * announced build's `features.isReactNativeApp` overrides this on its way
   * out.
   */
  isReactNativeApp?: boolean;
  log: Logger;
  ports: InitializePhasePorts;
}

export interface InitializePhaseOutput extends AnnouncedState {
  /** Whitelist-filtered subset of the host environment, sent up as `ciVariables`. */
  environment: Record<string, string>;
  runtimeMetadata: NonNullable<Context['runtimeMetadata']>;
  /** Updated React Native flag derived from the announce response. */
  isReactNativeApp: boolean;
  /** Updated TurboSnap state (e.g. `unavailable` set when the API reports so). */
  turboSnap?: TurboSnap;
}

/**
 * Pure orchestration of the `initialize` phase. Gathers CI environment
 * variables and runtime metadata, then announces the build to the Chromatic
 * API. Throws if the Storybook React Native version is unsupported, or if
 * TurboSnap is requested for a React Native build.
 *
 * @param input Phase inputs.
 *
 * @returns The accumulated {@link AnnouncedState} plus environment, runtime
 * metadata, and TurboSnap availability updates derived from the API response.
 */
// eslint-disable-next-line complexity
export async function runInitializePhase(
  input: InitializePhaseInput
): Promise<InitializePhaseOutput> {
  const environment = collectEnvironment(input);
  const runtimeMetadata = await collectRuntimeMetadata(input);
  const announceInput = buildAnnounceInput({ ...input, environment, runtimeMetadata });
  const announcedBuild = await input.ports.chromatic.announceBuild({ input: announceInput });

  input.ports.errors.setTag('app_id', announcedBuild.app.id);
  input.ports.errors.setContext('build', { id: announcedBuild.id });

  const isReactNativeApp = announcedBuild.features?.isReactNativeApp ?? false;
  const isOnboarding =
    input.isOnboarding ||
    announcedBuild.number === 1 ||
    (announcedBuild.autoAcceptChanges && !announceInput.autoAcceptChanges);

  let turboSnap = input.turboSnap;
  if (turboSnap && announcedBuild.app.turboSnapAvailability === 'UNAVAILABLE') {
    turboSnap = { ...turboSnap, unavailable: true };
  }

  if (isReactNativeApp) {
    await validateStorybookReactNativeVersion({ log: input.log, ports: input.ports } as Context);
  }
  if (turboSnap && isReactNativeApp) {
    throw new Error(turboSnapNotAvailableForReactNative());
  }

  if (!isOnboarding && !input.git.parentCommits) {
    input.log.warn(
      noAncestorBuild({
        options: input.options,
        git: input.git,
        announcedBuild,
        log: input.log,
      } as unknown as Context)
    );
  }

  return {
    announcedBuild,
    isOnboarding,
    isReactNativeApp,
    environment,
    runtimeMetadata,
    turboSnap,
  };
}

function collectEnvironment(input: InitializePhaseInput): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.ports.host.all())) {
    if (!value) continue;
    if (input.env.ENVIRONMENT_WHITELIST.some((regex) => key.match(regex))) {
      environment[key] = value;
    }
  }
  input.log.debug(`Got environment:\n${JSON.stringify(environment, undefined, 2)}`);
  return environment;
}

async function collectRuntimeMetadata(
  input: InitializePhaseInput
): Promise<NonNullable<Context['runtimeMetadata']>> {
  const runtimeMetadata: NonNullable<Context['runtimeMetadata']> = {
    nodePlatform: input.ports.host.platform(),
    nodeVersion: input.ports.host.nodeVersion(),
  };
  try {
    const detected = await input.ports.pkgMgr.detect();
    runtimeMetadata.packageManager = detected.name as NonNullable<
      Context['runtimeMetadata']
    >['packageManager'];
    input.ports.errors.setTag('packageManager', detected.name);
    runtimeMetadata.packageManagerVersion = detected.version;
    input.ports.errors.setTag('packageManagerVersion', detected.version);
  } catch (error) {
    input.log.debug(`Failed to set runtime metadata: ${(error as Error).message}`);
  }
  return runtimeMetadata;
}

function buildAnnounceInput(
  input: InitializePhaseInput & {
    environment: Record<string, string>;
    runtimeMetadata: NonNullable<Context['runtimeMetadata']>;
  }
) {
  const { patchBaseRef, patchHeadRef, preserveMissingSpecs, isLocalBuild } = input.options;
  const {
    version: _version,
    matchesBranch,
    changedFiles: _changedFiles,
    changedDependencyNames: _changedDependencyNames,
    replacementBuildIds: _replacementBuildIds,
    committedAt,
    baselineCommits: _baselineCommits,
    packageMetadataChanges: _packageMetadataChanges,
    gitUserEmail,
    rootPath: _rootPath,
    ...commitInfo
  } = input.git;
  const autoAcceptChanges = matchesBranch?.(input.options.autoAcceptChanges);

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
    needsBaselines: !!input.turboSnap && !input.turboSnap.bailReason,
    packageVersion: input.pkg.version,
    ...input.runtimeMetadata,
    rebuildForBuildId: input.rebuildForBuildId,
    storybookAddons: input.storybook.addons,
    storybookRefs: input.storybook.refs,
    storybookVersion: input.storybook.version,
    projectMetadata: {
      ...input.projectMetadata,
      storybookBaseDir: input.storybook?.baseDir,
    },
  };
}
