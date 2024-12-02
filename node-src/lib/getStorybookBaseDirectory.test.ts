import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Context } from '../types';
import { getStorybookBaseDirectory } from './getStorybookBaseDirectory';

const mockedCwd = vi.spyOn(process, 'cwd');
const mockedRelative = vi.spyOn(path, 'relative');
const mockedJoin = vi.spyOn(path, 'join');

// The definition of posix depends on `path.sep` being correct for the system
// (ie.equal to `\\` for windows), however we can't really mock that as it's a constant
vi.mock('./posix', () => ({
  posix: (localPath: string) => localPath.split('\\').filter(Boolean).join('/'),
}));

it('defaults to the configured value', () => {
  expect(getStorybookBaseDirectory({ options: { storybookBaseDir: 'foobar' } } as Context)).toBe(
    'foobar'
  );
});

it('calculates the relative path of the cwd to the git root when they are equal', () => {
  const rootPath = '/path/to/project';
  mockedCwd.mockReturnValue(rootPath);

  expect(getStorybookBaseDirectory({ git: { rootPath } } as Context)).toBe('.');
});

it('calculates the relative path of the cwd to the git root we are in subdir', () => {
  const rootPath = '/path/to/project';
  mockedCwd.mockReturnValue(`${rootPath}/storybook`);

  expect(getStorybookBaseDirectory({ git: { rootPath } } as Context)).toBe('storybook');
});

it('calculates the relative path of the cwd to the git root when we are outside the git root', () => {
  const rootPath = '/path/to/project';
  mockedCwd.mockReturnValue(`/path/to/elsewhere`);

  expect(getStorybookBaseDirectory({ git: { rootPath } } as Context)).toBe('../elsewhere');
});

it('falls back the empty string if there is no git root', () => {
  const rootPath = '/path/to/project';
  mockedCwd.mockReturnValue(`${rootPath}/storybook`);

  expect(getStorybookBaseDirectory({} as Context)).toBe('.');
});

describe('with windows paths', () => {
  beforeEach(() => {
    mockedRelative.mockImplementation(path.win32.relative);
    mockedJoin.mockImplementation(path.win32.join);
  });

  afterEach(() => {
    mockedRelative.mockRestore();
    mockedJoin.mockRestore();
  });

  it('uses posix paths even if we are windows', () => {
    const rootPath = String.raw`C:\path\to\project`;
    mockedCwd.mockReturnValue(String.raw`${rootPath}\storybook\subdir`);

    expect(getStorybookBaseDirectory({ git: { rootPath } } as Context)).toBe('storybook/subdir');
  });
});
