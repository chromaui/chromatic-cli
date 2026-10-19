import { Context } from '../../types';

/**
 * Whether TurboSnap v1 tracing is enabled: the user asked for `--only-changed` and the detected
 * Storybook version supports it.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns True when TurboSnap v1 tracing is enabled.
 */
export function isTurboSnapV1Enabled(ctx: Pick<Context, 'turboSnap'>) {
  return !!ctx.turboSnap && !ctx.turboSnap.unavailable;
}

/**
 * Whether TurboSnap v1 will actually trace the changed files. A rebuild rerun disables TurboSnap
 * before computing the changed-file list and a first build has no ancestor build, so neither
 * traces even though the lib still collects hashes in both cases.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns True when the changed files will be traced.
 */
export function shouldTraceWithV1(ctx: Pick<Context, 'turboSnap' | 'git'>) {
  return isTurboSnapV1Enabled(ctx) && !!ctx.git.changedFiles;
}
