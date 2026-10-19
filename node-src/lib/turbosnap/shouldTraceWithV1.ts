import { Context } from '../../types';

/**
 * Whether TurboSnap v1 tracing is enabled: the user asked for `--only-changed` and TurboSnap is
 * available for this project.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns True when TurboSnap v1 tracing is enabled.
 */
export function isTurboSnapV1Enabled(ctx: Pick<Context, 'turboSnap'>) {
  return !!ctx.turboSnap && !ctx.turboSnap.unavailable;
}

/**
 * Whether TurboSnap v1 is enabled and a changed-file list is available for tracing.
 * An empty list permits tracing; an undefined list skips it, as on rebuilds and first builds.
 * Hash collection may still run when this returns false.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns True when v1 is enabled and the changed-file list is defined, even if it is empty.
 */
export function shouldTraceWithV1(ctx: Pick<Context, 'turboSnap' | 'git'>) {
  return isTurboSnapV1Enabled(ctx) && !!ctx.git.changedFiles;
}
