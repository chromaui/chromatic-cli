import { Context } from '../../types';

export function resolveE2EFramework(options: Context['options']) {
  if (options.playwright) {
    return 'playwright';
  }

  if (options.vitest) {
    return 'vitest';
  }

  return 'cypress';
}
