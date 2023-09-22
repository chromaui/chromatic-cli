import { readFileSync } from 'fs';
import { beforeEach, expect, it, vi } from 'vitest';

import { getConfiguration } from './getConfiguration';

vi.mock('fs');
const mockedReadFile = vi.mocked(readFileSync);

beforeEach(() => {
  mockedReadFile.mockReset();
});

it('reads configuration successfully', async () => {
  mockedReadFile.mockReturnValue(JSON.stringify({ projectToken: 'json-file-token' }));

  expect(await getConfiguration()).toEqual({ projectToken: 'json-file-token' });
});

it('reads from chromatic.config.json by default', async () => {
  mockedReadFile.mockReturnValue(JSON.stringify({ projectToken: 'json-file-token' })).mockClear();
  await getConfiguration();

  expect(mockedReadFile).toHaveBeenCalledWith('chromatic.config.json', 'utf8');
});

it('can read from a different location', async () => {
  mockedReadFile.mockReturnValue(JSON.stringify({ projectToken: 'json-file-token' })).mockClear();
  await getConfiguration('test.file');

  expect(mockedReadFile).toHaveBeenCalledWith('test.file', 'utf8');
});

it('returns nothing if there is no config file and it was not specified', async () => {
  mockedReadFile.mockImplementation(() => {
    throw new Error('ENOENT');
  });

  expect(await getConfiguration()).toEqual({});
});

it('returns nothing if there is no config file and it was specified', async () => {
  mockedReadFile.mockImplementation(() => {
    throw new Error('ENOENT');
  });

  await expect(getConfiguration('test.file')).rejects.toThrow(/could not be found/);
});

it('errors if config file contains invalid data', async () => {
  mockedReadFile.mockReturnValue(JSON.stringify({ projectToken: 1 }));

  await expect(getConfiguration('test.file')).rejects.toThrow(/projectToken/);
});

it('errors if config file contains unknown keys', async () => {
  mockedReadFile.mockReturnValue(JSON.stringify({ random: 1 }));

  await expect(getConfiguration('test.file')).rejects.toThrow(/random/);
});
