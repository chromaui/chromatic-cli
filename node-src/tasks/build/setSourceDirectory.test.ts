import { describe, expect, it } from 'vitest';

import { setSourceDirectory } from './setSourceDirectory';

const baseContext = { options: {}, flags: {} } as any;

describe('setSourceDir', () => {
  it('sets a random temp directory path on the context', async () => {
    const ctx = { ...baseContext, storybook: { version: '5.0.0' } } as any;
    await setSourceDirectory(ctx);
    expect(ctx.sourceDir).toMatch(/chromatic-/);
  });

  it('falls back to the default output dir for older Storybooks', async () => {
    const ctx = { ...baseContext, storybook: { version: '4.0.0' } } as any;
    await setSourceDirectory(ctx);
    expect(ctx.sourceDir).toBe('storybook-static');
  });

  it('uses the outputDir option if provided', async () => {
    const ctx = {
      ...baseContext,
      options: { outputDir: 'storybook-out' },
      storybook: { version: '5.0.0' },
    } as any;
    await setSourceDirectory(ctx);
    expect(ctx.sourceDir).toBe('storybook-out');
  });

  it('uses the outputDir option if provided, even for older Storybooks', async () => {
    const ctx = {
      ...baseContext,
      options: { outputDir: 'storybook-out' },
      storybook: { version: '4.0.0' },
    } as any;
    await setSourceDirectory(ctx);
    expect(ctx.sourceDir).toBe('storybook-out');
  });
});
