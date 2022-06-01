import mock from 'mock-fs';
import { Context } from '../types';
import getStorybookInfo from './getStorybookInfo';
import { getStorybookMetadateFromProjectJson } from './getStorybookMetadata';

jest.useFakeTimers();

jest.mock('./getStorybookMetadata', () => {
  const original = jest.requireActual('./getStorybookMetadata'); // Step 2.
  return {
    __esModule: true,
    ...original,
    getStorybookMetadateFromProjectJson: jest.fn(() => ({
      addons: [
        {
          name: 'essentials',
          packageName: '@storybook/addon-essentials',
          packageVersion: '6.5.5',
        },
      ],
      builder: 'webpack5',
      version: '6.5.5',
      viewLayer: 'react',
    })),
  };
});

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

describe('getStorybookInfo', () => {
  afterEach(() => {
    // This would clear all existing timer functions
    jest.clearAllTimers();
  });

  it('returns viewLayer and version', async () => {
    const ctx = getContext({ packageJson: { dependencies: REACT } });
    await expect(getStorybookInfo(ctx)).resolves.toEqual(
      // We're getting the result of tracing chromatic-cli's node_modules here.
      expect.objectContaining({ viewLayer: 'react', version: expect.any(String) })
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
      expect.objectContaining({ viewLayer: 'react', version: expect.any(String) })
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
        expect.objectContaining({ viewLayer: 'react', version: '3.2.1' })
      );
    });

    it('supports unscoped package name', async () => {
      const ctx = getContext({ env: { CHROMATIC_STORYBOOK_VERSION: 'react@3.2.1' } });
      await expect(getStorybookInfo(ctx)).resolves.toEqual(
        expect.objectContaining({ viewLayer: 'react', version: '3.2.1' })
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
    beforeAll(() => {
      mock({
        'storybook-static': {
          'project.json':
            '{"generatedAt":1654054690474,"builder":{"name":"webpack5"},"hasCustomBabel":false,"hasCustomWebpack":true,"hasStaticDirs":false,"hasStorybookEslint":false,"refCount":0,"packageManager":{"type":"yarn","version":"1.22.18"},"features":{"postcss":false},"storybookVersion":"6.5.6","language":"typescript","storybookPackages":{"@storybook/addon-essentials":{"version":"6.5.6"},"@storybook/builder-webpack5":{"version":"6.5.6"},"@storybook/eslint-config-storybook":{"version":"3.1.2"},"@storybook/linter-config":{"version":"3.1.2"},"@storybook/manager-webpack5":{"version":"6.5.6"},"@storybook/react":{"version":"6.5.6"}},"framework":{"name":"react"},"addons":{"@storybook/addon-viewport":{"version":"6.5.6"}}}',
        },
      });
    });

    afterAll(() => {
      mock.restore();
    });

    it('returns viewLayer and version from packageJson', async () => {
      const ctx = getContext({
        options: { storybookBuildDir: 'storybook-static' },
        packageJson: { dependencies: REACT },
      });
      await expect(getStorybookInfo(ctx)).resolves.toEqual({
        addons: [
          {
            name: 'essentials',
            packageName: '@storybook/addon-essentials',
            packageVersion: '6.5.5',
          },
        ],
        builder: 'webpack5',
        version: '6.5.5',
        viewLayer: 'react',
      });
    });

    it('returns no metadata if cannot find project.json', async () => {
      const ctx = getContext({
        options: { storybookBuildDir: 'storybook-static' },
        packageJson: { dependencies: REACT },
      });
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      getStorybookMetadateFromProjectJson.mockImplementation(() => ({
        addons: [],
        version: null,
        viewLayer: null,
        builder: null,
      }));
      await expect(getStorybookInfo(ctx)).resolves.toEqual({
        addons: [],
        version: null,
        viewLayer: null,
        builder: null,
      });
    });
  });
});
