import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

import { getFileHashes } from './getFileHashes';

const BUFFER_BYTE_LENGTH = 64 * 1024;

describe('getFileHashes', () => {
  it('should return a map of file paths to hashes', async () => {
    const hashes = await getFileHashes(['iframe.html', 'index.html'], 'node-src/__mocks__', 2);

    expect(hashes).toEqual({
      'iframe.html': '80b7ac41594507e8',
      'index.html': '0e98fd69b0b01605',
    });
  });

  it('returns an empty object when there are no files', async () => {
    await expect(getFileHashes([], 'node-src/__mocks__', 2)).resolves.toEqual({});
  });

  it('allocates one 64KiB buffer per pool slot (min concurrency, file count), not one per file', async () => {
    const fixtureDirectory = mkdtempSync(path.join(tmpdir(), 'chromatic-hash-pool-'));
    const fileCount = 80;
    const concurrency = 5;
    const files: string[] = [];

    for (let index = 0; index < fileCount; index++) {
      const name = `f${index}.txt`;
      files.push(name);
      writeFileSync(path.join(fixtureDirectory, name), `row-${index}\n`);
    }

    const spy = vi.spyOn(Buffer, 'allocUnsafe');

    await getFileHashes(files, fixtureDirectory, concurrency);

    const poolAllocations = spy.mock.calls.filter((call) => call[0] === BUFFER_BYTE_LENGTH);
    expect(poolAllocations.length).toBe(concurrency);

    spy.mockRestore();
    rmSync(fixtureDirectory, { recursive: true, force: true });
  });

  it('matches sequential hashing when reusing the buffer pool at higher concurrency', async () => {
    const fixtureDirectory = mkdtempSync(path.join(tmpdir(), 'chromatic-hash-pool-'));
    const fileCount = 40;
    const files: string[] = [];

    for (let index = 0; index < fileCount; index++) {
      const name = `f${index}.txt`;
      files.push(name);
      // Mix short rows and a payload over 64KiB so incremental reads share pool buffers.
      const line = `row-${index}\n`;
      const body = index === 7 ? `${line}${'x'.repeat(70 * 1024)}` : line;
      writeFileSync(path.join(fixtureDirectory, name), body);
    }

    const sequential = await getFileHashes(files, fixtureDirectory, 1);
    const pooled = await getFileHashes(files, fixtureDirectory, 8);

    expect(pooled).toEqual(sequential);

    rmSync(fixtureDirectory, { recursive: true, force: true });
  });
});
