export type FilePath = string;
export type FileHash = string;

/**
 * Rolls path/content-hash pairs up into a single hash. Entries are sorted so the result doesn't
 * depend on iteration order.
 *
 * Every roll-up depends on both content and path, because a file's path can impact the output of
 * where the story is served from Storybook.
 *
 * Example: src/Button.stories.tsx -> src/Components/Button.stories.tsx
 *
 * Moving that file to the new path can change where it lives in the Storybook (and the ID that's
 * used to navigate to it). To play it safe, we recapture to force a reupload of the hosted
 * Storybook.
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
 * order.
 *
 * @param entries The key/value pairs to encode.
 *
 * @returns The encoded entries, concatenated.
 */
export function hashEntryIdentities(entries: Iterable<[FilePath, FileHash]>): string {
  return [...entries]
    .map((entry) => hashEntryIdentity(entry))
    .sort()
    .join('');
}

/**
 * Encodes a key and value as a single string. JSON is a self-delimiting encoding: the quotes and
 * brackets bound each side and every path/hash character, so no pair of entries can concatenate into
 * the same string as a different pair. That keeps the roll-up free of hash collisions, and a change
 * to either side still moves the result.
 *
 * @param entry The key/value pair to encode.
 * @param entry."0" The file path, which comes first in the encoding.
 * @param entry."1" The content hash, which comes second in the encoding.
 *
 * @returns The encoded entry.
 */
export function hashEntryIdentity([path, hash]: [FilePath, FileHash]): string {
  return JSON.stringify([path, hash]);
}
