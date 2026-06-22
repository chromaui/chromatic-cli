import { getFileHashes } from '../../lib/getFileHashes';
import { Context, Deps } from '../../types';
import { hashing } from '../../ui/tasks/prepare';

type CalculateFileHashesDeps = Pick<Deps, 'log' | 'options' | 'env' | 'report'>;

export interface CalculateFileHashesInput {
  fileInfo: NonNullable<Context['fileInfo']>;
  sourceDir: string;
}

export interface CalculateFileHashesOutput {
  hashes?: NonNullable<Context['fileInfo']>['hashes'];
}

/**
 * Calculates file hashes for all files to be uploaded.
 * File hashes are used for deduplication and integrity checking during upload.
 * Skips calculation if file hashing is disabled.
 *
 * @param deps - Logger, options, environment and the mid-task reporter.
 * @param input - The validated file info and source directory.
 *
 * @returns The calculated hashes, or none when hashing is disabled or fails.
 */
export async function calculateFileHashes(
  deps: CalculateFileHashesDeps,
  input: CalculateFileHashesInput
): Promise<CalculateFileHashesOutput> {
  if (!deps.options.fileHashing) return {};
  deps.report(hashing({ options: deps.options }));

  try {
    const start = Date.now();
    const hashes = await getFileHashes(
      input.fileInfo.paths,
      input.sourceDir,
      deps.env.CHROMATIC_HASH_CONCURRENCY
    );
    deps.log.debug(`Calculated file hashes in ${Date.now() - start}ms`);
    return { hashes };
  } catch (err) {
    deps.log.warn('Failed to calculate file hashes');
    deps.log.debug(err);
    return {};
  }
}
