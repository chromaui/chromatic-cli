import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getStorybookProjectRoot, relativeTo } from './getStorybookProjectRoot';

const mockedCwd = vi.spyOn(process, 'cwd');
const mockedRelative = vi.spyOn(path, 'relative');
const mockedResolve = vi.spyOn(path, 'resolve');

// The definition of posix depends on `path.sep` being correct for the system running the test. This
// corrects the behavior to act like it's running in Windows.
vi.mock('./posix', () => ({
  posix: (localPath: string) => localPath.split('\\').filter(Boolean).join('/'),
}));

// The task derives the base directory it reports from the project root, so every case below is
// checked in both forms. This is the only thing keeping the two from drifting apart.
function baseDirectoryFor(input: { storybookBaseDir?: string; gitRootPath?: string }) {
  return relativeTo(input.gitRootPath ?? process.cwd(), getStorybookProjectRoot(input)) || '.';
}

describe('getStorybookProjectRoot', () => {
  it('is the cwd when nothing is configured', () => {
    mockedCwd.mockReturnValue('/path/to/project');

    expect(getStorybookProjectRoot({})).toBe('/path/to/project');
    expect(baseDirectoryFor({})).toBe('.');
  });

  it('is the cwd when only the git root is known', () => {
    const rootPath = '/path/to/project';
    mockedCwd.mockReturnValue(`${rootPath}/storybook`);

    expect(getStorybookProjectRoot({ gitRootPath: rootPath })).toBe('/path/to/project/storybook');
    expect(baseDirectoryFor({ gitRootPath: rootPath })).toBe('storybook');
  });

  it('resolves the configured base directory against the git root', () => {
    const rootPath = '/path/to/project';
    mockedCwd.mockReturnValue(rootPath);

    const input = { storybookBaseDir: 'packages/ui', gitRootPath: rootPath };
    expect(getStorybookProjectRoot(input)).toBe('/path/to/project/packages/ui');
    expect(baseDirectoryFor(input)).toBe('packages/ui');
  });

  it('keeps the configured base directory when there is no git root', () => {
    mockedCwd.mockReturnValue('/path/to/project');

    const input = { storybookBaseDir: 'packages/ui' };
    expect(getStorybookProjectRoot(input)).toBe('/path/to/project/packages/ui');
    expect(baseDirectoryFor(input)).toBe('packages/ui');
  });

  it('normalizes a base directory written with a leading ./', () => {
    const rootPath = '/path/to/project';
    mockedCwd.mockReturnValue(rootPath);

    expect(baseDirectoryFor({ storybookBaseDir: './packages/ui', gitRootPath: rootPath })).toBe(
      'packages/ui'
    );
  });

  it('reports a base directory above the git root as an ascending path', () => {
    const rootPath = '/path/to/project';
    mockedCwd.mockReturnValue(rootPath);

    expect(baseDirectoryFor({ storybookBaseDir: '../sibling', gitRootPath: rootPath })).toBe(
      '../sibling'
    );
  });

  describe('with windows paths', () => {
    beforeEach(() => {
      mockedRelative.mockImplementation(path.win32.relative);
      mockedResolve.mockImplementation(path.win32.resolve);
    });

    afterEach(() => {
      mockedRelative.mockRestore();
      mockedResolve.mockRestore();
    });

    it('uses posix paths even if we are windows', () => {
      const rootPath = String.raw`C:\path\to\project`;
      mockedCwd.mockReturnValue(String.raw`${rootPath}\storybook\subdir`);

      expect(baseDirectoryFor({ gitRootPath: rootPath })).toBe('storybook/subdir');
    });
  });
});
