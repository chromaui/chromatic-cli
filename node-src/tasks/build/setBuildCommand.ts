import semver from 'semver';

import { getE2EBuildCommand } from '../../lib/e2e';
import { isE2EBuild } from '../../lib/e2eUtils';
import { getPackageManagerRunCommand } from '../../lib/getPackageManager';
import { Context } from '../../types';
import { resolveE2EFramework } from './resolveE2EFramework';

const isStatsFlagSupported = (ctx: Context) => {
  return ctx.storybook && ctx.storybook.version
    ? semver.gte(semver.coerce(ctx.storybook.version) || '0.0.0', '6.2.0')
    : true;
};

// Storybook 8.0.0 deprecated --webpack-stats-json in favor of --stats-json.
// However, the angular builder did not support it until 8.5.0
const getStatsFlag = (ctx: Context) => {
  return ctx?.storybook?.version &&
    semver.gte(semver.coerce(ctx.storybook.version) || '0.0.0', '8.5.0')
    ? '--stats-json'
    : '--webpack-stats-json';
};

export const setBuildCommand = async (ctx: Context) => {
  const buildCommand = ctx.flags?.buildCommand || ctx.options.buildCommand;
  const buildCommandOptions: string[] = [];

  if (!buildCommand) {
    buildCommandOptions.push(`--output-dir=${ctx.sourceDir}`);
  }

  if (ctx.git.changedFiles) {
    if (isStatsFlagSupported(ctx)) {
      buildCommandOptions.push(`${getStatsFlag(ctx)}=${ctx.sourceDir}`);
    } else {
      ctx.log.warn('Storybook version 6.2.0 or later is required to use the --only-changed flag');
    }
  }

  if (buildCommand) {
    ctx.buildCommand = `${buildCommand} ${buildCommandOptions.join(' ')}`;
    return;
  }

  if (isE2EBuild(ctx.options)) {
    ctx.buildCommand = await getE2EBuildCommand(ctx, resolveE2EFramework(ctx), buildCommandOptions);
    return;
  }

  if (!ctx.options.buildScriptName) {
    throw new Error('Unable to determine build script');
  }

  ctx.buildCommand = await getPackageManagerRunCommand([
    ctx.options.buildScriptName,
    ...buildCommandOptions,
  ]);
};
