import process from 'node:process';

import { expect, it, vi } from 'vitest';

import { Context } from '../types';
import { getStorybookBaseDirectory } from './getStorybookBaseDirectory';

const mockedCwd = vi.spyOn(process, 'cwd');

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
