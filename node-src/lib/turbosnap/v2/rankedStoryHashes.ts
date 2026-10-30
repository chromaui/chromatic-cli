import type { XXHashAPI } from 'xxhash-wasm';

import { FileHash, FilePath, hashEntryIdentity, SKIPPED_HASH, TurboSnapFile } from './graph';

const WORD_BITS = 32;
const SAMPLE_SIZE = 128;
// Bound the extra memory and graph work before falling back to hashing one story at a time.
const MAX_INDEX_BYTES = 32 * 1024 * 1024;
const MAX_WORD_VISITS = 256 * 1024 * 1024;

type Files = Map<FilePath, TurboSnapFile>;

// Looking at a few roots is enough to avoid indexing small or disjoint subtrees. Missing a
// shared import here only changes which algorithm we use.
function sampleSubtree(files: Files, root: FilePath): Set<FilePath> {
  const reached = new Set([root]);
  for (const path of reached) {
    for (const child of files.get(path)?.dependencies ?? []) {
      reached.add(child);
      if (reached.size === SAMPLE_SIZE) return reached;
    }
  }
  return reached;
}

function hasLargeSharedSubtrees(files: Files, roots: FilePath[]): boolean {
  const samples = 8;
  const seen = new Set<FilePath>();
  let largeSamples = 0;
  let repeatedPaths = 0;
  for (let sample = 0; sample < samples; sample++) {
    const root = roots[Math.floor((sample * roots.length) / samples)];
    const reached = sampleSubtree(files, root);
    if (reached.size < SAMPLE_SIZE) continue;
    largeSamples++;
    for (const path of reached) {
      if (seen.has(path)) repeatedPaths++;
      seen.add(path);
    }
  }
  // A few common helpers do not justify indexing otherwise private dependency trees.
  return largeSamples >= samples / 2 && repeatedPaths >= (largeSamples * SAMPLE_SIZE) / 4;
}

interface ReachableFile {
  path: FilePath;
  dependencies: ReadonlySet<FilePath>;
  stories: Uint32Array;
  queued: boolean;
}

function mergeStoryBits(from: Uint32Array, into: Uint32Array): boolean {
  let changed = false;
  for (let word = 0; word < into.length; word++) {
    const added = from[word] & ~into[word];
    if (added) {
      into[word] |= added;
      changed = true;
    }
  }
  return changed;
}

// Propagate the set of stories which reach each file. A file is queued again only when it gains
// a story, so even a cyclic graph converges. Work and memory limits cover newly discovered files
// too, including dependencies without a graph record.
function collectMembership(
  files: Files,
  roots: FilePath[]
): Map<FilePath, ReachableFile> | undefined {
  const words = Math.ceil(roots.length / WORD_BITS);
  const maxNodes = Math.min(
    65_536,
    Math.floor(MAX_INDEX_BYTES / (words * Uint32Array.BYTES_PER_ELEMENT))
  );
  const reached = new Map<FilePath, ReachableFile>();
  const noDependencies = new Set<FilePath>();
  function addFile(path: FilePath): ReachableFile {
    const file = {
      path,
      dependencies: files.get(path)?.dependencies ?? noDependencies,
      stories: new Uint32Array(words),
      queued: false,
    };
    reached.set(path, file);
    return file;
  }
  function getFile(path: FilePath) {
    const existing = reached.get(path);
    if (existing) return existing;
    return reached.size < maxNodes ? addFile(path) : undefined;
  }
  let queue = roots.map((path, index) => {
    const node = addFile(path);
    node.stories[index >>> 5] = 1 << (index % WORD_BITS);
    return node;
  });
  let visits = 0;
  while (queue.length > 0) {
    const next: ReachableFile[] = [];
    for (const node of queue) {
      const children = node.dependencies;
      visits += children.size * words;
      if (visits > MAX_WORD_VISITS || children.size > maxNodes) return undefined;
      for (const path of children) {
        const child = getFile(path);
        if (!child) return undefined;
        if (mergeStoryBits(node.stories, child.stories) && !child.queued) {
          child.queued = true;
          next.push(child);
        }
      }
    }
    for (const node of next) node.queued = false;
    queue = next;
  }
  return reached;
}

interface RankedFile {
  identity: string;
  stories: Uint32Array;
}

// A block contains 32 consecutively sorted file identities. Its included files fit in one word;
// stories with the same word can reuse the same UTF-8 bytes.
function getBlockSelections(files: RankedFile[], start: number, stories: number) {
  const selections = new Uint32Array(stories);
  const common = new Uint32Array(Math.ceil(stories / WORD_BITS));
  for (let index = start; index < Math.min(start + WORD_BITS, files.length); index++) {
    const flag = 1 << (index - start);
    for (let word = 0; word < common.length; word++) {
      let bits = files[index].stories[word];
      // Use the first story in a group as the default. For a file shared by the whole group,
      // this sets one bit in common and visits no individual stories.
      if (bits & 1) {
        common[word] |= flag;
        bits = ~bits;
      }
      while (bits) {
        const story = word * WORD_BITS + 31 - Math.clz32(bits & -bits);
        if (story < stories) selections[story] |= flag;
        bits &= bits - 1;
      }
    }
  }
  for (let story = 0; story < stories; story++) selections[story] ^= common[story >>> 5];
  return selections;
}

function encodeBlock(files: RankedFile[], start: number, selection: number): Buffer {
  const entries: string[] = [];
  while (selection) {
    const bit = 31 - Math.clz32(selection & -selection);
    entries.push(files[start + bit].identity);
    selection &= selection - 1;
  }
  return Buffer.from(entries.join(''));
}

function rankFiles(membership: Map<FilePath, ReachableFile>, hashes: Map<FilePath, FileHash>) {
  const ranked: RankedFile[] = [];
  let inputBytes = 0;
  for (const { path, stories } of membership.values()) {
    const value = hashes.get(path) ?? '';
    if (value === SKIPPED_HASH) continue;
    // A code unit can expand to six characters when JSON escapes it.
    if (6 * (path.length + value.length) > MAX_INDEX_BYTES) return undefined;
    const identity = hashEntryIdentity([path, value]);
    inputBytes += Buffer.byteLength(identity);
    if (inputBytes > MAX_INDEX_BYTES) return undefined;
    ranked.push({ identity, stories });
  }
  // The manifest sorts JSON strings by UTF-16 code units before encoding them for xxhash.
  ranked.sort((left, right) => {
    if (left.identity === right.identity) return 0;
    return left.identity < right.identity ? -1 : 1;
  });

  return { ranked, inputBytes };
}

interface EncodedBlock {
  chunks: Buffer[];
  byStory: Uint16Array;
}

function encodeBlocks(ranked: RankedFile[], storyCount: number): EncodedBlock[] | undefined {
  const blocks: EncodedBlock[] = [];
  let cacheBytes =
    Math.ceil(ranked.length / WORD_BITS) * storyCount * Uint16Array.BYTES_PER_ELEMENT;
  if (cacheBytes > MAX_INDEX_BYTES) return undefined;
  for (let start = 0; start < ranked.length; start += WORD_BITS) {
    const selections = getBlockSelections(ranked, start, storyCount);
    const chunks: Buffer[] = [];
    const indexes = new Map<number, number>();
    const byStory = new Uint16Array(storyCount);
    for (const [story, selection] of selections.entries()) {
      let index = indexes.get(selection);
      if (index === undefined) {
        const chunk = encodeBlock(ranked, start, selection);
        // Account for many tiny Buffer objects as well as their payloads.
        cacheBytes += chunk.length + 128;
        if (cacheBytes > MAX_INDEX_BYTES) return undefined;
        index = chunks.length;
        indexes.set(selection, index);
        chunks.push(chunk);
      }
      byStory[story] = index;
    }
    blocks.push({ chunks, byStory });
  }

  return blocks;
}

/**
 * Hashes large, overlapping story subtrees in batches. Returns undefined when the shared index
 * would cost too much; the caller can use the ordinary story hasher without any partial results.
 *
 * @param files The immutable file graph.
 * @param hashes The file hashes, including skipped-file sentinels.
 * @param storyFiles The story roots in manifest order.
 * @param hash The xxhash instance used for the manifest.
 *
 * @returns Story hashes in their original order, or undefined to use the per-story walk.
 */
export function tryRankedStoryHashes(
  files: Files,
  hashes: Map<FilePath, FileHash>,
  storyFiles: Set<FilePath>,
  hash: Pick<XXHashAPI, 'h64Raw'>
): Map<FilePath, FileHash> | undefined {
  if (storyFiles.size < 64 || storyFiles.size > 4096) return undefined;
  const roots = [...storyFiles];
  if (!hasLargeSharedSubtrees(files, roots)) return undefined;
  const membership = collectMembership(files, roots);
  if (!membership) return undefined;

  const filesInOrder = rankFiles(membership, hashes);
  if (!filesInOrder) return undefined;
  const { ranked, inputBytes } = filesInOrder;
  const blocks = encodeBlocks(ranked, roots.length);
  if (!blocks) return undefined;

  const scratch = Buffer.allocUnsafe(inputBytes);
  const result = new Map<FilePath, FileHash>();
  for (const [story, path] of roots.entries()) {
    let offset = 0;
    for (const { byStory, chunks } of blocks) {
      const chunk = chunks[byStory[story]];
      scratch.set(chunk, offset);
      offset += chunk.length;
    }
    result.set(path, hash.h64Raw(scratch.subarray(0, offset)).toString(16).padStart(16, '0'));
  }
  return result;
}
