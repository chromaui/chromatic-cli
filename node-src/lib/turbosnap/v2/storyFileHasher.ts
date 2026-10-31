import type { XXHashAPI } from 'xxhash-wasm';

import {
  collectTransitiveDependencies,
  FileHash,
  FilePath,
  hashEntryIdentity,
  SKIPPED_HASH,
  TurboSnapFile,
} from './graph';

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
  const incoming = new Map<FilePath, number>();
  for (const filePath of files.keys()) incoming.set(filePath, 0);
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
  storyFiles: Set<FilePath>
): SharedClosure | undefined {
  if (storyFiles.size < 2) return undefined;
  const incoming = countIncomingReferences(files);
  if (!incoming) return undefined;

  // Try only a few frequently imported modules, then choose the one that saves the most edge visits.
  const candidates = chooseAnchorCandidates(files, storyFiles, incoming);
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
  const pending: FilePath[] = [];
  const deferred: FilePath[] = [];
  let includesShared = false;

  function visit(path: FilePath) {
    if (path === shared.anchor) {
      includesShared = true;
      deferred.length = 0;
      return;
    }
    if (reached.has(path)) return;
    // Try the story's other imports first. Finding the anchor lets us skip all deferred imports.
    if (shared.dependencies.has(path)) {
      if (includesShared) return;
      deferred.push(path);
    } else {
      pending.push(path);
    }
    reached.add(path);
  }

  visit(filePath);
  while (true) {
    const current = pending.pop() ?? deferred.pop();
    if (current === undefined) break;
    for (const dependency of files.get(current)?.dependencies ?? []) visit(dependency);
  }
  return { reached, includesShared };
}

// Encode the shared entries once. Feed their byte ranges and the story's own entries to xxhash
// in the same order as sorting and joining every entry for the story.
function createSharedHasher(
  entries: string[],
  xxhash: Pick<XXHashAPI, 'h64ToString' | 'create64'>
) {
  const shared = Buffer.from(entries.join(''));
  const offsets = [0];
  let offset = 0;
  for (const entry of entries) {
    offset += Buffer.byteLength(entry);
    offsets.push(offset);
  }

  return (extras: string[]) => {
    // When most entries are private, joining the two sorted runs costs less than streaming each extra.
    if (extras.length >= entries.length) {
      return xxhash.h64ToString([...entries, ...extras].sort().join(''));
    }
    const hash = xxhash.create64();
    let sharedIndex = 0;
    for (const extra of extras) {
      let low = sharedIndex;
      let high = entries.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (entries[middle] < extra) low = middle + 1;
        else high = middle;
      }
      if (low > sharedIndex) hash.update(shared.subarray(offsets[sharedIndex], offsets[low]));
      hash.update(extra);
      sharedIndex = low;
    }
    hash.update(shared.subarray(offsets[sharedIndex]));
    return hash.digest().toString(16).padStart(16, '0');
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
 * @param hash The one-shot and streaming xxhash functions.
 *
 * @returns A story hasher with the same input bytes as rolling up ordinary transitive dependencies.
 */
export function createStoryFileHasher(
  files: Map<FilePath, TurboSnapFile>,
  hashes: Map<FilePath, FileHash>,
  storyFiles: Set<FilePath>,
  hash: Pick<XXHashAPI, 'h64ToString' | 'create64'>
): (filePath: FilePath) => FileHash {
  const identities = new Map<FilePath, string>();
  function sortedEntries(paths: Set<FilePath>, exclude?: Set<FilePath>): string[] {
    const entries: string[] = [];
    for (const path of paths) {
      if (exclude?.has(path)) continue;
      let identity = identities.get(path);
      if (identity === undefined) {
        const hash = hashes.get(path) ?? '';
        identity = hash === SKIPPED_HASH ? '' : hashEntryIdentity([path, hash]);
        identities.set(path, identity);
      }
      if (identity) entries.push(identity);
    }
    return entries.sort();
  }

  const shared = chooseSharedClosure(files, storyFiles);
  if (!shared) {
    return (story) =>
      hash.h64ToString(sortedEntries(collectTransitiveDependencies(files, story)).join(''));
  }

  const hashShared = createSharedHasher(sortedEntries(shared.dependencies), hash);
  return (story) => {
    const { reached, includesShared } = collectOutsideSharedClosure(files, story, shared);
    // A deferred import may reach the anchor through a cycle. Keep shared entries exactly once.
    const extras = sortedEntries(reached, includesShared ? shared.dependencies : undefined);
    return includesShared ? hashShared(extras) : hash.h64ToString(extras.join(''));
  };
}
