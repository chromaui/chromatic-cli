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

it('strips off leading dots from the configured value', () => {
  expect(getStorybookBaseDirectory({ options: { storybookBaseDir: '.' } } as Context)).toBe('');
});

it('strips off leading dots from the configured value', () => {
  expect(
    getStorybookBaseDirectory({ options: { storybookBaseDir: './storybook' } } as Context)
  ).toBe('storybook');
});

it('calculates the relative path of the cwd to the git root when they are equal', () => {
  const rootPath = '/path/to/project';
  mockedCwd.mockReturnValue(rootPath);

  expect(getStorybookBaseDirectory({ git: { rootPath } } as Context)).toBe('');
});

it('calculates the relative path of the cwd to the git root when they are equal', () => {
  const rootPath = '/path/to/project';
  mockedCwd.mockReturnValue(`${rootPath}/storybook`);

  expect(getStorybookBaseDirectory({ git: { rootPath } } as Context)).toBe('storybook');
});

it('falls back the empty string if there is no git root', () => {
  const rootPath = '/path/to/project';
  mockedCwd.mockReturnValue(`${rootPath}/storybook`);

  expect(getStorybookBaseDirectory({} as Context)).toBe('');
});
