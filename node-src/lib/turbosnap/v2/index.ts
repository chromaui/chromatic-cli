import GraphQLClient from '../../../io/graphqlClient';
import { readStatsFile } from '../../../tasks/readStatsFile';
import { TraceChangedFilesResult } from '../types';
import { determineChangedFiles } from './api';
import { buildManifest, writeManifest } from './manifest';

interface TraceChangedFilesInput {
  graphqlClient: GraphQLClient;
  buildId: string;
  statsPath: string;
  manifestOutputDirectory: string;
}

/**
 * Determines which story files are affected by the changed source file hashes, bailing out of TurboSnap
 * when necessary.
 *
 * @param input The input to run TurboSnap 2.0.
 * @param input.statsPath The path to the stats file.
 * @param input.manifestOutputDirectory The directory to write the manifest file to.
 *
 * @returns The trace result: skipped, bailed, or traced with the affected story files.
 */
export async function traceChangedFiles(
  input: TraceChangedFilesInput
): Promise<TraceChangedFilesResult> {
  const stats = await readStatsFile(input.statsPath);
  const manifest = await buildManifest(stats);
  await determineChangedFiles(input.graphqlClient, input.buildId, manifest);
  writeManifest(manifest, input.manifestOutputDirectory);

  return {
    status: 'skipped',
  };
}
