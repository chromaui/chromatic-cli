import semver from 'semver';

import { getE2EBuildCommand } from '../../lib/e2e';
import { isE2EBuild } from '../../lib/e2eUtils';
import { getPackageManagerRunCommand } from '../../lib/getPackageManager';
import { isHashCollectionDisabled } from '../../lib/turbosnap/isHashCollectionDisabled';
import { isTurboSnapV1Enabled } from '../../lib/turbosnap/shouldTraceWithV1';
import { Context, Deps } from '../../types';
import { resolveE2EFramework } from './resolveE2EFramework';

type SetBuildCommandDeps = Pick<Deps, 'options' | 'log' | 'env'>;

interface SetBuildCommandInput {
  sourceDir: string;
  flags: Context['flags'];
  storybook?: Context['storybook'];
  turboSnap?: Context['turboSnap'];
}

const isStatsFlagSupported = (storybook?: Context['storybook']) => {
  return storybook?.version
    ? semver.gte(semver.coerce(storybook.version) || '0.0.0', '6.2.0')
    : true;
};

// Storybook 8.0.0 deprecated --webpack-stats-json in favor of --stats-json.
// However, the angular builder did not support it until 8.5.0
const getStatsFlag = (storybook?: Context['storybook']) => {
  return storybook?.version && semver.gte(semver.coerce(storybook.version) || '0.0.0', '8.5.0')
    ? '--stats-json'
    : '--webpack-stats-json';
};

/**
 * Decide whether the build command gets the stats flag. Each condition after the TurboSnap check
 * blocks the always-on path only: a user who asked for TurboSnap keeps the flag in every case,
 * because without the stats file `turbosnap/index.ts` throws `missingStatsFile`.
 *
 * @param deps Narrow set of dependencies used to inspect options and environment.
 * @param input The build input carrying the Storybook version and TurboSnap settings.
 * @param buildCommand A user-provided build command, when one exists.
 *
 * @returns Whether the stats-file flag should be appended to the build command.
 */
function shouldAddStatsFlag(
  deps: SetBuildCommandDeps,
  input: SetBuildCommandInput,
  buildCommand?: string
) {
  if (!isStatsFlagSupported(input.storybook)) {
    return false;
  }

  if (isTurboSnapV1Enabled(input)) {
    return true;
  }

  if (isHashCollectionDisabled(deps)) {
    return false;
  }

  if (isE2EBuild(deps.options)) {
    return false;
  }

  if (buildCommand) {
    return false;
  }

  return true;
}

/**
 * Resolves a custom, E2E, or package script build command with applicable output and stats flags.
 * Custom commands receive no `--output-dir` flag.
 *
 * @param deps Options and environment used to select the command and stats flags, plus the logger.
 * @param input Build settings; a nonempty `flags.buildCommand` overrides `options.buildCommand`.
 * @param input.sourceDir The directory used for output and stats flags.
 *
 * @returns The resolved build command, or undefined if package-manager resolution yields no command.
 *
 * @throws {Error} If no custom or E2E command applies and no build script is configured, or command
 * resolution fails. Outside the GitHub Action, a missing E2E package propagates a `TaskFailure`.
 */
export const setBuildCommand = async (
  deps: SetBuildCommandDeps,
  input: SetBuildCommandInput
): Promise<string | undefined> => {
  const buildCommand = input.flags?.buildCommand || deps.options.buildCommand;
  const buildCommandOptions: string[] = [];

  if (!buildCommand) {
    buildCommandOptions.push(`--output-dir=${input.sourceDir}`);
  }

  if (shouldAddStatsFlag(deps, input, buildCommand)) {
    buildCommandOptions.push(`${getStatsFlag(input.storybook)}=${input.sourceDir}`);
  } else if (isTurboSnapV1Enabled(input)) {
    deps.log.warn('Storybook version 6.2.0 or later is required to use the --only-changed flag');
  }

  if (buildCommand) {
    return `${buildCommand} ${buildCommandOptions.join(' ')}`;
  }

  if (isE2EBuild(deps.options)) {
    return getE2EBuildCommand(deps, resolveE2EFramework(deps.options), buildCommandOptions);
  }

  if (!deps.options.buildScriptName) {
    throw new Error('Unable to determine build script');
  }

  return getPackageManagerRunCommand([deps.options.buildScriptName, ...buildCommandOptions]);
};
