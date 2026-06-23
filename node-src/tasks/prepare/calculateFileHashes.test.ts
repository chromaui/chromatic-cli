import { afterEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../../lib/testLogger';
import { calculateFileHashes } from './calculateFileHashes';

vi.mock('../../lib/getFileHashes', () => ({
  getFileHashes: (files: string[]) =>
    Promise.resolve(Object.fromEntries(files.map((f) => [f, 'hash']))),
}));

const environment = { CHROMATIC_RETRIES: 2, CHROMATIC_OUTPUT_INTERVAL: 0 };
const log = new TestLogger();

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('calculateFileHashes', () => {
  const fileInfo = {
    lengths: [
      { knownAs: 'iframe.html', contentLength: 42 },
      { knownAs: 'index.html', contentLength: 42 },
    ],
    paths: ['iframe.html', 'index.html'],
    total: 84,
  };

  it('returns hashes for the file paths', async () => {
    const { hashes } = await calculateFileHashes(
      { log, env: environment, options: { fileHashing: true }, report: vi.fn() } as any,
      { fileInfo: fileInfo as any, sourceDir: '/static/' }
    );

    expect(hashes).toMatchObject({
      'iframe.html': 'hash',
      'index.html': 'hash',
    });
  });

  it('returns nothing when file hashing is disabled', async () => {
    const { hashes } = await calculateFileHashes(
      { log, env: environment, options: { fileHashing: false }, report: vi.fn() } as any,
      { fileInfo: fileInfo as any, sourceDir: '/static/' }
    );

    expect(hashes).toBeUndefined();
  });
});
