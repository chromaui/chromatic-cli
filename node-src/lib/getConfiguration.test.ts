import { readFile } from 'jsonfile';
import { getConfiguration } from './getConfiguration';

jest.mock('jsonfile');
const mockedReadFile = jest.mocked(readFile);

beforeEach(() => {
  mockedReadFile.mockReset();
});

it('reads configuration successfully', async () => {
  mockedReadFile.mockResolvedValue({ projectToken: 'json-file-token' });

  expect(await getConfiguration()).toEqual({ projectToken: 'json-file-token' });
});

it('reads from chromatic.config.json by default', async () => {
  mockedReadFile.mockResolvedValue({ projectToken: 'json-file-token' }).mockClear();
  await getConfiguration();

  expect(mockedReadFile).toHaveBeenCalledWith('chromatic.config.json');
});

it('can read from a different location', async () => {
  mockedReadFile.mockResolvedValue({ projectToken: 'json-file-token' }).mockClear();
  await getConfiguration('test.file');

  expect(mockedReadFile).toHaveBeenCalledWith('test.file');
});

it('returns nothing if there is no config file and it was not specified', async () => {
  mockedReadFile.mockRejectedValue(new Error('ENOENT'));

  expect(await getConfiguration()).toEqual({});
});

it('returns nothing if there is no config file and it was specified', async () => {
  mockedReadFile.mockRejectedValue(new Error('ENOENT'));

  await expect(getConfiguration('test.file')).rejects.toThrow(/could not be found/);
});

it('errors if config file contains invalid data', async () => {
  mockedReadFile.mockResolvedValue({ projectToken: 1 });

  await expect(getConfiguration('test.file')).rejects.toThrow(/projectToken/);
});

it('errors if config file contains unknown keys', async () => {
  mockedReadFile.mockResolvedValue({ random: 1 });

  await expect(getConfiguration('test.file')).rejects.toThrow(/random/);
});
