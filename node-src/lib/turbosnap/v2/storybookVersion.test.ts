import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryDiskReference, inMemoryProjectFiles } from './projectFiles';
import { resolveStorybookVersion } from './storybookVersion';

// What is installed, as a value. How a package's version is found on disk — that the manifest is
// resolved rather than a path inside the package, and that resolution walks up to a hoisted install
// — is the adapter's rule, pinned against a real package layout in projectFiles.test.ts. This suite
// decides only which package is asked about and what happens when none answers.
const disk: InMemoryDiskReference = { current: {} };
const projectFiles = inMemoryProjectFiles(disk);

const projectRoot = '/repo/packages/ui';

beforeEach(() => {
  disk.current = {};
});

describe('resolveStorybookVersion', () => {
  it('reads the version from the `storybook` package on Storybook 9 and later', () => {
    disk.current = { packageVersions: { storybook: '9.1.20', '@storybook/core': '8.6.18' } };

    expect(resolveStorybookVersion(projectRoot, projectFiles)).toBe('9.1.20');
  });

  it('falls back to `@storybook/core` on Storybook 8, where `storybook` is the CLI', () => {
    disk.current = { packageVersions: { '@storybook/core': '8.6.18' } };

    expect(resolveStorybookVersion(projectRoot, projectFiles)).toBe('8.6.18');
  });

  it('throws when no Storybook package can be resolved, so the caller falls back to v1', () => {
    let err: Error | undefined;
    try {
      resolveStorybookVersion(projectRoot, projectFiles);
    } catch (error) {
      err = error as Error;
    }

    expect(err?.message).toContain('Could not resolve a Storybook version');
    expect(err?.message).toContain(projectRoot);
  });
});
