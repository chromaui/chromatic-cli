import { describe, expect, it } from 'vitest';

import { inMemoryProjectFiles } from './projectFiles.fake';
import { resolveStorybookVersion } from './storybookVersion';

const projectRoot = '/repo/packages/ui';

describe('resolveStorybookVersion', () => {
  it('reads the version from the `storybook` package when both are available', () => {
    const disk = { packageVersions: { storybook: '9.1.20', '@storybook/core': '8.6.18' } };

    expect(resolveStorybookVersion(projectRoot, inMemoryProjectFiles(disk))).toBe('9.1.20');
  });

  it('falls back to `@storybook/core` when the `storybook` meta-package cannot be resolved', () => {
    const disk = { packageVersions: { '@storybook/core': '8.6.18' } };

    expect(resolveStorybookVersion(projectRoot, inMemoryProjectFiles(disk))).toBe('8.6.18');
  });

  it('throws when no Storybook package can be resolved because the Storybook version is required', () => {
    let err: Error | undefined;
    try {
      resolveStorybookVersion(projectRoot, inMemoryProjectFiles({}));
    } catch (error) {
      err = error as Error;
    }

    expect(err?.message).toContain('Could not resolve a Storybook version');
    expect(err?.message).toContain(projectRoot);
  });
});
