import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolvePackageJson } from '../getStorybookMetadata';
import { validateStorybookReactNativeVersion } from './validateStorybookVersion';

vi.mock('../getStorybookMetadata', () => ({
  resolvePackageJson: vi.fn(),
}));

const mockResolvePackageJson = vi.mocked(resolvePackageJson);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('validateStorybookReactNativeVersion', () => {
  it('resolves when installed version is 9.0.0', async () => {
    mockResolvePackageJson.mockResolvedValue({ version: '9.0.0' });
    await expect(validateStorybookReactNativeVersion()).resolves.toBeUndefined();
  });

  it('resolves when installed version is greater than 9.0.0', async () => {
    mockResolvePackageJson.mockResolvedValue({ version: '9.2.3' });
    await expect(validateStorybookReactNativeVersion()).resolves.toBeUndefined();
  });

  it('resolves for pre-release patch of 9.0.1', async () => {
    mockResolvePackageJson.mockResolvedValue({ version: '9.0.1-beta.1' });
    await expect(validateStorybookReactNativeVersion()).resolves.toBeUndefined();
  });

  it('rejects for pre-release of 9.0.0', async () => {
    mockResolvePackageJson.mockResolvedValue({ version: '9.0.0-beta.1' });
    await expect(validateStorybookReactNativeVersion()).rejects.toThrow(
      /Unsupported Storybook React Native version/
    );
  });

  it('rejects with the unsupported-version error for 8.x', async () => {
    mockResolvePackageJson.mockResolvedValue({ version: '8.6.0' });
    await expect(validateStorybookReactNativeVersion()).rejects.toThrow(
      /Unsupported Storybook React Native version/
    );
    await expect(validateStorybookReactNativeVersion()).rejects.toThrow(/8\.6\.0/);
  });

  it('rejects with the missing-package error when resolve fails', async () => {
    mockResolvePackageJson.mockRejectedValue(new Error('ENOENT'));
    await expect(validateStorybookReactNativeVersion()).rejects.toThrow(
      /React Native Storybook package not found/
    );
  });

  it('rejects with the unsupported-version error when version field is absent', async () => {
    mockResolvePackageJson.mockResolvedValue({});
    await expect(validateStorybookReactNativeVersion()).rejects.toThrow(
      /Unsupported Storybook React Native version/
    );
  });
});
