import {
  collectTransitiveDependencies,
  FileHash,
  FilePath,
  hashEntryIdentity,
  rollUpFileHashes,
  SKIPPED_HASH,
  TurboSnapFile,
} from './graph';

interface RankedHashes {
  rankByPath: Map<FilePath, number>;
  encodedByRank: string[];
}

function rankHashes(hashes: Map<FilePath, FileHash>): RankedHashes {
  const entries: [FilePath, string][] = [];
  for (const [filePath, hash] of hashes) {
    if (hash === SKIPPED_HASH) continue;
    entries.push([filePath, hashEntryIdentity([filePath, hash ?? ''])]);
  }
  // Rank the encoded pairs, not raw paths: JSON escaping changes their lexical order.
  entries.sort((left, right) => {
    if (left[1] === right[1]) return 0;
    return left[1] < right[1] ? -1 : 1;
  });
  const rankByPath = new Map<FilePath, number>();
  const encodedByRank: string[] = [];
  for (const [filePath, encoded] of entries) {
    rankByPath.set(filePath, encodedByRank.length);
    encodedByRank.push(encoded);
  }
  return { rankByPath, encodedByRank };
}

function mergeEncodedPaths(ranks: Uint32Array, encodedByRank: string[], unknown: string[]): string {
  const parts: string[] = [];
  let unknownIndex = 0;
  for (const rank of ranks) {
    const encoded = encodedByRank[rank];
    while (unknownIndex < unknown.length && unknown[unknownIndex] < encoded) {
      parts.push(unknown[unknownIndex++]);
    }
    parts.push(encoded);
  }
  while (unknownIndex < unknown.length) parts.push(unknown[unknownIndex++]);
  return parts.join('');
}

function encodeRankedPaths(
  hashes: Map<FilePath, FileHash>,
  ranked: RankedHashes,
  filePaths: Iterable<FilePath>
): string {
  // Materialize once so generators work too; repeated paths must keep their multiplicity.
  const paths = [...filePaths];
  const ranks = new Uint32Array(paths.length);
  const unknown: string[] = [];
  let count = 0;
  for (const filePath of paths) {
    const rank = ranked.rankByPath.get(filePath);
    if (rank === undefined) {
      const hash = hashes.get(filePath) ?? '';
      if (hash === SKIPPED_HASH) continue;
      unknown.push(hashEntryIdentity([filePath, hash]));
    } else {
      ranks[count++] = rank;
    }
  }
  const known = ranks.subarray(0, count);
  known.sort();
  unknown.sort();
  return mergeEncodedPaths(known, ranked.encodedByRank, unknown);
}

/**
 * Reuses encoded file identities within one manifest. The hashes map must remain unchanged while
 * this hasher is in use. Each roll-up still sorts its members, using numeric ranks for known files
 * and the original UTF-16 ordering for missing files.
 *
 * @param hashes The manifest's immutable file hashes, including skipped-file sentinels.
 * @param h64ToString The hash function.
 *
 * @returns A roll-up function with the same hash input bytes as `rollUpFileHashes`.
 */
export function createManifestFileHasher(
  hashes: Map<FilePath, FileHash>,
  h64ToString: (input: string) => string
): (filePaths: Iterable<FilePath>) => FileHash {
  if (hashes.size >= 2 ** 32) {
    return (filePaths) => rollUpFileHashes(hashes, filePaths, h64ToString);
  }
  const ranked = rankHashes(hashes);
  return (filePaths) => h64ToString(encodeRankedPaths(hashes, ranked, filePaths));
}

const MAX_GRAPH_KEYS = 65_536;
const MAX_ANCHOR_CANDIDATES = 8;

interface AnchorCandidate {
  filePath: FilePath;
  references: number;
  score: number;
}

interface SharedClosure {
  anchor: FilePath;
  dependencies: Set<FilePath>;
}

function countIncomingReferences(
  files: Map<FilePath, TurboSnapFile>
): Map<FilePath, number> | undefined {
  if (files.size > MAX_GRAPH_KEYS) return undefined;
  const incoming = new Map([...files.keys()].map((filePath) => [filePath, 0]));
  for (const file of files.values()) {
    for (const dependency of file.dependencies) {
      incoming.set(dependency, (incoming.get(dependency) ?? 0) + 1);
      // Dangling dependencies count toward the bound too, before any closure is materialized.
      if (incoming.size > MAX_GRAPH_KEYS) return undefined;
    }
  }
  return incoming;
}

function chooseAnchorCandidates(
  files: Map<FilePath, TurboSnapFile>,
  storyFiles: Set<FilePath>,
  incoming: Map<FilePath, number>
): AnchorCandidate[] {
  const candidates: AnchorCandidate[] = [];
  for (const [filePath, file] of files) {
    const references = incoming.get(filePath) ?? 0;
    if (storyFiles.has(filePath) || references < 2 || file.dependencies.size === 0) continue;
    candidates.push({ filePath, references, score: references * file.dependencies.size });
    candidates.sort((left, right) => right.score - left.score);
    if (candidates.length > MAX_ANCHOR_CANDIDATES) candidates.pop();
  }
  return candidates;
}

function chooseSharedClosure(
  files: Map<FilePath, TurboSnapFile>,
  candidates: AnchorCandidate[]
): SharedClosure | undefined {
  let best: SharedClosure | undefined;
  let bestScore = 0;
  for (const candidate of candidates) {
    const dependencies = collectTransitiveDependencies(files, candidate.filePath);
    let edges = 0;
    for (const dependency of dependencies) edges += files.get(dependency)?.dependencies.size ?? 0;
    const score = candidate.references * edges;
    if (score > bestScore) {
      best = { anchor: candidate.filePath, dependencies };
      bestScore = score;
    }
  }
  return best;
}

function collectOutsideSharedClosure(
  files: Map<FilePath, TurboSnapFile>,
  filePath: FilePath,
  shared: SharedClosure
): { reached: Set<FilePath>; includesShared: boolean } {
  const reached = new Set<FilePath>();
  const pending = [filePath];
  let includesShared = false;
  while (pending.length > 0) {
    const current = pending.pop();
    if (
      current === undefined ||
      reached.has(current) ||
      (includesShared && shared.dependencies.has(current))
    ) {
      continue;
    }
    if (current === shared.anchor) {
      // Only the anchor proves this whole closure is reachable. A descendant alone does not.
      includesShared = true;
    } else {
      reached.add(current);
      for (const dependency of files.get(current)?.dependencies ?? []) pending.push(dependency);
    }
  }
  return { reached, includesShared };
}

function encodeSortedPaths(hashes: Map<FilePath, FileHash>, paths: Iterable<FilePath>): string[] {
  const encoded: string[] = [];
  for (const filePath of paths) {
    const hash = hashes.get(filePath) ?? '';
    if (hash !== SKIPPED_HASH) encoded.push(hashEntryIdentity([filePath, hash]));
  }
  return encoded.sort();
}

function createSharedHashInput(
  hashes: Map<FilePath, FileHash>,
  shared: SharedClosure
): (reached: Set<FilePath>) => string {
  const entries = encodeSortedPaths(hashes, shared.dependencies);
  // String slicing and string comparison both use UTF-16 code units, including lone surrogates.
  const offsets = [0];
  let offset = 0;
  for (const entry of entries) {
    offset += entry.length;
    offsets.push(offset);
  }
  const joined = entries.join('');

  return (reached) => {
    // Some shared members may have been visited before the anchor. Include them only once.
    const extras = encodeSortedPaths(
      hashes,
      [...reached].filter((filePath) => !shared.dependencies.has(filePath))
    );
    if (extras.length === 0) return joined;

    const parts: string[] = [];
    let sharedIndex = 0;
    for (const extra of extras) {
      let low = sharedIndex;
      let high = entries.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (entries[middle] < extra) low = middle + 1;
        else high = middle;
      }
      if (low > sharedIndex) parts.push(joined.slice(offsets[sharedIndex], offsets[low]));
      parts.push(extra);
      sharedIndex = low;
    }
    parts.push(joined.slice(offsets[sharedIndex]));
    return parts.join('');
  };
}

/**
 * Hashes story subtrees, reusing one completed closure's sorted encoding within a manifest. Reaching
 * its anchor adds the cached encoding, while the walk and merge handle only the other dependencies.
 * The graph, hashes and story set must remain unchanged while this hasher is in use. Candidate
 * selection retains only a best and a trial closure; graphs above the bound use the ordinary walker.
 *
 * @param files The manifest's immutable dependency graph.
 * @param hashes The manifest's immutable file hashes, including skipped-file sentinels.
 * @param storyFiles The manifest's story roots, excluded from anchor selection.
 * @param h64ToString The hash function.
 * @param hashFiles The manifest's ordinary iterable hasher, reused for roots outside the closure.
 *
 * @returns A story hasher with the same input bytes as rolling up ordinary transitive dependencies.
 */
export function createStoryFileHasher(
  files: Map<FilePath, TurboSnapFile>,
  hashes: Map<FilePath, FileHash>,
  storyFiles: Set<FilePath>,
  h64ToString: (input: string) => string,
  hashFiles = createManifestFileHasher(hashes, h64ToString)
): (filePath: FilePath) => FileHash {
  const incoming = countIncomingReferences(files);
  const shared =
    incoming && chooseSharedClosure(files, chooseAnchorCandidates(files, storyFiles, incoming));
  incoming?.clear();
  if (!shared) return (filePath) => hashFiles(collectTransitiveDependencies(files, filePath));
  const sharedHashInput = createSharedHashInput(hashes, shared);
  return (filePath) => {
    const { reached, includesShared } = collectOutsideSharedClosure(files, filePath, shared);
    return includesShared ? h64ToString(sharedHashInput(reached)) : hashFiles(reached);
  };
}
