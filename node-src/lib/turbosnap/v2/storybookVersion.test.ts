import { describe, expect, it } from 'vitest';

import { InMemoryDisk, inMemoryProjectFiles } from './projectFiles.fake';
import { resolveStorybookVersion } from './storybookVersion';

const configDirectory = '/repo/packages/ui/.storybook';
const projectRoot = '/repo';

function input(disk: InMemoryDisk = {}) {
  return { configDir: configDirectory, projectFiles: inMemoryProjectFiles(disk) };
}

describe('resolveStorybookVersion', () => {
  it('reads the version from the `storybook` package when both are available', () => {
    const disk = { packageVersions: { storybook: '9.1.20', '@storybook/core': '8.6.18' } };

    expect(resolveStorybookVersion(input(disk))).toBe('9.1.20');
  });

  it('falls back to `@storybook/core` when the `storybook` meta-package cannot be resolved', () => {
    const disk = { packageVersions: { '@storybook/core': '8.6.18' } };

    expect(resolveStorybookVersion(input(disk))).toBe('8.6.18');
  });

  it('resolves from the config directory, not the project root', () => {
    // A workspace where `storybook` is installed only under the package that owns `.storybook`, and
    // the project root resolves a different one. Only the config directory's install is Storybook's.
    const disk = {
      packageVersionsByDirectory: {
        [configDirectory]: { storybook: '10.2.16' },
        [projectRoot]: { storybook: '9.1.20' },
      },
    };

    expect(resolveStorybookVersion(input(disk))).toBe('10.2.16');
  });

  it('throws when no Storybook version is known because the Storybook version is required', () => {
    let err: Error | undefined;
    try {
      resolveStorybookVersion(input());
    } catch (error) {
      err = error as Error;
    }

    expect(err?.message).toContain('Could not resolve a Storybook version');
    expect(err?.message).toContain(configDirectory);
    expect(err?.message).toContain('must be installed before running Chromatic');
  });
});
