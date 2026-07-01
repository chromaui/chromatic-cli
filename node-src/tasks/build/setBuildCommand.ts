import semver from 'semver';

import { getE2EBuildCommand } from '../../lib/e2e';
import { isE2EBuild } from '../../lib/e2eUtils';
import { getPackageManagerRunCommand } from '../../lib/getPackageManager';
import { Context, Deps } from '../../types';
import { resolveE2EFramework } from './resolveE2EFramework';

type SetBuildCommandDeps = Pick<Deps, 'options' | 'log'>;

interface SetBuildCommandInput {
  sourceDir: string;
  flags: Context['flags'];
  storybook?: Context['storybook'];
  changedFiles?: string[];
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

export const setBuildCommand = async (
  deps: SetBuildCommandDeps,
  input: SetBuildCommandInput
): Promise<string | undefined> => {
  const buildCommand = input.flags?.buildCommand || deps.options.buildCommand;
  const buildCommandOptions: string[] = [];

  if (!buildCommand) {
    buildCommandOptions.push(`--output-dir=${input.sourceDir}`);
  }

  if (input.changedFiles) {
    if (isStatsFlagSupported(input.storybook)) {
      buildCommandOptions.push(`${getStatsFlag(input.storybook)}=${input.sourceDir}`);
    } else {
      deps.log.warn('Storybook version 6.2.0 or later is required to use the --only-changed flag');
    }
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
