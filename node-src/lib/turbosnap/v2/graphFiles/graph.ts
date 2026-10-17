import { FileHash, FilePath, rollUpEntryHashes } from '../rollUps/rollUp';

/**
 * The hash of a real file v2 deliberately did not content-hash; see `buildSkipRule`. It can never
 * collide with a real hash, because xxh64 output is 16 hex characters.
 *
 * A skipped file contributes nothing to any roll-up, not even its path: a generated file is often
 * renamed every build, so its path alone would move the roll-up each time. It stays in the graph so a
 * skipped story file is still a story file and, for a gitignored file, so the edges through it
 * survive, which is how a tracked file imported through a generated barrel still rolls up into the
 * story. An untraced file keeps no edges; see `SkipReason`.
 */
export const SKIPPED_HASH: FileHash = '<skipped>';

/**
 * Whether a file has a content hash: it is on disk and v2 did not skip it. The test every hashing home
 * applies before admitting a file, so skipped files land nowhere.
 *
 * @param hashes The hash of every on-disk file, keyed by canonical path.
 * @param filePath The file to test.
 *
 * @returns Whether the file's bytes were hashed.
 */
export function hasContentHash(hashes: Map<FilePath, FileHash>, filePath: FilePath): boolean {
  const hash = hashes.get(filePath);
  return hash !== undefined && hash !== SKIPPED_HASH;
}

export interface TurboSnapFile {
  hash: FileHash;
  dependencies: Set<FilePath>;
}

/**
 * Rolls a set of files up into a single hash, looking each file's content hash up by path. A file v2
 * skipped is left out entirely; see {@link SKIPPED_HASH}.
 *
 * @param hashes The hash of every on-disk file, keyed by canonical path, or `SKIPPED_HASH` for a file v2 skipped.
 * @param filePaths The files to roll up.
 * @param h64ToString The hash function.
 *
 * @returns The rolled-up hash.
 */
export function rollUpFileHashes(
  hashes: Map<FilePath, FileHash>,
  filePaths: Iterable<FilePath>,
  h64ToString: (input: string) => string
): FileHash {
  const entries = [...filePaths].flatMap((filePath): [FilePath, FileHash][] => {
    const hash = hashes.get(filePath) ?? '';
    return hash === SKIPPED_HASH ? [] : [[filePath, hash]];
  });
  return rollUpEntryHashes(entries, h64ToString);
}

/**
 * Walks the dependency graph from a file, collecting it and every file it transitively depends on.
 *
 * @param files The map of files to their hashes and dependencies.
 * @param filePath The file to collect the transitive dependencies of.
 * @param dependencies The set of dependencies to add to.
 * @param stopAt Files the walk does not include (nor their dependencies).
 *
 * @returns A set of all the files that the given file transitively depends on.
 */
export function collectTransitiveDependencies(
  files: Map<FilePath, TurboSnapFile>,
  filePath: FilePath,
  dependencies = new Set<FilePath>(),
  stopAt = new Set<FilePath>()
) {
  const unvisited: FilePath[] = [filePath];

  while (unvisited.length > 0) {
    const current = unvisited.pop();
    if (current === undefined || dependencies.has(current) || stopAt.has(current)) {
      continue;
    }

    dependencies.add(current);
    unvisited.push(...(files.get(current)?.dependencies ?? []));
  }

  return dependencies;
}
