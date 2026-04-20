import TestLogger from '@cli/testLogger';
import { pathExists, readJson } from 'fs-extra';
import { createRequire } from 'module';
import { beforeEach, expect, it, vi } from 'vitest';

import { validateStorybookReactNativeVersion } from './validateStorybookVersion';

vi.mock('module', () => ({
  createRequire: vi.fn(),
}));

vi.mock('fs-extra', () => ({
  pathExists: vi.fn(),
  readJson: vi.fn(),
}));

const mockCreateRequire = vi.mocked(
  createRequire as (filename: string) => {
    resolve: { paths: (request: string) => string[] | null };
  }
);
const mockReadJson = vi.mocked(readJson as (file: string) => Promise<{ version?: string }>);
const mockPathExists = vi.mocked(pathExists as (path: string) => Promise<boolean>);
const mockResolvePaths = vi.fn();

const ctx = { log: new TestLogger() };

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateRequire.mockReturnValue({
    resolve: { paths: mockResolvePaths },
  });
  mockResolvePaths.mockReturnValue(['/fake/node_modules']);
  mockPathExists.mockResolvedValue(true);
});

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

it('does not block when no candidate package.json exists on disk', async () => {
  mockPathExists.mockResolvedValue(false);
  const result = await validateStorybookReactNativeVersion(ctx);
  expect(result).toBeUndefined();
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
