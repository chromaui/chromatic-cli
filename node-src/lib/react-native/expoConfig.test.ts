import { execa as execaDefault } from 'execa';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readExpoConfig } from './expoConfig';

vi.mock('execa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('execa')>();
  return { ...actual, execa: vi.fn() };
});

const execa = vi.mocked(execaDefault);

beforeEach(() => {
  execa.mockClear();
});

describe('readExpoConfig', () => {
  it('returns the parsed expo config', async () => {
    const config = { platforms: ['ios', 'android'], name: 'MyApp' };
    execa.mockResolvedValueOnce({ stdout: JSON.stringify(config) } as any);
    const result = await readExpoConfig();
    expect(result).toEqual(config);
    expect(execa).toHaveBeenCalledWith('npx', ['expo', 'config', '--json']);
  });

  it('throws a descriptive error when the expo config command fails', async () => {
    execa.mockRejectedValueOnce(new Error('not found'));
    await expect(readExpoConfig()).rejects.toThrow(
      'Failed to read Expo config. Ensure Expo is installed and you are in an Expo project directory.'
    );
  });
});
