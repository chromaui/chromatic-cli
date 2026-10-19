// Rollup marks the ids of modules a plugin created with a leading NUL byte. Only a proxy for a
// relative path (CommonJS interop, framework SFC blocks) stands for a real file; any other NUL id
// (a bare runtime helper like `\0commonjsHelpers.js` or an opaque rooted id like
// `\0/@data-uri/...`) names nothing on disk.
const NUL = '\0';
const FOLDABLE_NUL_PREFIXES = [`${NUL}./`, `${NUL}../`];

/**
 * Whether a stats id is a NUL proxy for a relative path, which stands for that file once the NUL
 * (and any query) is removed, e.g. `\0./node_modules/react/index.js?commonjs-es-import`.
 *
 * @param statsId The raw module name from the stats file.
 *
 * @returns true when the id is a foldable NUL proxy.
 */
export function isFoldableNulId(statsId: string): boolean {
  return FOLDABLE_NUL_PREFIXES.some((prefix) => statsId.startsWith(prefix));
}

/**
 * Removes the NUL from a foldable NUL proxy id, leaving any query for the caller. Other ids,
 * including opaque NUL ids, are returned unchanged.
 *
 * @param statsId The raw module name from the stats file.
 *
 * @returns The id without its NUL when foldable, otherwise the id unchanged.
 */
export function stripFoldableNul(statsId: string): string {
  return isFoldableNulId(statsId) ? statsId.slice(NUL.length) : statsId;
}
