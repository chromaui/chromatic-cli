import type { Context } from '../../types';

/** Discovered Storybook metadata. Mirrors `Context['storybook']` (all fields optional). */
export type DetectedStorybookInfo = Partial<Context['storybook']>;

/**
 * Boundary over the Storybook auto-detection logic — package.json walking,
 * `project.json` parsing for prebuilt storybooks, and `mainConfig` evaluation.
 * Production callers use the adapter that wraps `lib/getStorybookInfo`; tests
 * use the in-memory fake to hand back a canned `StorybookInfo`.
 *
 * The current implementation is intentionally context-shaped: detection reads
 * `ctx.packageJson`, `ctx.options`, `ctx.git.rootDir`, `ctx.ports.fs`, and
 * `ctx.log`. Wrapping the existing function unblocks test ergonomics without
 * forcing a full rewrite of the detection internals.
 */
export interface StorybookDetector {
  /** Inspect the project rooted at `ctx.sourceDir`/`ctx.git.rootDir` and return whatever Storybook info can be inferred. */
  detect(ctx: Context): Promise<DetectedStorybookInfo>;
}
