import { Context } from '../../types';

/**
 * Whether the user opted out of always-on TurboSnap v2 hash collection, either through the env off
 * switch or by explicitly setting `onlyChanged: false`. An unset `onlyChanged` still collects hashes.
 * Users who explicitly turn TurboSnap off usually did so because tracing was too expensive for
 * their project, so the always-on path must respect that.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns True when hash collection should not run.
 */
export function isHashCollectionDisabled(ctx: Pick<Context, 'env' | 'options'>) {
  return ctx.env.CHROMATIC_TURBOSNAP_DISABLE_HASHES || ctx.options.onlyChanged === false;
}
