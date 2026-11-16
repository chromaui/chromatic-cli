import { describe, expect, it } from 'vitest';

import { InMemoryDisk, inMemoryProjectFiles } from './projectFiles.fake';
import { resolveStorybookVersion } from './storybookVersion';

const configDirectory = '/repo/packages/ui/.storybook';
const projectRoot = '/repo';

function input(disk: InMemoryDisk = {}) {
  return { configDir: configDirectory, projectRoot, projectFiles: inMemoryProjectFiles(disk) };
}

describe('resolveStorybookVersion', () => {
  it('reads the version from `storybook` before any Storybook 8.1-and-earlier package', () => {
    const disk = { packageVersions: { storybook: '7.6.20', '@storybook/preview-api': '7.6.19' } };

    expect(resolveStorybookVersion(input(disk))).toBe('7.6.20');
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

  it('falls back to a package installed with Storybook 8.1 and earlier, where `storybook` was optional', () => {
    // A Storybook 7 framework that doesn't depend on `storybook`, installed with a hoisting linker.
    const disk = {
      packageVersions: { '@storybook/core-common': '7.6.20', '@storybook/vue': '7.6.20' },
    };

    expect(resolveStorybookVersion(input(disk))).toBe('7.6.20');
  });

  it('falls back to a renderer when that is all a strict install exposes, as for Storybook 6', () => {
    const disk = { packageVersions: { '@storybook/react': '6.5.16' } };

    expect(resolveStorybookVersion(input(disk))).toBe('6.5.16');
  });

  it('trusts a fallback package from the last version before `storybook` was required', () => {
    const disk = { packageVersions: { '@storybook/core-common': '8.1.11' } };

    expect(resolveStorybookVersion(input(disk))).toBe('8.1.11');
  });

  it('ignores a fallback package from 8.2 on, so a stale copy cannot misreport', () => {
    const disk = { packageVersions: { '@storybook/core-common': '8.2.0' } };

    expect(() => resolveStorybookVersion(input(disk))).toThrow(
      'Could not resolve a Storybook version'
    );
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
