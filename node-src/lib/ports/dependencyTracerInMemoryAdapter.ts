import semver from 'semver';

import { Context, TurboSnap } from '../../types';
import { AffectedModules, DependencyTracer } from './dependencyTracer';

/** Pre-canned response shape for an in-memory {@link DependencyTracer}. */
export interface InMemoryDependencyTraceResponse {
  /** Affected-modules map returned to the caller. Omit to signal a bail. */
  onlyStoryFiles?: AffectedModules;
  /** When set, replaces `ctx.turboSnap.bailReason`. */
  bailReason?: TurboSnap['bailReason'];
  /** When set, the trace rejects with this error instead of resolving. */
  error?: Error;
  /** Files appended to `ctx.untracedFiles` when the trace runs. */
  untracedFiles?: string[];
  /** Names appended to `ctx.git.changedDependencyNames` when the trace runs. */
  changedDependencyNames?: string[];
}

/** Fixture state backing the in-memory {@link DependencyTracer} adapter. */
export interface InMemoryDependencyTracerState {
  /** Default response when no per-statsPath entry matches. */
  default?: InMemoryDependencyTraceResponse;
  /** Stats-path-specific responses. */
  byStatsPath?: Map<string, InMemoryDependencyTraceResponse>;
  /** Records each call's `ctx` for assertions. */
  calls?: Context[];
}

function selectResponse(
  state: InMemoryDependencyTracerState,
  ctx: Context
): InMemoryDependencyTraceResponse | undefined {
  const statsPath = ctx.fileInfo?.statsPath;
  if (statsPath && state.byStatsPath?.has(statsPath)) {
    return state.byStatsPath.get(statsPath);
  }
  return state.default;
}

function applyMutations(
  ctx: Context,
  response: InMemoryDependencyTraceResponse
): AffectedModules | undefined {
  if (response.untracedFiles) {
    ctx.untracedFiles = [...(ctx.untracedFiles ?? []), ...response.untracedFiles];
  }
  if (response.changedDependencyNames) {
    ctx.git.changedDependencyNames = [
      ...(ctx.git.changedDependencyNames ?? []),
      ...response.changedDependencyNames,
    ];
  }
  if (response.bailReason) {
    if (!ctx.turboSnap) ctx.turboSnap = {};
    ctx.turboSnap.bailReason = response.bailReason;
    return undefined;
  }
  return response.onlyStoryFiles;
}

function bailMissingStats(ctx: Context): never {
  const nonLegacy =
    ctx.storybook?.version && semver.gte(semver.coerce(ctx.storybook.version) || '0.0.0', '8.0.0');
  if (!ctx.turboSnap) ctx.turboSnap = {};
  ctx.turboSnap.bailReason = { missingStatsFile: true };
  throw new Error(
    nonLegacy
      ? 'Missing preview-stats.json (pass --stats-json)'
      : 'Missing preview-stats.json (pass --webpack-stats-json)'
  );
}

/**
 * Construct an in-memory {@link DependencyTracer} backed by canned responses.
 * Replicates the missing-stats early-return so contract tests can verify the
 * bail behavior without invoking the real turbosnap module.
 *
 * @param state The mutable fixture driving the adapter's responses.
 *
 * @returns A DependencyTracer that records calls and reads canned responses.
 */
export function createInMemoryDependencyTracer(
  state: InMemoryDependencyTracerState
): DependencyTracer {
  return {
    async traceChangedFiles(ctx: Context) {
      state.calls = [...(state.calls ?? []), ctx];
      if (!ctx.turboSnap || ctx.turboSnap.unavailable) return undefined;
      if (!ctx.git.changedFiles) return undefined;
      if (!ctx.fileInfo?.statsPath) bailMissingStats(ctx);
      const response = selectResponse(state, ctx);
      if (!response) return undefined;
      if (response.error) throw response.error;
      return applyMutations(ctx, response);
    },
  };
}
