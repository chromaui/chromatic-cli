import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getFileHashes } from '../../getFileHashes';
import { hashAbsolutePaths } from './fileHashes';

vi.mock('../../getFileHashes', () => ({
  getFileHashes: vi.fn(),
}));

const mockedGetFileHashes = vi.mocked(getFileHashes);

describe('hashAbsolutePaths', () => {
  beforeEach(() => {
    mockedGetFileHashes.mockResolvedValue({});
  });

  it('keys the hashes by the absolute path each file was read from', async () => {
    mockedGetFileHashes.mockResolvedValue({ '/repo/src/a.ts': 'H1', '/repo/src/b.ts': 'H2' });

    expect(await hashAbsolutePaths(['/repo/src/a.ts', '/repo/src/b.ts'])).toEqual({
      '/repo/src/a.ts': 'H1',
      '/repo/src/b.ts': 'H2',
    });
  });

  it('passes an empty directory so the absolute paths are used as-is', async () => {
    // getFileHashes joins its directory argument with each file, which would corrupt an absolute path.
    await hashAbsolutePaths(['/repo/src/a.ts']);

    expect(mockedGetFileHashes).toHaveBeenCalledWith(['/repo/src/a.ts'], '', expect.any(Number));
  });

  it('bounds how many files are read at once', async () => {
    // getFileHashes allocates a 64K read buffer per in-flight file, so an unbounded call would let
    // peak memory scale with the number of files hashed.
    await hashAbsolutePaths(['/repo/src/a.ts']);

    const concurrency = mockedGetFileHashes.mock.calls[0][2];
    expect(concurrency).toBeGreaterThan(0);
    expect(concurrency).toBeLessThanOrEqual(32);
  });

  it('returns an empty result without reading anything when given no paths', async () => {
    expect(await hashAbsolutePaths([])).toEqual({});
    expect(mockedGetFileHashes).not.toHaveBeenCalled();
  });
});
