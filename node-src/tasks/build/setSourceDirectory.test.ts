import { describe, expect, it } from 'vitest';

import { setSourceDirectory } from './setSourceDirectory';

describe('setSourceDirectory', () => {
  it('returns a random temp directory path', async () => {
    const result = await setSourceDirectory(
      { options: {} } as any,
      { storybook: { version: '5.0.0' } as any }
    );
    expect(result).toMatch(/chromatic-/);
  });

  it('falls back to the default output dir for older Storybooks', async () => {
    const result = await setSourceDirectory(
      { options: {} } as any,
      { storybook: { version: '4.0.0' } as any }
    );
    expect(result).toBe('storybook-static');
  });

  it('uses the outputDir option if provided', async () => {
    const result = await setSourceDirectory(
      { options: { outputDir: 'storybook-out' } } as any,
      { storybook: { version: '5.0.0' } as any }
    );
    expect(result).toBe('storybook-out');
  });

  it('uses the outputDir option if provided, even for older Storybooks', async () => {
    const result = await setSourceDirectory(
      { options: { outputDir: 'storybook-out' } } as any,
      { storybook: { version: '4.0.0' } as any }
    );
    expect(result).toBe('storybook-out');
  });

  it('keeps a preset sourceDir (React Native skip path)', async () => {
    const result = await setSourceDirectory(
      { options: { outputDir: 'ignored' } } as any,
      { sourceDir: 'preset-dir', storybook: { version: '5.0.0' } as any }
    );
    expect(result).toBe('preset-dir');
  });
});
