import { getFileHashes } from '../../getFileHashes';
import { FileHash } from './graph';

// Bounds how many files are read concurrently. getFileHashes allocates a 64K read buffer per
// in-flight file, so this also caps peak memory regardless of how many files are hashed.
const HASH_CONCURRENCY = 10;

/**
 * Content-hashes files by absolute path.
 *
 * Shared by the graph hashing and the out-of-graph sections so both use one concurrency bound and
 * one calling convention; each keys the result its own way.
 *
 * @param absolutePaths The absolute paths to hash.
 *
 * @returns The content hash of each file, keyed by the absolute path it was read from.
 */
export async function hashAbsolutePaths(
  absolutePaths: string[]
): Promise<Record<string, FileHash>> {
  if (absolutePaths.length === 0) return {};

  // getFileHashes joins its directory argument with each file; pass '' so the absolute paths are
  // used as-is, and it returns hashes keyed by those absolute paths.
  return getFileHashes(absolutePaths, '', HASH_CONCURRENCY);
}
