import { Context } from '../../types';

export function resolveE2EFramework(ctx: Context) {
  if (ctx.options.playwright) {
    return 'playwright';
  }

  if (ctx.options.vitest) {
    return 'vitest';
  }

  return 'cypress';
}
