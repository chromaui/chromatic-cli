import { FileHash, FilePath, hashEntryIdentity, SKIPPED_HASH, TurboSnapFile } from './graph';

/**
 * The subset of xxhash-wasm the story roll-up needs. `h64Raw` hashes bytes; it gives the same digest
 * as `h64ToString` does for the string those bytes encode, which is what keeps this roll-up
 * byte-for-byte compatible with `rollUpFileHashes`.
 */
export interface StoryHasher {
  h64Raw(input: Uint8Array): bigint;
}

/**
 * Rolls every story file's transitive subtree up into a hash. Each hash is exactly what
 * `rollUpFileHashes(hashes, collectTransitiveDependencies(files, storyFile), …)` produces, so the
 * recipe in `graph.ts` (and the golden test guarding it) stays the source of truth; this is only a
 * faster way to evaluate it over every story at once.
 *
 * The per-story recipe sorts and re-encodes every entry of every subtree, so a graph where each
 * story imports a large shared library costs stories × library for each of those steps. Here the
 * work that only depends on the graph happens once: every node is numbered by the sorted position of
 * its entry identity and the identities are UTF-8 encoded once, in that order. A story's roll-up is
 * then its subtree's ranks in ascending order, which is a numeric sort for a small subtree or a bitset
 * scan for a large one, and its hash input is the byte ranges those ranks cover, copied out of the
 * shared buffer. Nothing per story touches a string or a `Map`.
 *
 * @param files The map of files to their hashes and dependencies.
 * @param hashes The hash of every on-disk file, keyed by canonical path, or `SKIPPED_HASH` for a file v2 skipped.
 * @param storyFiles The story files to roll up.
 * @param rollUpPath The path each file is rolled up under; see `buildRollUpPath`.
 * @param hasher The hash function.
 *
 * @returns The rolled-up hash of each story file's subtree, keyed by story file.
 */
export function hashStorySubtrees(
  files: Map<FilePath, TurboSnapFile>,
  hashes: Map<FilePath, FileHash>,
  storyFiles: ReadonlySet<FilePath>,
  rollUpPath: (filePath: FilePath) => FilePath,
  hasher: StoryHasher
): Map<FilePath, FileHash> {
  const numbered = numberNodes(files, storyFiles);
  const { rankOf, identities } = rankByIdentity(numbered.paths, hashes, rollUpPath);
  const encoded = encodeIdentities(identities, numbered.paths.length);
  const adjacency = buildAdjacency(numbered, rankOf);
  const scratch = createScratch(numbered.paths.length);

  const storyFileHashes = new Map<FilePath, FileHash>();
  for (const storyFile of storyFiles) {
    const root = rankOf[numbered.index.get(storyFile) as number];
    const size = collectSubtree(adjacency, root, scratch);
    const runCount = collectRuns(scratch, size);
    storyFileHashes.set(storyFile, hashRuns(scratch, runCount, encoded, hasher));
  }
  return storyFileHashes;
}

interface NumberedGraph {
  /** Every node's path by id: the graph's files first, in `files` order, so the i-th file has id i. */
  paths: FilePath[];
  index: Map<FilePath, number>;
  /** File id's dependencies are `edgeTargets[edgeStart[id]]` up to `edgeTargets[edgeStart[id + 1]]`. */
  edgeStart: Uint32Array;
  edgeTargets: Uint32Array;
}

/**
 * Numbers every node a walk can reach: the graph's files, then dependencies the graph has no entry
 * for and story files outside the graph, both of which a walk still visits.
 *
 * @param files The map of files to their hashes and dependencies.
 * @param storyFiles The story files to roll up.
 *
 * @returns The numbered nodes and the graph's edges in id space.
 */
function numberNodes(
  files: Map<FilePath, TurboSnapFile>,
  storyFiles: Iterable<FilePath>
): NumberedGraph {
  const paths: FilePath[] = [];
  const index = new Map<FilePath, number>();
  const number = (filePath: FilePath) => {
    let id = index.get(filePath);
    if (id === undefined) {
      id = paths.length;
      paths.push(filePath);
      index.set(filePath, id);
    }
    return id;
  };
  let edgeCount = 0;
  for (const [filePath, file] of files) {
    number(filePath);
    edgeCount += file.dependencies.size;
  }
  const edgeStart = new Uint32Array(files.size + 1);
  const edgeTargets = new Uint32Array(edgeCount);
  let edge = 0;
  let id = 0;
  for (const file of files.values()) {
    edgeStart[id] = edge;
    id += 1;
    for (const dependency of file.dependencies) {
      edgeTargets[edge] = number(dependency);
      edge += 1;
    }
  }
  edgeStart[files.size] = edge;
  for (const storyFile of storyFiles) number(storyFile);
  return { paths, index, edgeStart, edgeTargets };
}

/**
 * Ranks every node by its entry identity (see `hashEntryIdentity`), so a subtree's entries in
 * sorted order are its ranks in ascending order. Skipped files have no identity and rank after every
 * hashed node, where no byte range reaches them.
 *
 * @param paths Every node's path by id.
 * @param hashes The hash of every on-disk file, keyed by canonical path.
 * @param rollUpPath The path each file is rolled up under.
 *
 * @returns Each id's rank, and the identities in rank order (shorter than `paths` by the skipped nodes).
 */
function rankByIdentity(
  paths: FilePath[],
  hashes: Map<FilePath, FileHash>,
  rollUpPath: (filePath: FilePath) => FilePath
): { rankOf: Uint32Array; identities: string[] } {
  const identityOf: string[] = [];
  const hashed: number[] = [];
  const skipped: number[] = [];
  for (const [id, filePath] of paths.entries()) {
    const contentHash = hashes.get(filePath) ?? '';
    if (contentHash === SKIPPED_HASH) {
      skipped.push(id);
    } else {
      identityOf[id] = hashEntryIdentity([rollUpPath(filePath), contentHash]);
      hashed.push(id);
    }
  }
  // The same order as the default `Array#sort` the recipe applies to its identities.
  hashed.sort((a, b) => {
    if (identityOf[a] < identityOf[b]) return -1;
    return identityOf[a] > identityOf[b] ? 1 : 0;
  });
  const rankOf = new Uint32Array(paths.length);
  const identities: string[] = [];
  for (const [rank, id] of [...hashed, ...skipped].entries()) {
    rankOf[id] = rank;
    if (rank < hashed.length) identities.push(identityOf[id]);
  }
  return { rankOf, identities };
}

interface EncodedIdentities {
  /** Every identity's UTF-8 bytes, in rank order. */
  bytes: Uint8Array;
  /** Where each rank's bytes start; a skipped rank is an empty range at the end. */
  byteOffsets: Uint32Array;
}

/**
 * Encodes the identities once, as the UTF-8 bytes `h64ToString` would hash. No identity ends in a
 * lone surrogate (JSON escapes those), so encoding them joined gives the same bytes as encoding each.
 *
 * @param identities The identities in rank order.
 * @param count The number of nodes, including skipped ones.
 *
 * @returns The bytes and each rank's offset into them.
 */
function encodeIdentities(identities: string[], count: number): EncodedIdentities {
  const bytes = new TextEncoder().encode(identities.join(''));
  const byteOffsets = new Uint32Array(count + 1);
  let offset = 0;
  for (const [rank, identity] of identities.entries()) {
    byteOffsets[rank] = offset;
    offset += Buffer.byteLength(identity);
  }
  byteOffsets.fill(offset, identities.length);
  return { bytes, byteOffsets };
}

interface Adjacency {
  /** Rank's dependencies are `targets[start[rank]]` up to `targets[start[rank + 1]]`. */
  start: Uint32Array;
  targets: Uint32Array;
}

/**
 * Translates the graph's edges from id space to rank space.
 *
 * @param numbered The numbered nodes and their edges.
 * @param rankOf Each id's rank.
 *
 * @returns The edges in rank space.
 */
function buildAdjacency(numbered: NumberedGraph, rankOf: Uint32Array): Adjacency {
  const { paths, edgeStart, edgeTargets } = numbered;
  const fileCount = edgeStart.length - 1;
  const start = new Uint32Array(paths.length + 1);
  for (let id = 0; id < fileCount; id += 1) {
    start[rankOf[id] + 1] = edgeStart[id + 1] - edgeStart[id];
  }
  for (let rank = 0; rank < paths.length; rank += 1) start[rank + 1] += start[rank];
  const targets = new Uint32Array(edgeTargets.length);
  for (let id = 0; id < fileCount; id += 1) {
    let position = start[rankOf[id]];
    for (let edge = edgeStart[id]; edge < edgeStart[id + 1]; edge += 1) {
      targets[position] = rankOf[edgeTargets[edge]];
      position += 1;
    }
  }
  return { start, targets };
}

/** Buffers reused across stories, so a walk allocates nothing. */
interface Scratch {
  /** The stamp of the last walk that visited each rank; a new stamp per story clears it for free. */
  visited: Uint32Array;
  stamp: number;
  stack: Uint32Array;
  /** The ranks the current walk found, in visit order. */
  found: Uint32Array;
  /** One bit per rank, for ordering a large subtree without sorting it. */
  bits: Uint32Array;
  /** A subtree is ordered by bitset scan past this many ranks, by numeric sort up to it. */
  bitsetThreshold: number;
  /** The ordered ranks as half-open runs: `runs[2 * i]` up to `runs[2 * i + 1]`. */
  runs: Uint32Array;
  /** The bytes to hash for the current story. */
  output: Uint8Array;
}

/**
 * @param count The number of nodes.
 *
 * @returns Empty scratch buffers for walking that many nodes.
 */
function createScratch(count: number): Scratch {
  return {
    visited: new Uint32Array(count),
    stamp: 0,
    stack: new Uint32Array(1024),
    found: new Uint32Array(1024),
    bits: new Uint32Array((count + 31) >>> 5),
    // Sorting costs about k·log k while a scan costs count / 32 words, so a scan wins past a few
    // hundredths of the graph. Below 64 ranks the sort is cheaper no matter how small the graph is.
    bitsetThreshold: Math.max(64, Math.floor(count / 512)),
    runs: new Uint32Array(2048),
    output: new Uint8Array(65_536),
  };
}

/**
 * Walks the graph from a root, the same way `collectTransitiveDependencies` does, recording every
 * rank reached in `scratch.found`.
 *
 * @param adjacency The edges in rank space.
 * @param root The rank to start from.
 * @param scratch The walk's buffers.
 *
 * @returns The number of ranks reached.
 */
function collectSubtree(adjacency: Adjacency, root: number, scratch: Scratch): number {
  const { start, targets } = adjacency;
  scratch.stamp += 1;
  const { visited, stamp } = scratch;
  let top = 0;
  let size = 0;
  scratch.stack[top] = root;
  top += 1;
  while (top > 0) {
    top -= 1;
    const rank = scratch.stack[top];
    if (visited[rank] === stamp) continue;
    visited[rank] = stamp;
    if (size === scratch.found.length) scratch.found = grow(scratch.found, size + 1);
    scratch.found[size] = rank;
    size += 1;
    const end = start[rank + 1];
    if (top + end - start[rank] > scratch.stack.length) {
      scratch.stack = grow(scratch.stack, top + end - start[rank]);
    }
    for (let edge = start[rank]; edge < end; edge += 1) {
      scratch.stack[top] = targets[edge];
      top += 1;
    }
  }
  return size;
}

/**
 * Orders the ranks a walk found and groups consecutive ones into runs, in `scratch.runs`.
 *
 * @param scratch The walk's buffers, with `found` holding `size` ranks.
 * @param size The number of ranks the walk found.
 *
 * @returns The number of entries written to `scratch.runs` (twice the number of runs).
 */
function collectRuns(scratch: Scratch, size: number): number {
  if (scratch.runs.length < 2 * size) scratch.runs = new Uint32Array(4 * size);
  if (size <= scratch.bitsetThreshold) {
    return runsFromSorted(scratch.found.subarray(0, size).sort(), scratch.runs);
  }
  return runsFromBitset(scratch.found.subarray(0, size), scratch.bits, scratch.runs);
}

/**
 * @param sorted Ranks in ascending order.
 * @param runs Where to write the runs.
 *
 * @returns The number of entries written.
 */
function runsFromSorted(sorted: Uint32Array, runs: Uint32Array): number {
  let runCount = 0;
  let runStart = sorted[0];
  let previous = sorted[0];
  for (let position = 1; position < sorted.length; position += 1) {
    const rank = sorted[position];
    if (rank !== previous + 1) {
      runs[runCount] = runStart;
      runs[runCount + 1] = previous + 1;
      runCount += 2;
      runStart = rank;
    }
    previous = rank;
  }
  runs[runCount] = runStart;
  runs[runCount + 1] = previous + 1;
  return runCount + 2;
}

/**
 * Orders ranks by setting their bits and scanning the words that were touched, clearing them on the
 * way so the bitset is empty again for the next story.
 *
 * @param found Ranks in any order.
 * @param bits The bitset, with every bit clear.
 * @param runs Where to write the runs.
 *
 * @returns The number of entries written.
 */
function runsFromBitset(found: Uint32Array, bits: Uint32Array, runs: Uint32Array): number {
  let lastWord = 0;
  for (const rank of found) {
    const word = rank >>> 5;
    bits[word] |= 1 << (rank & 31);
    if (word > lastWord) lastWord = word;
  }
  let runCount = 0;
  let runStart = -1;
  let previous = -2;
  for (let word = 0; word <= lastWord; word += 1) {
    let value = bits[word];
    if (value === 0) continue;
    bits[word] = 0;
    while (value !== 0) {
      const lowest = value & -value;
      const rank = (word << 5) + 31 - Math.clz32(lowest);
      value ^= lowest;
      if (rank !== previous + 1) {
        if (runStart >= 0) {
          runs[runCount] = runStart;
          runs[runCount + 1] = previous + 1;
          runCount += 2;
        }
        runStart = rank;
      }
      previous = rank;
    }
  }
  runs[runCount] = runStart;
  runs[runCount + 1] = previous + 1;
  return runCount + 2;
}

/**
 * Copies the identity bytes of every run into one buffer and hashes it.
 *
 * @param scratch The walk's buffers, with `runs` holding `runCount` entries.
 * @param runCount The number of entries in `scratch.runs`.
 * @param encoded The identity bytes and offsets.
 * @param hasher The hash function.
 *
 * @returns The story's rolled-up hash.
 */
function hashRuns(
  scratch: Scratch,
  runCount: number,
  encoded: EncodedIdentities,
  hasher: StoryHasher
): FileHash {
  const { bytes, byteOffsets } = encoded;
  let length = 0;
  for (let run = 0; run < runCount; run += 2) {
    length += byteOffsets[scratch.runs[run + 1]] - byteOffsets[scratch.runs[run]];
  }
  if (length > scratch.output.length) {
    scratch.output = new Uint8Array(Math.max(length, scratch.output.length * 2));
  }
  let position = 0;
  for (let run = 0; run < runCount; run += 2) {
    const from = byteOffsets[scratch.runs[run]];
    const to = byteOffsets[scratch.runs[run + 1]];
    scratch.output.set(bytes.subarray(from, to), position);
    position += to - from;
  }
  // The same formatting as xxhash-wasm's `h64ToString`: 16 lowercase hex digits.
  return hasher.h64Raw(scratch.output.subarray(0, length)).toString(16).padStart(16, '0');
}

/**
 * @param array The buffer to grow.
 * @param needed The minimum length the buffer must reach.
 *
 * @returns A copy of the buffer at least `needed` long and at least twice as long as before.
 */
function grow(array: Uint32Array, needed: number): Uint32Array {
  const next = new Uint32Array(Math.max(needed, array.length * 2));
  next.set(array);
  return next;
}
