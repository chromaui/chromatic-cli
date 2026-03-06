import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generateManifest } from '../node-src/lib/react-native/generateManifest';
import TestLogger from '../node-src/lib/testLogger';
import { main } from './generateManifest';

const testLogger = new TestLogger();

vi.mock('../node-src/lib/react-native/generateManifest', () => ({
  generateManifest: vi.fn(),
}));

vi.mock('../node-src/lib/log', () => ({
  createLogger: vi.fn(() => testLogger),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generate-manifest', () => {
  it('generates manifest with required output-dir flag', async () => {
    await main(['-o', './.storybook-static']);

    expect(generateManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          storybookConfigDir: '.rnstorybook', // default
        }),
        sourceDir: expect.stringContaining('.storybook-static'),
      })
    );
  });

  it('generates manifest from custom config-dir', async () => {
    await main(['-o', './.storybook-static', '-c', './custom-config']);

    expect(generateManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          storybookConfigDir: './custom-config',
        }),
        sourceDir: expect.stringContaining('.storybook-static'),
      })
    );
  });

  it('shows error when output-dir is missing', async () => {
    await main([]);

    expect(testLogger.error).toHaveBeenCalledWith('Error: --output-dir is required');
    expect(generateManifest).not.toHaveBeenCalled();
  });
});
