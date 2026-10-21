import { existsSync } from 'fs';
import mockfs from 'mock-fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readStatsFile } from '../node-src/tasks/readStatsFile';
import * as trimmedFile from './__mocks__/previewStatsJson/preview-stats.trimmed.json';
import { main } from './trimStatsFile';

beforeEach(() => {
  mockfs({
    './storybook-static/preview-stats.json': JSON.stringify(trimmedFile),
    './stats.json/preview-stats.json': JSON.stringify(trimmedFile),
  });
});

afterEach(() => {
  mockfs.restore();
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

describe('Trim Stats File', () => {
  it('readStatsFile returns expected output', async () => {
    const result = await readStatsFile('./storybook-static/preview-stats.json');
    expect(
      result.modules.some(({ id }) => id === './node-src/ui/components/icons.stories.ts')
    ).toBe(true);
  });

  it('writes the trimmed file next to the input, renaming only the file extension', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await main(['./stats.json/preview-stats.json']);
    expect(existsSync('./stats.json/preview-stats.trimmed.json')).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });

  it('sets a non-zero exit code when the input cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await main(['./nope.json']);
    expect(process.exitCode).toBe(1);
  });
});
