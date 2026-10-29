import * as Sentry from '@sentry/node';

import GraphQLClient from '../../../io/graphqlClient';
import type { AbsolutePath, HashBasedTurboSnap, Stats } from '../../../types';
import missingStorybookConfig from '../../../ui/messages/warnings/missingStorybookConfig';
import { TraceChangedFilesResult } from '../types';
import { buildManifest, TurboSnapManifest, writeManifest } from './manifest';
import { ManifestInput } from './manifestInput';
import { MissingStorybookConfigError } from './outOfGraphFiles';
import { BuildUploadHashesResponse, uploadHashes } from './uploadHashes';

/**
 * The level a v2 failure is logged at. We do this because we don't need logs showing up if the
 * user didn't request TurboSnap for the build. Debug logs are fine.
 */
export type FailureLogLevel = 'error' | 'debug';

/**
 * The input to build the manifest (see {@link ManifestInput}), plus what this entry point adds on
 * top: the stats to build it from, where to write it, how to upload it and how loudly to report a
 * failure. `gitRoot` is optional here because that is its type on `ctx.git`; {@link traceChangedFiles}
 * checks it is set, so callers don't have to.
 */
interface TraceChangedFilesInput extends Omit<ManifestInput, 'gitRoot'> {
  failureLogLevel: FailureLogLevel;
  onlyChanged: boolean;
  graphqlClient: GraphQLClient;
  buildId: string;
  stats: Stats;
  manifestPath: string;
  gitRoot: AbsolutePath | undefined;
}

/**
 * The result of running TurboSnap v2. In addition to the shared trace statuses, v2 can return
 * 'fallback' to tell the caller it can't be trusted to trace this build and v1 should run instead.
 * A fallback carries the Index's decision when it applies TurboSnap 2.0 to the build.
 */
export type TraceChangedFilesV2Result =
  | TraceChangedFilesResult
  | { status: 'fallback'; hashBased?: HashBasedTurboSnap };

/**
 * Determines which story files are affected by the changed source file hashes, bailing out of
 * TurboSnap when necessary.
 *
 * @param input The input to run TurboSnap 2.0; see {@link ManifestInput} for the manifest's share.
 * @param input.stats The preview stats file, read by the caller because v1 traces the same one.
 * @param input.manifestPath The path to write the manifest file to.
 * @param input.gitRoot The absolute git repository root, as it arrives on `ctx.git`. The gitInfo task
 * always sets it; its absence is reported as a v2 failure.
 * @param input.failureLogLevel The level to log a v2 failure at, required rather than defaulted so a
 * caller cannot pick a level by accident.
 * @param input.onlyChanged Whether the user requested TurboSnap for this build. The Index stores the
 * hashes either way but only applies TurboSnap when this is true.
 *
 * @returns The TurboSnap result.
 */
export async function traceChangedFiles(
  input: TraceChangedFilesInput
): Promise<TraceChangedFilesV2Result> {
  let manifest: TurboSnapManifest;
  try {
    manifest = await buildManifest(input.stats, {
      ...input,
      gitRoot: requireGitRoot(input.gitRoot),
    });
  } catch (error) {
    // A misconfigured project is the user's to fix, not a bug to report.
    if (error instanceof MissingStorybookConfigError) {
      input.log[input.failureLogLevel](missingStorybookConfig(error.configDirectory));
      return { status: 'fallback' };
    }
    return failed(input, 'Failed to build manifest for TurboSnap v2', error);
  }
  input.log.debug('Generated manifest for TurboSnap v2');

  // The manifest is written to the Storybook build output so it can be uploaded with other
  // diagnostic files.
  try {
    writeManifest(manifest, input.manifestPath, input.projectFiles);
  } catch (error) {
    return failed(input, 'Failed to write manifest for TurboSnap v2', error);
  }
  input.log.debug(`Wrote manifest for TurboSnap v2 to ${input.manifestPath}`);

  let response: BuildUploadHashesResponse;
  try {
    response = await uploadHashes(input.graphqlClient, input.buildId, manifest, {
      onlyChanged: input.onlyChanged,
    });
    // The Index refuses in the payload rather than as a GraphQL error, so a refusal resolves instead
    // of throwing. `errors` says whether the upload happened.
    if (response.errors?.length) {
      const messages = response.errors.map((error) => error.message ?? 'unknown error').join('; ');
      throw new Error(`The backend API rejected the hash upload: ${messages}`);
    }
  } catch (error) {
    return failed(input, 'Failed to upload hashes for TurboSnap v2', error);
  }

  // Log what the Index decided for this build (its TurboSnap mechanism, status, and hash bail
  // reason), so a CI log can tell whether it ran hash-based TurboSnap and, if not, why.
  input.log.debug(
    `Uploaded hashes for TurboSnap v2 to Chromatic: ${JSON.stringify(response.build)}`
  );

  // V1 still runs and sends its result either way; this only tells the caller whether the Index
  // decides this build by hash, so the terminal can report that instead of v1's result.
  return { status: 'fallback', hashBased: toHashBased(response.build) };
}

function toHashBased(build: BuildUploadHashesResponse['build']): HashBasedTurboSnap | undefined {
  if (build?.turboSnapMechanism !== 'HASH_BASED') return undefined;

  const bailed = build.turboSnapStatus === 'BAILED';
  return {
    bailed,
    ...(bailed && build.turboSnapHashBailReason && { bailReason: build.turboSnapHashBailReason }),
  };
}

/**
 * Narrows the repository root the gitInfo task resolved upstream. It is always set by the time
 * TurboSnap runs; the `Context` type just cannot say so.
 *
 * @param gitRoot The root as it arrives on `ctx.git`.
 *
 * @returns The absolute repository root.
 *
 * @throws {Error} When the root is missing, which is a bug upstream rather than a user error.
 */
function requireGitRoot(gitRoot: AbsolutePath | undefined): AbsolutePath {
  if (!gitRoot) {
    throw new Error(
      'git.rootPath unexpectedly undefined. Should have been set in the gitInfo task upstream.'
    );
  }
  return gitRoot;
}

function failed(
  input: Pick<TraceChangedFilesInput, 'log' | 'failureLogLevel'>,
  message: string,
  error: unknown
): TraceChangedFilesV2Result {
  input.log[input.failureLogLevel](message, error);
  Sentry.captureException(error);
  return { status: 'fallback' };
}
