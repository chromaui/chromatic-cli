import { Context } from '../../types';

/** Map of module ID → list of CSF story file paths that trace back to changed files. */
export type AffectedModules = Record<string, string[]>;

/**
 * Boundary over TurboSnap's dependency-graph logic. Production callers use the
 * adapter that wraps `lib/turbosnap`; tests use the in-memory fake to skip the
 * Snyk plugin and stats-file walk entirely.
 *
 * The current implementation is intentionally context-shaped: turbosnap reads
 * many slices of `Context` and writes back `turboSnap.bailReason`,
 * `git.changedDependencyNames`, and `untracedFiles`. Wrapping the existing
 * function unblocks the test ergonomics win without forcing a full rewrite of
 * the turbosnap internals.
 */
export interface DependencyTracer {
  /**
   * Trace which story files are affected by changed source files and changed
   * dependencies. Resolves with an `AffectedModules` map, or `undefined` when
   * the trace bails (in which case `ctx.turboSnap.bailReason` is populated).
   */
  traceChangedFiles(ctx: Context): Promise<AffectedModules | undefined>;
}
