export type FilePath = string;
export type FileHash = string;

export interface TurboSnapFile {
  hash: FileHash;
  dependencies: Set<FilePath>;
}

/**
 * Rolls a set of files up into a single hash, looking each file's content hash up by path. Reading
 * from `hashes` (not `files`) also includes leaf dependencies.
 *
 * This is the shared recipe for both a story-file hash and a `storybookFiles` entry, so the two are
 * directly comparable.
 *
 * @param hashes The content hashes keyed by canonical file path.
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
  const entries = [...filePaths].map((filePath): [FilePath, FileHash] => [
    filePath,
    hashes.get(filePath) ?? '',
  ]);
  return rollUpEntryHashes(entries, h64ToString);
}

/**
 * Rolls path/content-hash pairs up into a single hash. Entries are sorted so the result doesn't
 * depend on iteration order.
 *
 * Every roll-up depends on both content and path, because a file's path reaches the output: a static
 * asset is served at its path, a Storybook config file is loaded by name, and a module's path is
 * baked into emitted chunk names, `import.meta.url` and CSS-Module class names. So the same bytes at
 * a new path can render differently and have to move the hash. Keys are project-root-relative, which
 * is what keeps a hash stable when the project itself moves within the repository.
 *
 * @param entries The path/content-hash pairs to roll up.
 * @param h64ToString The hash function.
 *
 * @returns The rolled-up hash.
 */
export function rollUpEntryHashes(
  entries: Iterable<[FilePath, FileHash]>,
  h64ToString: (input: string) => string
): FileHash {
  return h64ToString(hashEntryIdentities(entries));
}

/**
 * Encodes a set of key/value pairs as one string, sorted so the result doesn't depend on iteration
 * order. Both the roll-ups and the top-level `storybookHash` gate build on this, so a key change is
 * as visible as a value change everywhere.
 *
 * @param entries The key/value pairs to encode.
 *
 * @returns The encoded entries, concatenated.
 */
export function hashEntryIdentities(entries: Iterable<[string, string]>): string {
  return [...entries]
    .map((entry) => hashEntryIdentity(entry))
    .sort()
    .join('');
}

/**
 * Encodes a key and value as a single string, length-prefixing each so no pair of entries can
 * concatenate into the same bytes as a different pair.
 *
 * @param entry The key/value pair to encode.
 *
 * @returns The encoded entry.
 */
export function hashEntryIdentity([key, value]: [string, string]): string {
  return `${key.length}:${key}${value.length}:${value}`;
}

/**
 * Walks the dependency graph from a file, collecting it and every file it transitively depends on.
 *
 * @param files The map of files to their hashes and dependencies.
 * @param filePath The file to collect the transitive dependencies of.
 * @param dependencies The set of dependencies to add to.
 *
 * @returns A set of all the files that the given file transitively depends on.
 */
export function collectTransitiveDependencies(
  files: Map<FilePath, TurboSnapFile>,
  filePath: FilePath,
  dependencies = new Set<FilePath>()
) {
  if (dependencies.has(filePath)) {
    return dependencies;
  }

  dependencies.add(filePath);
  for (const dependency of files.get(filePath)?.dependencies ?? []) {
    collectTransitiveDependencies(files, dependency, dependencies);
  }

  return dependencies;
}
