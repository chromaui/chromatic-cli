import { FileHash, FilePath, rollUpEntryHashes } from '../rollUps';

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
 * The three kinds of file in the graph. A hashed file is on disk and its bytes were hashed. A skipped
 * file is on disk but v2 left it unhashed; see {@link SKIPPED_HASH}. A synthetic file has nothing on
 * disk: a require-context glob, an external, a virtual module or an inline `data:` URL, kept because
 * the walks pass through it.
 */
export type FileKind = 'hashed' | 'skipped' | 'synthetic';

/**
 * Which kind of file a hash stands for; see {@link FileKind}. The one place the graph's hash values
 * are read as kinds, so every reader states which kinds it admits rather than testing the strings.
 *
 * @param hash The file's entry in the content hashes or in the graph: absent, or the empty string a
 * synthetic node is seeded with, when there is no file on disk.
 *
 * @returns The kind of file.
 */
export function fileKind(hash: FileHash | undefined): FileKind {
  if (!hash) return 'synthetic';
  return hash === SKIPPED_HASH ? 'skipped' : 'hashed';
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
    const hash = hashes.get(filePath);
    return fileKind(hash) === 'skipped' ? [] : [[filePath, hash ?? '']];
  });
  return rollUpEntryHashes(entries, h64ToString);
}

/**
 * Walks the stats graph from a file, collecting it and every file it transitively depends on.
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
