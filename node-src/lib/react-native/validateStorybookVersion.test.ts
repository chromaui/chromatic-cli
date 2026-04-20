import { readJson } from 'fs-extra';
import { createRequire } from 'module';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { validateStorybookReactNativeVersion } from './validateStorybookVersion';

vi.mock('module', () => ({
  createRequire: vi.fn(),
}));

vi.mock('fs-extra', () => ({
  readJson: vi.fn(),
}));

const mockCreateRequire = vi.mocked(createRequire);
const mockReadJson = vi.mocked(readJson) as unknown as ReturnType<typeof vi.fn>;
const mockResolve = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateRequire.mockReturnValue({ resolve: mockResolve } as unknown as NodeJS.Require);
  mockResolve.mockReturnValue('/fake/node_modules/@storybook/react-native/package.json');
});

describe('validateStorybookReactNativeVersion', () => {
  it('resolves when installed version is 9.0.0', async () => {
    mockReadJson.mockResolvedValue({ version: '9.0.0' });
    await expect(validateStorybookReactNativeVersion()).resolves.toBeUndefined();
  });

  it('resolves when installed version is greater than 9.0.0', async () => {
    mockReadJson.mockResolvedValue({ version: '9.2.3' });
    await expect(validateStorybookReactNativeVersion()).resolves.toBeUndefined();
  });

  it('resolves for pre-release patch of 9.0.1', async () => {
    mockReadJson.mockResolvedValue({ version: '9.0.1-beta.1' });
    await expect(validateStorybookReactNativeVersion()).resolves.toBeUndefined();
  });

  it('rejects for pre-release of 9.0.0', async () => {
    mockReadJson.mockResolvedValue({ version: '9.0.0-beta.1' });
    await expect(validateStorybookReactNativeVersion()).rejects.toThrow(
      /Unsupported Storybook React Native version/
    );
  });

  it('rejects with the unsupported-version error for 8.x', async () => {
    mockReadJson.mockResolvedValue({ version: '8.6.0' });
    await expect(validateStorybookReactNativeVersion()).rejects.toThrow(
      /Unsupported Storybook React Native version/
    );
    await expect(validateStorybookReactNativeVersion()).rejects.toThrow(/8\.6\.0/);
  });

  it('rejects with the missing-package error when require.resolve throws', async () => {
    mockResolve.mockImplementation(() => {
      throw new Error('Cannot find module');
    });
    await expect(validateStorybookReactNativeVersion()).rejects.toThrow(
      /React Native Storybook package not found/
    );
  });

  it('rejects with the unsupported-version error when version field is absent', async () => {
    mockReadJson.mockResolvedValue({});
    await expect(validateStorybookReactNativeVersion()).rejects.toThrow(
      /Unsupported Storybook React Native version/
    );
  });
});
