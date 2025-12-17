import { isE2EBuild } from '../../lib/e2eUtils';
import { Context } from '../../types';

export const buildType = (ctx: Context) => {
  if (isE2EBuild(ctx.options)) return 'test suite';
  if (ctx.isReactNativeApp) return 'React Native Storybook';
  return 'Storybook';
};
export const capitalize = (string: string) => string.charAt(0).toUpperCase() + string.slice(1);
