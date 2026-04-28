import TestLogger from '@cli/testLogger';
import { createRequire } from 'module';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { validateStorybookReactNativeVersion } from './validateStorybookVersion';

vi.mock('module', () => ({
  createRequire: vi.fn(),
}));

const mockCreateRequire = vi.mocked(
  createRequire as (filename: string) => {
    resolve: { paths: (request: string) => string[] | null };
  }
);
const mockResolvePaths = vi.fn();
const mockExists = vi.fn();
const mockReadJson = vi.fn();

const ctx = {
  log: new TestLogger(),
  ports: {
    fs: { exists: mockExists, readJson: mockReadJson },
    host: { cwd: () => process.cwd() },
  } as any,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateRequire.mockReturnValue({
    resolve: { paths: mockResolvePaths },
  });
  mockResolvePaths.mockReturnValue(['/fake/node_modules']);
  mockExists.mockResolvedValue(true);
});

describe('resolve cases', () => {
  it('resolves when installed version is 9.0.0', async () => {
    mockReadJson.mockResolvedValue({ version: '9.0.0' });
    const result = await validateStorybookReactNativeVersion(ctx);
    expect(result).toBeUndefined();
  });

  it('resolves when installed version is greater than 9.0.0', async () => {
    mockReadJson.mockResolvedValue({ version: '9.2.3' });
    const result = await validateStorybookReactNativeVersion(ctx);
    expect(result).toBeUndefined();
  });

  it('resolves for pre-release patch of 9.0.1', async () => {
    mockReadJson.mockResolvedValue({ version: '9.0.1-beta.1' });
    const result = await validateStorybookReactNativeVersion(ctx);
    expect(result).toBeUndefined();
  });
});

describe('reject cases', () => {
  it('rejects for pre-release of 9.0.0', async () => {
    mockReadJson.mockResolvedValue({ version: '9.0.0-beta.1' });
    await expect(validateStorybookReactNativeVersion(ctx)).rejects.toThrow(
      /Unsupported Storybook React Native version/
    );
  });

  it('rejects with the unsupported-version error for 8.x', async () => {
    mockReadJson.mockResolvedValue({ version: '8.6.0' });
    await expect(validateStorybookReactNativeVersion(ctx)).rejects.toThrow(
      /Unsupported Storybook React Native version/
    );
    await expect(validateStorybookReactNativeVersion(ctx)).rejects.toThrow(/8\.6\.0/);
  });
});

describe('gracefully handled error cases', () => {
  it('does not block when no candidate package.json exists on disk', async () => {
    mockExists.mockResolvedValue(false);
    const result = await validateStorybookReactNativeVersion(ctx);
    expect(result).toBeUndefined();
  });

  it('falls back to later node_modules paths when earlier candidates are missing', async () => {
    mockResolvePaths.mockReturnValue(['/missing/node_modules', '/found/node_modules']);
    mockExists.mockImplementation(async (candidate: string) => candidate.startsWith('/found/'));
    mockReadJson.mockResolvedValue({ version: '8.6.0' });

    await expect(validateStorybookReactNativeVersion(ctx)).rejects.toThrow(/8\.6\.0/);
    expect(mockReadJson).toHaveBeenCalledWith(
      '/found/node_modules/@storybook/react-native/package.json'
    );
  });

  it('does not block when require.resolve.paths returns null', async () => {
    mockResolvePaths.mockReturnValue(null);
    const result = await validateStorybookReactNativeVersion(ctx);
    expect(result).toBeUndefined();
  });

  it('does not block when the version field is absent', async () => {
    mockReadJson.mockResolvedValue({});
    const result = await validateStorybookReactNativeVersion(ctx);
    expect(result).toBeUndefined();
  });

  it('does not block when the version field is not valid semver', async () => {
    mockReadJson.mockResolvedValue({ version: 'workspace:*' });
    const result = await validateStorybookReactNativeVersion(ctx);
    expect(result).toBeUndefined();
  });

  it('does not block when reading package.json fails', async () => {
    mockReadJson.mockRejectedValue(new Error('Unexpected end of JSON input'));
    const result = await validateStorybookReactNativeVersion(ctx);
    expect(result).toBeUndefined();
  });
});
