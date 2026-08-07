import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Stats } from '../../../types';
import { getUntrustedBuilderStatsReason } from './builderViteCompatibility';
import { InMemoryDiskReference, inMemoryProjectFiles } from './projectFiles';

// What is installed, as a value. Which packages resolve from where is the adapter's rule and is
// pinned against a real package layout in projectFiles.test.ts; this suite only decides what each
// version means.
const disk: InMemoryDiskReference = { current: {} };
const projectFiles = inMemoryProjectFiles(disk);

const projectRoot = '/repo/packages/ui';

/**
 * Installs builder-vite at the given version.
 *
 * @param version The version the package reports.
 */
function givenBuilderVite(version: string) {
  disk.current = { packageVersions: { '@storybook/builder-vite': version } };
}

function viteStats(): Stats {
  return {
    modules: [
      {
        id: 1,
        name: '/virtual:/@storybook/builder-vite/storybook-stories.js',
        reasons: [],
      },
    ],
  };
}

function webpackStats(): Stats {
  return {
    modules: [
      {
        id: 1,
        name: './storybook-stories.js',
        reasons: [],
      },
    ],
  };
}

beforeEach(() => {
  givenBuilderVite('10.6.0-alpha.3');
});

describe('getUntrustedBuilderStatsReason', () => {
  it('does not bail for non-Vite stats', () => {
    expect(
      getUntrustedBuilderStatsReason(webpackStats(), projectRoot, projectFiles)
    ).toBeUndefined();
  });

  it('classifies a known-invalid builder-vite version', () => {
    expect(getUntrustedBuilderStatsReason(viteStats(), projectRoot, projectFiles)).toEqual({
      subreason: 'unsupportedVersion',
      builderName: '@storybook/builder-vite',
      builderVersion: '10.6.0-alpha.3',
    });
  });

  it('classifies a non-semver builder-vite version', () => {
    givenBuilderVite('workspace:next');

    expect(getUntrustedBuilderStatsReason(viteStats(), projectRoot, projectFiles)).toEqual({
      subreason: 'invalidVersion',
      builderName: '@storybook/builder-vite',
      builderVersion: 'workspace:next',
    });
  });

  it('does not bail once the stats are from a known-fixed builder-vite', () => {
    givenBuilderVite('10.6.0-alpha.4');

    expect(getUntrustedBuilderStatsReason(viteStats(), projectRoot, projectFiles)).toBeUndefined();
  });

  it('does not bail when the builder stats are explicitly trusted', () => {
    vi.stubEnv('CHROMATIC_TURBOSNAP_TRUST_BUILDER_STATS', '1');

    expect(getUntrustedBuilderStatsReason(viteStats(), projectRoot, projectFiles)).toBeUndefined();

    vi.unstubAllEnvs();
  });

  it('bails when Vite stats are detected but builder-vite cannot be resolved', () => {
    disk.current = {};

    expect(getUntrustedBuilderStatsReason(viteStats(), projectRoot, projectFiles)).toEqual({
      subreason: 'packageNotFound',
      builderName: '@storybook/builder-vite',
    });
  });
});
