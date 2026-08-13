import TestLogger from '@cli/testLogger';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import getStorybookInfo from './getStorybookInfo';
import { getStorybookMetadata } from './getStorybookMetadata';

vi.mock('./getStorybookMetadata', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./getStorybookMetadata')>();
  return { ...actual, getStorybookMetadata: vi.fn(actual.getStorybookMetadata) };
});

vi.useFakeTimers();

const log = new TestLogger();
const baseDeps = { env: {}, log, options: {}, packageJson: {} } as any;
const getContext = (overrides: any) => ({ ...baseDeps, ...overrides });

const REACT = { '@storybook/react': '1.2.3' };
const VUE = { '@storybook/vue': '1.2.3' };

const FIXTURES = 'node-src/__mocks__/storybookMainConfig';

// The CLI runs at the repo root in these tests, so the fixture paths below are already relative to
// the project root.
const PROJECT_ROOT = process.cwd();

afterEach(() => {
  log.info.mockReset();
  log.warn.mockReset();
  log.error.mockReset();
  log.debug.mockReset();
});

describe('getStorybookInfo', () => {
  afterEach(() => {
    // This would clear all existing timer functions
    vi.clearAllTimers();
  });

  it('returns version', async () => {
    const ctx = getContext({ packageJson: { dependencies: REACT } });
    const sbInfo = await getStorybookInfo(ctx, PROJECT_ROOT);
    expect(sbInfo).toEqual(
      // We're getting the result of tracing chromatic-cli's node_modules here.
      expect.objectContaining({
        version: expect.any(String),
        builder: { name: '@storybook/html-vite', packageVersion: expect.any(String) },
      })
    );
  });

  it('warns on duplicate devDependency', async () => {
    const ctx = getContext({ packageJson: { dependencies: REACT, devDependencies: REACT } });
    await getStorybookInfo(ctx, PROJECT_ROOT);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('both "dependencies" and "devDependencies"')
    );
  });

  it('warns on duplicate peerDependency', async () => {
    const ctx = getContext({
      packageJson: { dependencies: REACT, peerDependencies: REACT },
    });
    await getStorybookInfo(ctx, PROJECT_ROOT);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('both "dependencies" and "peerDependencies"')
    );
  });

  it('returns other metadata if missing view layer package', async () => {
    const ctx = getContext({ packageJson: { dependencies: VUE } });
    await expect(getStorybookInfo(ctx, PROJECT_ROOT)).resolves.toEqual(
      expect.objectContaining({
        builder: { name: '@storybook/html-vite', packageVersion: expect.any(String) },
      })
    );
  });

  it('returns the resolved path defaults when metadata discovery fails', async () => {
    vi.mocked(getStorybookMetadata).mockRejectedValueOnce(new Error('metadata unavailable'));
    const projectRoot = '/repo/packages/storybook';

    await expect(getStorybookInfo(baseDeps, projectRoot)).resolves.toEqual({
      projectRoot,
      configDir: '/repo/packages/storybook/.storybook',
      staticDirs: [],
    });
  });

  it('looks up package in node_modules on missing dependency', async () => {
    await expect(getStorybookInfo(baseDeps, PROJECT_ROOT)).resolves.toEqual(
      // We're getting the result of tracing chromatic-cli's node_modules here.
      expect.objectContaining({
        version: expect.any(String),
        builder: { name: '@storybook/html-vite', packageVersion: expect.any(String) },
      })
    );
    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining('No viewlayer package listed in dependencies')
    );
  });

  describe('with CHROMATIC_STORYBOOK_VERSION', () => {
    it('returns version from env', async () => {
      const ctx = getContext({
        env: { CHROMATIC_STORYBOOK_VERSION: '@storybook/react@3.2.1' },
      });
      expect(await getStorybookInfo(ctx, PROJECT_ROOT)).toEqual(
        expect.objectContaining({
          version: '3.2.1',
          builder: { name: '@storybook/html-vite', packageVersion: expect.any(String) },
        })
      );
    });

    it('supports unscoped package name', async () => {
      const ctx = getContext({ env: { CHROMATIC_STORYBOOK_VERSION: 'react@3.2.1' } });
      expect(await getStorybookInfo(ctx, PROJECT_ROOT)).toEqual(
        expect.objectContaining({
          version: '3.2.1',
          builder: { name: '@storybook/html-vite', packageVersion: expect.any(String) },
        })
      );
    });

    it('still returns builder for invalid version value', async () => {
      const ctx = getContext({ env: { CHROMATIC_STORYBOOK_VERSION: '3.2.1' } });
      expect(await getStorybookInfo(ctx, PROJECT_ROOT)).toEqual(
        expect.objectContaining({
          builder: { name: '@storybook/html-vite', packageVersion: expect.any(String) },
        })
      );
    });

    it('does not include unsupported view layers', async () => {
      const ctx = getContext({ env: { CHROMATIC_STORYBOOK_VERSION: '@storybook/native@3.2.1' } });
      expect(await getStorybookInfo(ctx, PROJECT_ROOT)).toEqual(
        expect.objectContaining({
          builder: { name: '@storybook/html-vite', packageVersion: expect.any(String) },
        })
      );
    });
  });

  describe('with --storybook-build-dir', () => {
    it('combines prebuilt metadata with static directories derived from source', async () => {
      const ctx = getContext({
        options: {
          storybookBuildDir: `${FIXTURES}/js-cjs/storybook-static`,
          storybookConfigDir: `${FIXTURES}/js-cjs/.storybook`,
        },
        packageJson: { dependencies: REACT },
      });
      expect(await getStorybookInfo(ctx, PROJECT_ROOT)).toEqual({
        builder: { name: '@storybook/builder-webpack5', packageVersion: expect.any(String) },
        configDir: path.resolve(FIXTURES, 'js-cjs/.storybook'),
        projectRoot: PROJECT_ROOT,
        staticDirs: [
          path.resolve(FIXTURES, 'js-cjs/.storybook/static'),
          path.resolve(FIXTURES, 'js-cjs/public'),
        ],
        version: expect.any(String),
      });
    });

    it('still returns prebuilt metadata when the source config cannot be read', async () => {
      vi.mocked(getStorybookMetadata).mockRejectedValueOnce(new Error('no source config'));
      const ctx = getContext({
        options: {
          storybookBuildDir: `${FIXTURES}/js-cjs/storybook-static`,
          storybookConfigDir: `${FIXTURES}/js-cjs/.storybook`,
        },
        packageJson: { dependencies: REACT },
      });
      expect(await getStorybookInfo(ctx, PROJECT_ROOT)).toEqual({
        builder: { name: '@storybook/builder-webpack5', packageVersion: expect.any(String) },
        configDir: path.resolve(PROJECT_ROOT, '.storybook'),
        projectRoot: PROJECT_ROOT,
        staticDirs: [],
        version: expect.any(String),
      });
    });

    it('returns no metadata if cannot find project.json', async () => {
      const ctx = getContext({
        options: { storybookBuildDir: 'bin-src/__mocks__/malformedProjectJson' },
        packageJson: { dependencies: REACT },
      });
      expect(await getStorybookInfo(ctx, PROJECT_ROOT)).toEqual({
        configDir: path.resolve(PROJECT_ROOT, '.storybook'),
        projectRoot: PROJECT_ROOT,
        staticDirs: [],
      });
    });

    it('returns the correct metadata for Storybook 6', async () => {
      const ctx = getContext({
        options: {
          storybookBuildDir: `${FIXTURES}/cjs/storybook-static`,
          storybookConfigDir: `${FIXTURES}/cjs/.storybook`,
        },
        packageJson: { dependencies: REACT },
      });
      expect(await getStorybookInfo(ctx, PROJECT_ROOT)).toEqual({
        builder: { name: 'webpack4', packageVersion: '6.5.16' },
        configDir: path.resolve(FIXTURES, 'cjs/.storybook'),
        projectRoot: PROJECT_ROOT,
        staticDirs: [
          path.resolve(FIXTURES, 'cjs/.storybook/static'),
          path.resolve(FIXTURES, 'cjs/public'),
        ],
        version: '6.5.16',
      });
    });
  });
});
