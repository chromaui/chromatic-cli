import { afterEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../../lib/testLogger';
import { Deps, FileInfo } from '../../types';
import { calculateFileHashes } from './calculateFileHashes';

vi.mock('../../lib/getFileHashes', () => ({
  getFileHashes: (files: string[]) =>
    Promise.resolve(Object.fromEntries(files.map((f) => [f, `hash-${f}`]))),
}));

const log = new TestLogger();

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('calculateFileHashes', () => {
  it('returns hashes', async () => {
    const fileInfo: FileInfo = {
      statsPath: '',
      lengths: [
        {
          knownAs: 'iframe.html',
          contentLength: 42,
          pathname: '',
        },
        {
          knownAs: 'index.html',
          contentLength: 42,
          pathname: '',
        },
      ],
      paths: ['iframe.html', 'index.html'],
      total: 84,
    };
    const deps = {
      env: {} as Deps['env'],
      log,
    };

    const hashes = await calculateFileHashes(deps, { fileInfo, sourceDir: '/static/' });

    expect(hashes).toMatchObject({
      'iframe.html': 'hash-iframe.html',
      'index.html': 'hash-index.html',
    });
  });
});
