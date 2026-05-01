import { Context } from '../../types';
import { buildType } from './utilities';

export const initial = (ctx: Context) => ({
  status: 'initial',
  title: `Collect ${buildType(ctx)} metadata`,
});

export const pending = (ctx: Context) => ({
  status: 'pending',
  title: `Collecting ${buildType(ctx)} metadata`,
});

export const success = (ctx: Context) => ({
  status: 'success',
  title: `Collected ${buildType(ctx)} metadata`,
  output: 'Build metadata gathered',
});
