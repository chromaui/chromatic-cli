import { isE2EBuild } from '../../lib/e2eUtils';
import { Context } from '../../types';

export const buildType = (ctx: Context) => (isE2EBuild(ctx.options) ? 'test suite' : 'Storybook');
export const capitalize = (string: string) => string.charAt(0).toUpperCase() + string.slice(1);
