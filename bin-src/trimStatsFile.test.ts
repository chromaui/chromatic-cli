import { existsSync, readFileSync } from 'fs';
import mockfs from 'mock-fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readStatsFile } from '../node-src/tasks/readStatsFile';
import * as trimmedFile from './__mocks__/previewStatsJson/preview-stats.trimmed.json';
import { main } from './trimStatsFile';

const smallStats = {
  modules: [
    {
      id: './src/Button.tsx',
      name: './src/Button.tsx',
      size: 100,
      reasons: [
        { moduleName: './src/Button.stories.tsx' },
        { moduleName: './src/Button.stories.tsx' },
        { moduleName: './node_modules/some-lib/index.js' },
        { moduleName: './src/Button.tsx' },
      ],
    },
    { id: './node_modules/some-lib/index.js', name: './node_modules/some-lib/index.js' },
    { id: 1, name: '(webpack)/buildin/global.js' },
    {
      id: './src/Button.stories.tsx',
      name: './src/Button.stories.tsx',
      modules: [{ name: './src/Button.stories.tsx', size: 50 }],
    },
  ],
};

beforeEach(() => {
  mockfs({
    './storybook-static/preview-stats.json': JSON.stringify(trimmedFile),
    './stats.json/preview-stats.json': JSON.stringify(trimmedFile),
    './small/preview-stats.json': JSON.stringify(smallStats),
    './no-extension/preview-stats': JSON.stringify(smallStats),
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

  it('keeps only user code modules, with deduped user code reasons', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await main(['./small/preview-stats.json']);
    expect(JSON.parse(readFileSync('./small/preview-stats.trimmed.json', 'utf8'))).toEqual({
      modules: [
        {
          id: './src/Button.tsx',
          name: './src/Button.tsx',
          reasons: [{ moduleName: './src/Button.stories.tsx' }],
        },
        {
          id: './src/Button.stories.tsx',
          name: './src/Button.stories.tsx',
          modules: [{ name: './src/Button.stories.tsx' }],
          reasons: [],
        },
      ],
    });
  });

  it('appends .trimmed.json to an input without a .json extension', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await main(['./no-extension/preview-stats']);
    expect(existsSync('./no-extension/preview-stats.trimmed.json')).toBe(true);
  });

  it('prints usage and exits 0 for --help, without trimming the default file', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit ${code}`);
    });
    await expect(main(['--help'])).rejects.toThrow('exit 0');
    expect(log.mock.calls.flat().join('\n')).toContain('chromatic trim-stats-file [<stats file>]');
    expect(existsSync('./storybook-static/preview-stats.trimmed.json')).toBe(false);
  });

  it('sets a non-zero exit code when the input cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await main(['./nope.json']);
    expect(process.exitCode).toBe(1);
  });

  it('rejects unknown flags instead of treating the next argument as their value', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit ${code}`);
    });
    await expect(main(['--verbose', './stats.json/preview-stats.json'])).rejects.toThrow('exit 2');
    expect(existsSync('./storybook-static/preview-stats.trimmed.json')).toBe(false);
  });
});
