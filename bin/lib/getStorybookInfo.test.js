import getStorybookInfo from './getStorybookInfo';

jest.useFakeTimers();

const log = { warn: jest.fn(), debug: jest.fn() };
const context = { env: {}, log, options: {}, packageJson: {} };

const REACT = { '@storybook/react': '1.2.3' };
const VUE = { '@storybook/vue': '1.2.3' };

describe('getStorybookInfo', () => {
  afterEach(() => {
    // This would clear all existing timer functions
    jest.clearAllTimers();
  });

  it('returns viewLayer and version', async () => {
    const ctx = { ...context, packageJson: { dependencies: REACT } };
    await expect(getStorybookInfo(ctx)).resolves.toEqual(
      // We're getting the result of tracing chromatic-cli's node_modules here.
      expect.objectContaining({ viewLayer: 'react', version: expect.any(String) })
    );
  });

  it('warns on duplicate devDependency', async () => {
    const ctx = { ...context, packageJson: { dependencies: REACT, devDependencies: REACT } };
    await getStorybookInfo(ctx);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('both "dependencies" and "devDependencies"')
    );
  });

  it('warns on duplicate peerDependency', async () => {
    const ctx = { ...context, packageJson: { dependencies: REACT, peerDependencies: REACT } };
    await getStorybookInfo(ctx);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('both "dependencies" and "peerDependencies"')
    );
  });

  it('throws on missing package', async () => {
    const ctx = { ...context, packageJson: { dependencies: VUE } };
    await expect(getStorybookInfo(ctx)).rejects.toThrow('Storybook package not installed');
  });

  it('looks up package in node_modules on missing dependency', async () => {
    await expect(getStorybookInfo(context)).resolves.toEqual(
      // We're getting the result of tracing chromatic-cli's node_modules here.
      expect.objectContaining({ viewLayer: 'react', version: expect.any(String) })
    );
    expect(log.debug).toHaveBeenCalledWith(
      expect.stringContaining('No viewlayer package listed in dependencies')
    );
  });

  describe('with CHROMATIC_STORYBOOK_VERSION', () => {
    it('returns viewLayer and version from env', async () => {
      const ctx = { ...context, env: { CHROMATIC_STORYBOOK_VERSION: '@storybook/react@3.2.1' } };
      await expect(getStorybookInfo(ctx)).resolves.toEqual(
        expect.objectContaining({ viewLayer: 'react', version: '3.2.1' })
      );
    });

    it('supports unscoped package name', async () => {
      const ctx = { ...context, env: { CHROMATIC_STORYBOOK_VERSION: 'react@3.2.1' } };
      await expect(getStorybookInfo(ctx)).resolves.toEqual(
        expect.objectContaining({ viewLayer: 'react', version: '3.2.1' })
      );
    });

    it('throws on invalid value', async () => {
      const ctx = { ...context, env: { CHROMATIC_STORYBOOK_VERSION: '3.2.1' } };
      await expect(getStorybookInfo(ctx)).rejects.toThrow('Invalid');
    });

    it('throws on unsupported viewlayer', async () => {
      const ctx = { ...context, env: { CHROMATIC_STORYBOOK_VERSION: '@storybook/native@3.2.1' } };
      await expect(getStorybookInfo(ctx)).rejects.toThrow('Unsupported');
    });
  });

  describe('with --storybook-build-dir', () => {
    it('returns viewLayer and version from packageJson', async () => {
      const ctx = {
        ...context,
        options: { storybookBuildDir: 'storybook-static' },
        packageJson: { dependencies: REACT },
      };
      await expect(getStorybookInfo(ctx)).resolves.toEqual(
        expect.objectContaining({ viewLayer: 'react', version: '1.2.3' })
      );
    });
  });
});
