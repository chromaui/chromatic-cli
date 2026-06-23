import { traceChangedFiles as traceChangedFilesDep } from '@cli/turbosnap';
import { access } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../../lib/testLogger';
import { traceChangedFiles } from './traceChangedFiles';

vi.mock('fs');
vi.mock('@cli/turbosnap');
vi.mock('../readStatsFile', () => ({
  readStatsFile: () =>
    Promise.resolve({
      modules: [
        {
          id: '../__mocks__/storybookBaseDir/test.ts',
          name: '../__mocks__/storybookBaseDir/test.ts',
        },
      ],
    }),
}));

const traceChangedFilesTurbosnap = vi.mocked(traceChangedFilesDep);
const accessMock = vi.mocked(access);

const environment = { CHROMATIC_RETRIES: 2, CHROMATIC_OUTPUT_INTERVAL: 0 };
const log = new TestLogger();

const deps = () => ({ log, options: {}, report: vi.fn() }) as any;

const turboSnapContext = () =>
  ({
    env: environment,
    log,
    options: {},
    fileInfo: { statsPath: '/static/preview-stats.json' },
    git: { changedFiles: ['./example.js'] },
    turboSnap: {},
  }) as any;

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('traceChangedFiles', () => {
  beforeEach(() => {
    accessMock.mockImplementation((_path, callback) => Promise.resolve(callback(null)));
  });

  it('returns onlyStoryFiles', async () => {
    const traced = { 123: ['./example.stories.js'] };
    traceChangedFilesTurbosnap.mockResolvedValue(traced);

    const result = await traceChangedFiles(deps(), { turboSnapContext: turboSnapContext() });

    expect(result.onlyStoryFiles).toStrictEqual(Object.keys(traced));
  });

  it('escapes special characters', async () => {
    const traced = {
      './$example-new.stories.js': ['./$example-new.stories.js'],
      './+example-new.stories.js': ['./+example-new.stories.js'],
      './example-(new).stories.js': ['./example-(new).stories.js'],
      './example[[lang=language]].stories.js': ['./example[[lang=language]].stories.js'],
      '[./example/[account]/[id]/[unit]/language/example.stories.tsx]': [
        '[./example/[account]/[id]/[unit]/language/example.stories.tsx]',
      ],
    };
    traceChangedFilesTurbosnap.mockResolvedValue(traced);

    const result = await traceChangedFiles(deps(), { turboSnapContext: turboSnapContext() });

    expect(result.onlyStoryFiles).toStrictEqual([
      String.raw`./\$example-new.stories.js`,
      String.raw`./\+example-new.stories.js`,
      String.raw`./example-\(new\).stories.js`,
      String.raw`./example\[\[lang=language\]\].stories.js`,
      String.raw`\[./example/\[account\]/\[id\]/\[unit\]/language/example.stories.tsx\]`,
    ]);
  });
});
