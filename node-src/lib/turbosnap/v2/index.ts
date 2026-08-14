import * as Sentry from '@sentry/node';

import GraphQLClient from '../../../io/graphqlClient';
import type { Stats, TurboSnapBailReason, TurboSnapInternalErrorSubreason } from '../../../types';
import { TraceChangedFilesResult } from '../types';
import { captureBailException } from '../v1/captureBailException';
import { isNetworkError } from '../v1/errors';
import { classifyUploadHashesFailure } from './classifyUploadHashesFailure';
import { buildManifest, TurboSnapManifest, writeManifest } from './manifest';
import { ProjectFiles } from './projectFiles';
import { countNodeModulesFiles } from './statsGraph';
import { uploadHashes } from './uploadHashes';

interface TraceChangedFilesInput {
  graphqlClient: GraphQLClient;
  buildId: string;
  stats: Stats;
  manifestOutputDirectory: string;
  projectRoot: string;
  configDir: string;
  staticDirs: string[];
  staticDirsDeclared: boolean;
  projectFiles: ProjectFiles;
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
 * @param input.manifestOutputDirectory The directory to write the manifest file to.
 * @param input.projectRoot The absolute Storybook project root used to read source files off disk
 * and to anchor manifest keys.
 * @param input.configDir The project-relative Storybook config directory, hashed off disk because it
 * is never a bundler input.
 * @param input.staticDirs The project-relative static directories, hashed off disk for the same reason.
 * @param input.staticDirsDeclared Whether the prebuilt Storybook reports that its source config
 * declared static directories.
 * @param input.projectFiles How to read the disk; see {@link ProjectFiles}. Required rather than
 * defaulted, so a caller cannot silently reach the real disk.
 *
 * @returns The TurboSnap result.
 */
export async function traceChangedFiles(
  input: TraceChangedFilesInput
): Promise<TraceChangedFilesV2Result> {
  const { stats } = input;

  const staticDirectoriesBail = getStaticDirectoriesBail(input);
  if (staticDirectoriesBail) return staticDirectoriesBail;

  let manifest;
  try {
    manifest = await buildManifest(stats, input.projectRoot, {
      configDir: input.configDir,
      staticDirs: input.staticDirs,
      projectFiles: input.projectFiles,
    });
  } catch (error) {
    return internalErrorBail(error, 'manifestBuildFailed', 'buildManifest');
  }

  // Written here rather than at each exit below, because every one of them writes it: a bail is
  // exactly when the manifest is worth inspecting, and a degenerate graph still has to be debuggable.
  writeDiagnosticManifest(manifest, input.manifestOutputDirectory, input.projectFiles);

  const emptySectionBail = getEmptySectionBail(manifest, stats, input.staticDirs);
  if (emptySectionBail) return emptySectionBail;

  let response;
  try {
    response = await uploadHashes(input.graphqlClient, input.buildId, manifest);
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
        bailPath: 'uploadHashes',
      }),
    });
  }

  // Until we want to lean on the v2 output, we always fallback to v1.
  return { status: 'fallback' };
}

// Wraps a bail reason in the result shape the caller expects.
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

function writeDiagnosticManifest(
  manifest: TurboSnapManifest,
  outputDirectory: string,
  projectFiles: ProjectFiles
) {
  try {
    writeManifest(manifest, outputDirectory, projectFiles);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { turbo_snap_v2_diagnostic: 'writeManifest' },
    });
  }
}

/**
 * A prebuilt Storybook's project.json records whether static directories were declared, while their
 * paths must still be derived from the checked-out source. If those two sources disagree, continuing
 * would silently omit `staticFiles` even though we know the section should exist.
 *
 * @param input The static directory inputs to reconcile.
 * @param input.staticDirs The project-relative static directories derived from the source.
 * @param input.staticDirsDeclared Whether the prebuilt Storybook reports static directories were declared.
 *
 * @returns The bail result, or undefined when the two sources agree.
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
 * `storybookGlobals` — wider than v1.
 *
 * @param manifest The manifest built from the stats.
 *
 * @returns The bail result, or undefined when the graph contains story files.
 */
function getNoStoryFilesBail(manifest: TurboSnapManifest): TraceChangedFilesResult | undefined {
  if (manifest.storyFileHashes.size > 0) return undefined;
  return bailWith({ noStoryFiles: true });
}
