import { getDuration } from '../../lib/tasks';
import { Context } from '../../types';
import { buildType, capitalize } from './utilities';

export const initial = (ctx: Context) => ({
  status: 'initial',
  title: `Build ${buildType(ctx)}`,
});

export const pending = (ctx: Context) => ({
  status: 'pending',
  title: `Building your ${buildType(ctx)}`,
  // buildCommand isn't known until the task body computes it; the task reports it mid-run.
  output: ctx.buildCommand ? `Running command: ${ctx.buildCommand}` : undefined,
});

export const success = (ctx: Context) => ({
  status: 'success',
  title: `${capitalize(buildType(ctx))} built in ${getDuration(ctx)}`,
  output: `View build log at ${ctx.buildLogFile}`,
});

export const skipped = (ctx: Context) => ({
  status: 'skipped',
  title: `Build ${buildType(ctx)} [skipped]`,
  output: `Using prebuilt ${buildType(ctx)} at ${ctx.options.storybookBuildDir}`,
});
