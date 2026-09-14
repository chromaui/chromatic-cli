import * as Sentry from '@sentry/node';

import GraphQLClient from '../../../io/graphqlClient';
import type { AbsolutePath, Stats } from '../../../types';
import type { Logger } from '../../log';
import { TraceChangedFilesResult } from '../types';
import { buildManifest, TurboSnapManifest, writeManifest } from './manifest';
import { ProjectFiles } from './projectFiles';
import { uploadHashes } from './uploadHashes';

/**
 * The level a v2 failure is logged at. We do this because we don't need logs showing up if the
 * user didn't request TurboSnap for the build. Debug logs are fine.
 */
export type FailureLogLevel = 'error' | 'debug';

interface TraceChangedFilesInput {
  log: Logger;
  failureLogLevel: FailureLogLevel;
  graphqlClient: GraphQLClient;
  buildId: string;
  stats: Stats;
  manifestPath: string;
  projectRoot: string;
  configDir: AbsolutePath;
  staticDirs: AbsolutePath[];
  projectFiles: ProjectFiles;
  storybookVersion?: string;
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
 * @param input.manifestPath The path to write the manifest file to.
 * @param input.projectRoot The absolute Storybook project root used to read source files off disk
 * and to anchor manifest keys.
 * @param input.configDir The absolute Storybook config directory, hashed off disk because it is
 * never a bundler input.
 * @param input.staticDirs The absolute static directories, hashed off disk for the same reason.
 * @param input.projectFiles How to read the disk; see {@link ProjectFiles}. Required rather than
 * defaulted, so a caller cannot silently reach the real disk.
 * @param input.failureLogLevel The level to log a v2 failure at, required rather than defaulted so a
 * caller cannot pick a level by accident.
 * @param input.storybookVersion The Storybook version the CLI already detected, used only when no
 * install can be resolved from disk and only when it is a concrete version.
 *
 * @returns The TurboSnap result.
 */
export async function traceChangedFiles(
  input: TraceChangedFilesInput
): Promise<TraceChangedFilesV2Result> {
  let manifest: TurboSnapManifest;
  try {
    manifest = await buildManifest(input.stats, {
      log: input.log,
      projectRoot: input.projectRoot,
      configDir: input.configDir,
      staticDirs: input.staticDirs,
      projectFiles: input.projectFiles,
      storybookVersion: input.storybookVersion,
    });
  } catch (error) {
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

  try {
    const response = await uploadHashes(input.graphqlClient, input.buildId, manifest);
    // The Index refuses in the payload rather than as a GraphQL error, so a refusal resolves instead
    // of throwing. We ignore the build it returns, but `errors` says whether the upload happened.
    if (response.errors?.length) {
      const messages = response.errors.map((error) => error.message ?? 'unknown error').join('; ');
      throw new Error(`The backend API rejected the hash upload: ${messages}`);
    }
  } catch (error) {
    return failed(input, 'Failed to upload hashes for TurboSnap v2', error);
  }

  input.log.debug('Uploaded hashes for TurboSnap v2 to Chromatic');

  // Until we want to lean on the v2 output, we always fallback to v1.
  return { status: 'fallback' };
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
