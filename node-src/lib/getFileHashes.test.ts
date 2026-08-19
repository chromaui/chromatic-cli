import { describe, expect, it } from 'vitest';

import { getFileHashes } from './getFileHashes';

describe('getFileHashes', () => {
  it('should return a map of file paths to hashes', async () => {
    const hashes = await getFileHashes({
      files: ['iframe.html', 'index.html'],
      directory: 'node-src/__mocks__',
      concurrency: 2,
    });

    expect(hashes).toEqual({
      'iframe.html': '80b7ac41594507e8',
      'index.html': '0e98fd69b0b01605',
    });
  });
});
