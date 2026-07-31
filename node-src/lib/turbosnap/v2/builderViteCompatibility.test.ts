import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Stats } from '../../../types';
import { getUntrustedBuilderStatsReason } from './builderViteCompatibility';

vi.mock('module', () => ({
  createRequire: vi.fn(),
}));

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

const mockCreateRequire = vi.mocked(
  createRequire as (filename: string) => { resolve: (request: string) => string }
);
const mockReadFileSync = vi.mocked(readFileSync as (path: string) => string);
const mockResolve = vi.fn();

const projectRoot = '/repo/packages/ui';

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
  mockCreateRequire.mockReturnValue({ resolve: mockResolve });
  mockResolve.mockReturnValue('/repo/node_modules/@storybook/builder-vite/package.json');
  mockReadFileSync.mockReturnValue(JSON.stringify({ version: '10.6.0-alpha.3' }));
});

describe('getUntrustedBuilderStatsReason', () => {
  it('does not bail for non-Vite stats', () => {
    expect(getUntrustedBuilderStatsReason(webpackStats(), projectRoot)).toBeUndefined();
  });

  it('classifies a known-invalid builder-vite version', () => {
    expect(getUntrustedBuilderStatsReason(viteStats(), projectRoot)).toEqual({
      reason: 'untrustedBuilderStats',
      subreason: 'unsupportedVersion',
      builderName: '@storybook/builder-vite',
      builderVersion: '10.6.0-alpha.3',
    });
  });

  it('classifies a non-semver builder-vite version', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: 'workspace:next' }));

    expect(getUntrustedBuilderStatsReason(viteStats(), projectRoot)).toEqual({
      reason: 'untrustedBuilderStats',
      subreason: 'invalidVersion',
      builderName: '@storybook/builder-vite',
      builderVersion: 'workspace:next',
    });
  });

  it('resolves builder-vite from the Storybook project root', () => {
    getUntrustedBuilderStatsReason(viteStats(), projectRoot);

    expect(mockCreateRequire).toHaveBeenCalledWith('/repo/packages/ui/package.json');
    expect(mockResolve).toHaveBeenCalledWith('@storybook/builder-vite/package.json');
  });

  it('does not bail once the stats are from a known-fixed builder-vite', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '10.6.0-alpha.4' }));

    expect(getUntrustedBuilderStatsReason(viteStats(), projectRoot)).toBeUndefined();
  });

  it('does not bail when the builder stats are explicitly trusted', () => {
    vi.stubEnv('CHROMATIC_TURBOSNAP_TRUST_BUILDER_STATS', '1');

    expect(getUntrustedBuilderStatsReason(viteStats(), projectRoot)).toBeUndefined();

    vi.unstubAllEnvs();
  });

  it('bails when Vite stats are detected but builder-vite cannot be resolved', () => {
    mockResolve.mockImplementation(() => {
      throw new Error('Cannot find module');
    });

    expect(getUntrustedBuilderStatsReason(viteStats(), projectRoot)).toEqual({
      reason: 'untrustedBuilderStats',
      subreason: 'packageNotFound',
      builderName: '@storybook/builder-vite',
    });
  });
});
