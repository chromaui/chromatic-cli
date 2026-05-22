import { getFileHashes } from '@cli/getFileHashes';

import type { Deps, FileInfo } from '../../types';

type CalculateFileHashesDeps = Pick<Deps, 'log' | 'env'>;

export interface CalculateFileHashesInput {
  fileInfo: FileInfo;
  sourceDir: string;
}

/**
 * Calculates file hashes for all files to be uploaded.
 * File hashes are used for deduplication and integrity checking during upload.
 * Skips calculation if file hashing is disabled or the task is being skipped.
 *
 * @param deps - The CLI dependencies containing logging and environment access
 * @param input - The input containing file information for hashing
 *
 * @returns A mapping of file paths to their calculated hashes.
 */
export async function calculateFileHashes(
  deps: CalculateFileHashesDeps,
  input: CalculateFileHashesInput
): Promise<Record<string, string>> {
  const start = Date.now();
  const hashes = await getFileHashes(
    input.fileInfo.paths,
    input.sourceDir,
    deps.env.CHROMATIC_HASH_CONCURRENCY
  );
  deps.log.debug(`Calculated file hashes in ${Date.now() - start}ms`);
  return hashes;
}
