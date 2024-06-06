import { afterEach, describe, expect, it, vi } from 'vitest';

import { Context } from '../types';
import getStorybookInfo from './getStorybookInfo';

vi.useFakeTimers();

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const context: Context = { env: {}, log, options: {}, packageJson: {} } as any;
const getContext = (ctx: any): Context => ({ ...context, ...ctx });

const REACT = { '@storybook/react': '1.2.3' };
const VUE = { '@storybook/vue': '1.2.3' };

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

  it('returns viewLayer and version', async () => {
    const ctx = getContext({ packageJson: { dependencies: REACT } });
    const sbInfo = await getStorybookInfo(ctx);
    expect(sbInfo).toEqual(
      // We're getting the result of tracing chromatic-cli's node_modules here.
      expect.objectContaining({
        viewLayer: 'react',
        version: expect.any(String),
        builder: { name: '@storybook/react-webpack5', packageVersion: expect.any(String) },
      })
    );
  });

  it('warns on duplicate devDependency', async () => {
    const ctx = getContext({ packageJson: { dependencies: REACT, devDependencies: REACT } });
    await getStorybookInfo(ctx);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('both "dependencies" and "devDependencies"')
    );
  });

  it('warns on duplicate peerDependency', async () => {
    const ctx = getContext({
      packageJson: { dependencies: REACT, peerDependencies: REACT },
    });
    await getStorybookInfo(ctx);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('both "dependencies" and "peerDependencies"')
    );
  });

  it('returns other metadata if missing view layer package', async () => {
    const ctx = getContext({ packageJson: { dependencies: VUE } });
    await expect(getStorybookInfo(ctx)).resolves.toEqual(
      expect.objectContaining({
        addons: [
          {
            name: 'essentials',
            packageName: '@storybook/addon-essentials',
            packageVersion: expect.any(String),
          },
          {
            name: 'compiler-swc',
            packageName: '@storybook/addon-webpack5-compiler-swc',
            packageVersion: expect.any(String),
          },
        ],
        builder: { name: '@storybook/react-webpack5', packageVersion: expect.any(String) },
      })
    );
  });

  it('looks up package in node_modules on missing dependency', async () => {
    await expect(getStorybookInfo(context)).resolves.toEqual(
      // We're getting the result of tracing chromatic-cli's node_modules here.
      expect.objectContaining({
        viewLayer: 'react',
        version: '8.1.5',
        addons: [
          {
            name: 'essentials',
            packageName: '@storybook/addon-essentials',
            packageVersion: expect.any(String),
          },
          {
            name: 'compiler-swc',
            packageName: '@storybook/addon-webpack5-compiler-swc',
            packageVersion: expect.any(String),
          },
        ],
        builder: { name: '@storybook/react-webpack5', packageVersion: expect.any(String) },
      })
    );
    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining('No viewlayer package listed in dependencies')
    );
  });

  describe('with CHROMATIC_STORYBOOK_VERSION', () => {
    it('returns viewLayer and version from env', async () => {
      const ctx = getContext({
        env: { CHROMATIC_STORYBOOK_VERSION: '@storybook/react@3.2.1' },
      });
      expect(await getStorybookInfo(ctx)).toEqual(
        expect.objectContaining({
          viewLayer: 'react',
          version: '3.2.1',
          builder: { name: '@storybook/react-webpack5', packageVersion: expect.any(String) },
        })
      );
    });

    it('supports unscoped package name', async () => {
      const ctx = getContext({ env: { CHROMATIC_STORYBOOK_VERSION: 'react@3.2.1' } });
      expect(await getStorybookInfo(ctx)).toEqual(
        expect.objectContaining({
          viewLayer: 'react',
          version: '3.2.1',
          builder: { name: '@storybook/react-webpack5', packageVersion: expect.any(String) },
        })
      );
    });

    it('still returns addons and builder for invalid version value', async () => {
      const ctx = getContext({ env: { CHROMATIC_STORYBOOK_VERSION: '3.2.1' } });
      expect(await getStorybookInfo(ctx)).toEqual(
        expect.objectContaining({
          addons: [
            {
              name: 'essentials',
              packageName: '@storybook/addon-essentials',
              packageVersion: expect.any(String),
            },
            {
              name: 'compiler-swc',
              packageName: '@storybook/addon-webpack5-compiler-swc',
              packageVersion: expect.any(String),
            },
          ],
          builder: { name: '@storybook/react-webpack5', packageVersion: expect.any(String) },
        })
      );
    });

    it('does not include unsupported view layers', async () => {
      const ctx = getContext({ env: { CHROMATIC_STORYBOOK_VERSION: '@storybook/native@3.2.1' } });
      expect(await getStorybookInfo(ctx)).toEqual(
        expect.objectContaining({
          addons: [
            {
              name: 'essentials',
              packageName: '@storybook/addon-essentials',
              packageVersion: expect.any(String),
            },
            {
              name: 'compiler-swc',
              packageName: '@storybook/addon-webpack5-compiler-swc',
              packageVersion: expect.any(String),
            },
          ],
          builder: { name: '@storybook/react-webpack5', packageVersion: expect.any(String) },
        })
      );
    });
  });

  describe('with --storybook-build-dir', () => {
    it('returns viewLayer and version from packageJson', async () => {
      const ctx = getContext({
        options: { storybookBuildDir: 'bin-src/__mocks__/normalProjectJson' },
        packageJson: { dependencies: REACT },
      });
      expect(await getStorybookInfo(ctx)).toEqual({
        addons: [
          {
            name: 'essentials',
            packageName: '@storybook/addon-essentials',
            packageVersion: expect.any(String),
          },
          {
            name: 'compiler-swc',
            packageName: '@storybook/addon-webpack5-compiler-swc',
            packageVersion: expect.any(String),
          },
        ],
        builder: { name: '@storybook/builder-webpack5', packageVersion: expect.any(String) },
        version: expect.any(String),
        viewLayer: '@storybook/react-webpack5',
      });
    });

    it('returns no metadata if cannot find project.json', async () => {
      const ctx = getContext({
        options: { storybookBuildDir: 'bin-src/__mocks__/malformedProjectJson' },
        packageJson: { dependencies: REACT },
      });
      expect(await getStorybookInfo(ctx)).toEqual({
        addons: [],
        version: null,
        viewLayer: null,
        builder: null,
      });
    });

    it('does not return unsupported addons in metadata', async () => {
      const ctx = getContext({
        options: { storybookBuildDir: 'bin-src/__mocks__/unsupportedAddons' },
        packageJson: { dependencies: REACT },
      });
      expect(await getStorybookInfo(ctx)).toEqual({
        addons: [
          {
            name: 'essentials',
            packageName: '@storybook/addon-essentials',
            packageVersion: expect.any(String),
          },
          {
            name: 'compiler-swc',
            packageName: '@storybook/addon-webpack5-compiler-swc',
            packageVersion: expect.any(String),
          },
        ],
        builder: { name: '@storybook/builder-webpack5', packageVersion: expect.any(String) },
        version: expect.any(String),
        viewLayer: '@storybook/react-webpack5',
      });
    });

    it('returns the correct metadata for Storybook 6', async () => {
      const ctx = getContext({
        options: { storybookBuildDir: 'bin-src/__mocks__/sb6ProjectJson' },
        packageJson: { dependencies: REACT },
      });
      expect(await getStorybookInfo(ctx)).toEqual({
        addons: [
          {
            name: 'links',
            packageName: '@storybook/addon-links',
            packageVersion: '6.5.16',
          },
          {
            name: 'essentials',
            packageName: '@storybook/addon-essentials',
            packageVersion: '6.5.16',
          },
          {
            name: 'interactions',
            packageName: '@storybook/addon-interactions',
            packageVersion: '6.5.16',
          },
        ],
        builder: { name: 'webpack4', packageVersion: '6.5.16' },
        version: '6.5.16',
        viewLayer: 'react',
      });
    });
  });
});
