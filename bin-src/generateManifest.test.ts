import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getConfiguration } from '../node-src/lib/getConfiguration';
import { generateManifest } from '../node-src/lib/react-native/generateManifest';
import { validateStorybookReactNativeVersion } from '../node-src/lib/react-native/validateStorybookVersion';
import TestLogger from '../node-src/lib/testLogger';
import { main } from './generateManifest';

const testLogger = new TestLogger();

vi.mock('../node-src/lib/react-native/generateManifest', () => ({
  generateManifest: vi.fn(),
}));

vi.mock('../node-src/lib/react-native/validateStorybookVersion', () => ({
  validateStorybookReactNativeVersion: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../node-src/lib/log', () => ({
  createLogger: vi.fn(() => testLogger),
}));

vi.mock('../node-src/lib/getConfiguration', () => ({
  getConfiguration: vi.fn(),
}));

const mockValidateStorybookReactNativeVersion = vi.mocked(validateStorybookReactNativeVersion);
const mockGetConfiguration = vi.mocked(getConfiguration);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetConfiguration.mockResolvedValue({});
});

describe('generate-manifest', () => {
  it('generates manifest with required output-dir flag', async () => {
    await main(['-o', './.storybook-static']);

    expect(generateManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          storybookConfigDir: '.rnstorybook', // default
        }),
      }),
      { sourceDir: expect.stringContaining('.storybook-static') }
    );
  });

  it('generates manifest from custom config-dir', async () => {
    await main(['-o', './.storybook-static', '-c', './custom-config']);

    expect(generateManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          storybookConfigDir: './custom-config',
        }),
      }),
      { sourceDir: expect.stringContaining('.storybook-static') }
    );
  });

  it('passes reactNative settings from the config file to manifest generation', async () => {
    mockGetConfiguration.mockResolvedValue({ reactNative: { excludeStoryIds: ['card--*'] } });

    await main(['-o', './.storybook-static']);

    expect(generateManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ reactNative: { excludeStoryIds: ['card--*'] } }),
      }),
      { sourceDir: expect.stringContaining('.storybook-static') }
    );
  });

  it('exits without generating a manifest when the config file is invalid', async () => {
    mockGetConfiguration.mockRejectedValue(new TypeError('Configuration file is invalid'));
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await main(['-o', './.storybook-static']);

    expect(generateManifest).not.toHaveBeenCalled();
    expect(testLogger.error).toHaveBeenCalledWith('Error: Configuration file is invalid');
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it('shows error when output-dir is missing', async () => {
    await main([]);

    expect(testLogger.error).toHaveBeenCalledWith('Error: --output-dir is required');
    expect(generateManifest).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });

  it('validates Storybook React Native version before generating manifest', async () => {
    await main(['-o', './.storybook-static']);

    expect(mockValidateStorybookReactNativeVersion).toHaveBeenCalledTimes(1);
    expect(generateManifest).toHaveBeenCalledTimes(1);
  });

  it('skips manifest generation and exits when validation fails', async () => {
    const validationError = new Error('Unsupported Storybook React Native version');
    mockValidateStorybookReactNativeVersion.mockRejectedValue(validationError);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await main(['-o', './.storybook-static']);

    expect(generateManifest).not.toHaveBeenCalled();
    expect(testLogger.error).toHaveBeenCalledWith(expect.stringContaining(validationError.message));
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });
});
