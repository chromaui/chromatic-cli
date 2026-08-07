import * as Sentry from '@sentry/node';

import GraphQLClient from '../../../io/graphqlClient';
import type { Stats, TurboSnapBailReason, TurboSnapInternalErrorSubreason } from '../../../types';
import { TraceChangedFilesResult } from '../types';
import { captureBailException } from '../v1/captureBailException';
import { isNetworkError } from '../v1/errors';
import { determineChangedFiles } from './api';
import { getUntrustedBuilderStatsReason } from './builderViteCompatibility';
import { classifyUploadHashesFailure } from './classifyUploadHashesFailure';
import { buildManifest, TurboSnapManifest, writeManifest } from './manifest';
import { ProjectFiles } from './projectFiles';
import {
  getAnchorMismatchReason,
  getSourceModuleResolution,
  SourceModuleResolution,
} from './statsAnchor';
import { countNodeModulesFiles } from './statsGraph';

interface TraceChangedFilesInput {
  graphqlClient: GraphQLClient;
  buildId: string;
  stats: Stats;
  statsPath: string;
  manifestOutputDirectory: string;
  repositoryRoot: string;
  projectRoot: string;
  configDir: string;
  staticDirs: string[];
  staticDirsDeclared: boolean;
  projectFiles: ProjectFiles;
  builderName?: string;
}

/**
 * The result of running TurboSnap v2. In addition to the shared trace statuses, v2 can return
 * 'fallback' to tell the caller it can't be trusted to trace this build and v1 should run instead.
 */
export type TraceChangedFilesV2Result = TraceChangedFilesResult | { status: 'fallback' };

/**
 * Determines which story files are affected by the changed source file hashes, bailing out of
 * TurboSnap when necessary.
 *
 * @param input The input to run TurboSnap 2.0.
 * @param input.stats The preview stats file, read by the caller because v1 traces the same one.
 * @param input.statsPath The path the stats file was read from, used as anchor-check evidence.
 * @param input.manifestOutputDirectory The directory to write the manifest file to.
 * @param input.repositoryRoot The repository root, used as the one supported alternate root for
 * relative stats paths.
 * @param input.projectRoot The absolute Storybook project root used to read source files off disk
 * and to anchor manifest keys.
 * @param input.configDir The project-relative Storybook config directory, hashed off disk because it
 * is never a bundler input.
 * @param input.staticDirs The project-relative static directories, hashed off disk for the same reason.
 * @param input.staticDirsDeclared Whether the prebuilt Storybook reports that its source config
 * declared static directories.
 * @param input.projectFiles How to read the disk; see {@link ProjectFiles}. Required rather than
 * defaulted, so a caller cannot silently reach the real disk.
 * @param input.builderName The builder named by the project's own Storybook config, used to check the
 * stats against the anchor; see {@link getAnchorMismatchReason}.
 *
 * @returns The TurboSnap result.
 */
export async function traceChangedFiles(
  input: TraceChangedFilesInput
): Promise<TraceChangedFilesV2Result> {
  const { stats } = input;

  // A full pass over every name in the stats, so it runs once and both the anchor check and the
  // manifest are handed the answer.
  let resolution;
  try {
    resolution = getSourceModuleResolution(stats, input);
  } catch (error) {
    return internalErrorBail(error, 'anchorCheckFailed', 'getSourceModuleResolution');
  }

  const statsBail = getStatsBail(stats, input, resolution);
  if (statsBail) return statsBail;

  let manifest;
  try {
    manifest = await buildManifest(
      stats,
      input.projectRoot,
      {
        configDir: input.configDir,
        staticDirs: input.staticDirs,
        projectFiles: input.projectFiles,
      },
      // Only reachable for a stats file naming no source modules at all; any other unresolved case
      // already bailed at getUnresolvedSourceModules.
      resolution.statsRoot ?? input.projectRoot
    );
  } catch (error) {
    return internalErrorBail(error, 'manifestBuildFailed', 'buildManifest');
  }

  // Written here rather than at each exit below, because every one of them writes it: a bail is
  // exactly when the manifest is worth inspecting, and a degenerate graph still has to be debuggable.
  writeDiagnosticManifest(manifest, input.manifestOutputDirectory);

  const emptySectionBail = getEmptySectionBail(manifest, stats, input.staticDirs);
  if (emptySectionBail) return emptySectionBail;

  let response;
  try {
    response = await determineChangedFiles(input.graphqlClient, input.buildId, manifest);
  } catch (error) {
    // A thrown error is a transport failure, already retried. It is expected volume rather than a
    // bug, so it gets a named reason and no Sentry event.
    return bailWith({
      indexUnavailable: true,
      ...(isNetworkError(error) && { bailSubreason: 'networkError' as const }),
    });
  }

  // The mutation resolves with its failure member rather than throwing, so a rejection is only
  // visible by inspecting the response. Each of these is our own bug and is worth a Sentry event.
  const uploadFailure = classifyUploadHashesFailure(response);
  if (uploadFailure) {
    return bailWith({
      indexContractViolation: true,
      bailSubreason: uploadFailure.bailSubreason,
      sentryEventId: captureBailException(uploadFailure.error, {
        bailSubreason: uploadFailure.bailSubreason,
        bailPath: 'determineChangedFiles',
      }),
    });
  }

  // Until we want to lean on the v2 output, we always fallback to v1.
  return { status: 'fallback' };
}

/** Wraps a bail reason in the result shape the caller expects. */
function bailWith(bailReason: TurboSnapBailReason): TraceChangedFilesResult {
  return { status: 'bailed', turboSnap: { bailReason } };
}

/**
 * Bails on a thrown error from one of our own checks, reporting it to Sentry under `bailPath`.
 *
 * @param error The thrown value.
 * @param bailSubreason The classified subreason, which is also the Sentry fingerprint.
 * @param bailPath A stable identifier for the bail site.
 *
 * @returns The internal-error bail result.
 */
function internalErrorBail(
  error: unknown,
  bailSubreason: TurboSnapInternalErrorSubreason,
  bailPath: string
): TraceChangedFilesResult {
  return bailWith({
    internalError: true,
    bailSubreason,
    sentryEventId: captureBailException(error, { bailSubreason, bailPath }),
  });
}

function writeDiagnosticManifest(manifest: TurboSnapManifest, outputDirectory: string) {
  try {
    writeManifest(manifest, outputDirectory);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { turbo_snap_v2_diagnostic: 'writeManifest' },
    });
  }
}

/**
 * Everything we can refuse before a manifest exists, in the order their evidence stays trustworthy:
 * a wrong anchor makes the builder version unreliable, since that package is resolved from it.
 */
function getStatsBail(
  stats: Stats,
  input: TraceChangedFilesInput,
  resolution: SourceModuleResolution
): TraceChangedFilesResult | undefined {
  return (
    getAnchorBail(stats, input, resolution) ??
    getBuilderStatsBail(stats, input) ??
    getStaticDirectoriesBail(input)
  );
}

/**
 * Refuses a manifest whose stats file cannot be shown to describe the project at `projectRoot`.
 * Unlike the emptiness guards this one has to fire before anything is built: a wrong-but-similar
 * anchor produces a complete manifest with hashes read off another package's files, so there is
 * nothing suspicious left to detect afterwards. See getAnchorMismatchReason.
 */
function getAnchorBail(
  stats: Stats,
  input: TraceChangedFilesInput,
  resolution: SourceModuleResolution
): TraceChangedFilesResult | undefined {
  let mismatch;
  try {
    mismatch = getAnchorMismatchReason(stats, input, resolution);
  } catch (error) {
    return internalErrorBail(error, 'anchorCheckFailed', 'getAnchorMismatchReason');
  }

  if (!mismatch) return undefined;

  // The evidence only matters to whoever investigates the bail, so it rides on the Sentry scope; the
  // analytics event carries the subreason.
  Sentry.setContext('turboSnapAnchorMismatch', {
    subreason: mismatch.subreason,
    detail: mismatch.detail,
    projectRoot: input.projectRoot,
    statsPath: input.statsPath,
  });

  return bailWith({ anchorMismatch: true, bailSubreason: mismatch.subreason });
}

/** Refuses stats produced by a builder whose output we know we cannot trace correctly. */
function getBuilderStatsBail(
  stats: Stats,
  input: TraceChangedFilesInput
): TraceChangedFilesResult | undefined {
  let reason;
  try {
    reason = getUntrustedBuilderStatsReason(stats, input.projectRoot, input.projectFiles);
  } catch (error) {
    return internalErrorBail(
      error,
      'builderCompatibilityCheckFailed',
      'getUntrustedBuilderStatsReason'
    );
  }

  if (!reason) return undefined;

  return bailWith({
    untrustedBuilderStats: true,
    bailSubreason: reason.subreason,
    builderName: reason.builderName,
    ...(reason.builderVersion && { builderVersion: reason.builderVersion }),
  });
}

/**
 * A prebuilt Storybook's project.json records whether static directories were declared, while their
 * paths must still be derived from the checked-out source. If those two sources disagree, continuing
 * would silently omit `staticFiles` even though we know the section should exist.
 */
function getStaticDirectoriesBail(
  input: Pick<TraceChangedFilesInput, 'staticDirs' | 'staticDirsDeclared'>
): TraceChangedFilesResult | undefined {
  if (!input.staticDirsDeclared || input.staticDirs.length > 0) return undefined;
  return bailWith({ unresolvedStaticDirectories: true });
}

/**
 * Bails when a section that should never be empty is empty, in diagnosis order. An empty section is
 * evidence that the input we derived is wrong rather than that the project genuinely lacks it.
 *
 * @param manifest The manifest built from the stats.
 * @param stats The stats file the manifest was built from.
 * @param staticDirectories The project-relative static directories.
 *
 * @returns The bail result, or undefined when every section that should be populated is.
 */
function getEmptySectionBail(
  manifest: TurboSnapManifest,
  stats: Stats,
  staticDirectories: string[]
): TraceChangedFilesResult | undefined {
  // A real Storybook always has a non-empty config directory, so resolving zero files there says the
  // input derivation is wrong rather than that the project has no config. It remains the first and
  // most actionable diagnosis when several manifest sections are empty.
  if (manifest.outOfGraphFiles.storybookConfigFiles.size === 0) {
    return bailWith({ noStorybookConfigFiles: true });
  }

  // An empty static section is only suspicious when static directories were explicitly configured.
  // A configured-but-empty directory deliberately bails in the safe direction rather than sharing
  // the same silent evidence as a missing or unreadable directory.
  if (staticDirectories.length > 0 && manifest.outOfGraphFiles.staticFiles.size === 0) {
    return bailWith({ noStaticFiles: true });
  }

  // Content-hashing the `node_modules` files that are in the graph is v2's entire dependency
  // coverage, so a graph containing none of them covers no dependency change at all: an upgrade
  // would leave the manifest byte-identical and capture nothing. This is the precise condition
  // under which v1 declares the stats incomplete and bails (`nodeModulesMissingInStats`), except
  // that reading it needs no changed-file list — it is a self-contained property of the stats.
  //
  // Zero is the whole test, with no threshold to tune: the lowest count across the ten harness
  // fixtures is 17 (`ui-sb8`), and Vite's pre-bundling does not erase them (`ui` has 30).
  if (countNodeModulesFiles(stats) === 0) {
    return bailWith({ noNodeModulesFiles: true });
  }

  return getNoStoryFilesBail(manifest);
}

/**
 * Explains a graph we found no stories in, which can only ever recapture everything through
 * `storybookGlobals` — wider than v1. An unrecognized entry naming a lazy story context is the one
 * explanation we can give, so it is reported; otherwise the emptiness is all we know.
 *
 * @param manifest The manifest built from the stats.
 *
 * @returns The bail result, or undefined when the graph contains story files.
 */
function getNoStoryFilesBail(manifest: TurboSnapManifest): TraceChangedFilesResult | undefined {
  if (manifest.storyFileHashes.size > 0) return undefined;

  const { unrecognizedStoryEntries: entries } = manifest;
  if (entries.length === 0) return bailWith({ noStoryFiles: true });

  const error = new Error(
    `The stats contain a lazy story context imported by an unrecognized entry: ${entries.join(', ')}`
  );
  return bailWith({
    unrecognizedStoryEntry: true,
    sentryEventId: captureBailException(error, {
      bailSubreason: 'unrecognizedStoryEntry',
      bailPath: 'getEmptySectionBail',
    }),
  });
}
