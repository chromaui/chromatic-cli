import * as Sentry from '@sentry/node';

import GraphQLClient from '../../../io/graphqlClient';
import type { AbsolutePath, Stats } from '../../../types';
import type { Logger } from '../../log';
import { TraceChangedFilesResult } from '../types';
import { buildManifest, TurboSnapManifest, writeManifest } from './manifest';
import { ProjectFiles } from './projectFiles';
import { uploadHashes } from './uploadHashes';

interface TraceChangedFilesInput {
  log: Logger;
  graphqlClient: GraphQLClient;
  buildId: string;
  stats: Stats;
  manifestPath: string;
  projectRoot: string;
  configDir: AbsolutePath;
  staticDirs: AbsolutePath[];
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
 * @param input.manifestPath The path to write the manifest file to.
 * @param input.projectRoot The absolute Storybook project root used to read source files off disk
 * and to anchor manifest keys.
 * @param input.configDir The absolute Storybook config directory, hashed off disk because it is
 * never a bundler input.
 * @param input.staticDirs The absolute static directories, hashed off disk for the same reason.
 * @param input.projectFiles How to read the disk; see {@link ProjectFiles}. Required rather than
 * defaulted, so a caller cannot silently reach the real disk.
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
    });
  } catch (error) {
    input.log.error('Failed to build manifest for TurboSnap v2', error);
    Sentry.captureException(error, {
      fingerprint: ['TurboSnap v2', 'Failed to build manifest'],
    });
    return { status: 'fallback' };
  }
  input.log.debug('Generated manifest for TurboSnap v2');

  // The manifest is written to the Storybook build output so it can be uploaded with other
  // diagnostic files.
  try {
    writeManifest(manifest, input.manifestPath, input.projectFiles);
  } catch (error) {
    input.log.error('Failed to write manifest for TurboSnap v2', error);
    Sentry.captureException(error, {
      fingerprint: ['TurboSnap v2', 'Failed to write manifest'],
    });
    return { status: 'fallback' };
  }
  input.log.debug(`Wrote manifest for TurboSnap v2 to ${input.manifestPath}`);

  try {
    // We currently don't care about the output of this function because we'll always fallback to
    // run TurboSnap v1
    await uploadHashes(input.graphqlClient, input.buildId, manifest);
  } catch (error) {
    input.log.error('Failed to upload hashes for TurboSnap v2', error);
    Sentry.captureException(error, {
      fingerprint: ['TurboSnap v2', 'Failed to upload hashes'],
    });
    return { status: 'fallback' };
  }
  input.log.debug('Uploaded hashes for TurboSnap v2 to Chromatic');

  // Until we want to lean on the v2 output, we always fallback to v1.
  return { status: 'fallback' };
}
