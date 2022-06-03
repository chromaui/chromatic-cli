import mock from 'mock-fs';
import { Context } from '../types';
import getStorybookInfo from './getStorybookInfo';

jest.useFakeTimers();

const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
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

jest.setTimeout(10000);
describe('getStorybookInfo', () => {
  afterEach(() => {
    // This would clear all existing timer functions
    jest.clearAllTimers();
  });

  it('returns viewLayer and version', async () => {
    const ctx = getContext({ packageJson: { dependencies: REACT } });
    await expect(getStorybookInfo(ctx)).resolves.toEqual(
      // We're getting the result of tracing chromatic-cli's node_modules here.
      expect.objectContaining({
        viewLayer: 'react',
        version: expect.any(String),
        builder: { name: 'webpack5', packageVersion: '6.5.6' },
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

  it('throws on missing package', async () => {
    const ctx = getContext({ packageJson: { dependencies: VUE } });
    await expect(getStorybookInfo(ctx)).resolves.toEqual({
      addons: [],
      version: null,
      viewLayer: null,
      builder: null,
    });
  });

  it('looks up package in node_modules on missing dependency', async () => {
    await expect(getStorybookInfo(context)).resolves.toEqual(
      // We're getting the result of tracing chromatic-cli's node_modules here.
      expect.objectContaining({
        viewLayer: 'react',
        version: expect.any(String),
        builder: { name: 'webpack5', packageVersion: '6.5.6' },
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
      await expect(getStorybookInfo(ctx)).resolves.toEqual(
        expect.objectContaining({
          viewLayer: 'react',
          version: '3.2.1',
          builder: { name: 'webpack5', packageVersion: '6.5.6' },
        })
      );
    });

    it('supports unscoped package name', async () => {
      const ctx = getContext({ env: { CHROMATIC_STORYBOOK_VERSION: 'react@3.2.1' } });
      await expect(getStorybookInfo(ctx)).resolves.toEqual(
        expect.objectContaining({
          viewLayer: 'react',
          version: '3.2.1',
          builder: { name: 'webpack5', packageVersion: '6.5.6' },
        })
      );
    });

    it('throws on invalid value', async () => {
      const ctx = getContext({ env: { CHROMATIC_STORYBOOK_VERSION: '3.2.1' } });
      await expect(getStorybookInfo(ctx)).resolves.toEqual({
        addons: [],
        version: null,
        viewLayer: null,
        builder: null,
      });
    });

    it('throws on unsupported viewlayer', async () => {
      const ctx = getContext({ env: { CHROMATIC_STORYBOOK_VERSION: '@storybook/native@3.2.1' } });
      await expect(getStorybookInfo(ctx)).resolves.toEqual({
        addons: [],
        version: null,
        viewLayer: null,
        builder: null,
      });
    });
  });

  describe('with --storybook-build-dir', () => {
    it('returns viewLayer and version from packageJson', async () => {
      const ctx = getContext({
        options: { storybookBuildDir: 'bin-src/__mocks__/normalProjectJson' },
        packageJson: { dependencies: REACT },
      });
      await expect(getStorybookInfo(ctx)).resolves.toEqual({
        addons: [
          {
            name: 'viewport',
            packageName: '@storybook/addon-viewport',
            packageVersion: '6.5.6',
          },
        ],
        builder: { name: 'webpack5', packageVersion: '6.5.6' },
        version: '6.5.6',
        viewLayer: 'react',
      });
    });

    it('returns no metadata if cannot find project.json', async () => {
      const ctx = getContext({
        options: { storybookBuildDir: 'bin-src/__mocks__/malformedProjectJson' },
        packageJson: { dependencies: REACT },
      });
      await expect(getStorybookInfo(ctx)).resolves.toEqual({
        addons: [],
        version: null,
        viewLayer: null,
        builder: null,
      });
    });
  });
});
