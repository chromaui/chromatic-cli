import { existsSync } from 'fs';
import mockFs from 'mock-fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import makeZipFile from './compress';
import TestLogger from './testLogger';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  mockFs.restore();
});

const testContext = { sourceDir: '/chromatic-tmp', log: new TestLogger() } as any;
const fileInfo = { paths: ['/chromatic-tmp/file1'] };

describe('makeZipFile', () => {
  it('adds files to an archive', async () => {
    mockFs({
      '/chromatic-tmp': {
        file1: 'Storybook',
      },
    });

    const result = await makeZipFile(testContext, fileInfo);

    expect(existsSync(result.path)).toBeTruthy();
    expect(result.size).toBeGreaterThan(0);
  });

  it('rejects on error signals', () => {
    return expect(makeZipFile(testContext, fileInfo)).rejects.toThrow(
      `ENOENT: no such file or directory, open '/chromatic-tmp/file1'`
    );
  });
});
