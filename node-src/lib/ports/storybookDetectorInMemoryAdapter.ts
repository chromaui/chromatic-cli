import type { Context } from '../../types';
import { DetectedStorybookInfo, StorybookDetector } from './storybookDetector';

/** Pre-canned response for the in-memory {@link StorybookDetector}. */
export interface InMemoryStorybookDetectorState {
  /** Default response when no per-source-dir entry matches. */
  default?: DetectedStorybookInfo;
  /** Source-dir-specific responses. */
  bySourceDir?: Map<string, DetectedStorybookInfo>;
  /** When set, the next call rejects with this error. Cleared after reading. */
  error?: Error;
  /** Records the contexts each call was made with for assertions. */
  calls?: Context[];
}

/**
 * Construct an in-memory {@link StorybookDetector} backed by canned responses.
 *
 * @param state The mutable fixture driving the adapter's responses.
 *
 * @returns A StorybookDetector that records calls and reads canned responses.
 */
export function createInMemoryStorybookDetector(
  state: InMemoryStorybookDetectorState
): StorybookDetector {
  return {
    async detect(ctx: Context) {
      state.calls = [...(state.calls ?? []), ctx];
      if (state.error) {
        const err = state.error;
        state.error = undefined;
        throw err;
      }
      const sourceDirectory = ctx.sourceDir;
      if (sourceDirectory && state.bySourceDir?.has(sourceDirectory)) {
        return state.bySourceDir.get(sourceDirectory) as DetectedStorybookInfo;
      }
      return state.default ?? {};
    },
  };
}
