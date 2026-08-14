import { close, open, read } from 'fs';
import pLimit from 'p-limit';
import path from 'path';
import xxHashWasm, { XXHash, XXHashAPI } from 'xxhash-wasm';

import getEnvironment from './getEnvironment';

const hashFile = (buffer: Buffer, path: string, xxhash: XXHashAPI): Promise<string> => {
  const BUFFER_SIZE = buffer.length;

  // This uses callback-style fs functions because it runs faster than with their promise-based counterparts.
  return new Promise((resolve, reject) => {
    const done = (fd: number, getResult: () => bigint) => {
      let result = BigInt(0);
      close(fd, (closeError) => {
        if (closeError) reject(closeError);
        else resolve(result.toString(16).padStart(16, '0'));
      });
      result = getResult();
    };

    const readIncremental = (fd: number, hash: XXHash<bigint>) => {
      read(fd, buffer, 0, BUFFER_SIZE, -1, (readError, bytesRead) => {
        if (readError) {
          return close(fd, () => reject(readError));
        }
        if (bytesRead === BUFFER_SIZE) {
          hash.update(buffer);
          readIncremental(fd, hash);
        } else {
          hash.update(buffer.subarray(0, bytesRead));
          done(fd, () => hash.digest());
        }
      });
    };

    open(path, 'r', (openError, fd) => {
      if (openError) {
        return reject(openError);
      }
      read(fd, buffer, 0, BUFFER_SIZE, -1, (readError, bytesRead) => {
        if (readError) {
          return close(fd, () => reject(readError));
        }
        if (bytesRead < BUFFER_SIZE) {
          // Do a single hash if the whole file fits into the buffer.
          done(fd, () => xxhash.h64Raw(buffer.subarray(0, bytesRead)));
        } else {
          // Otherwise use incremental hashing.
          const hash = xxhash.create64();
          hash.update(buffer);
          readIncremental(fd, hash);
        }
      });
    });
  });
};

interface GetFileHashesInput {
  files: string[];
  /** Files to hash in parallel. Defaults to `CHROMATIC_HASH_CONCURRENCY` when omitted. */
  concurrency?: number;
  /** Joined onto each file. Omit (or leave empty) when `files` are already absolute paths. */
  directory?: string;
}

export const getFileHashes = async ({
  files,
  concurrency = getEnvironment().CHROMATIC_HASH_CONCURRENCY,
  directory = '',
}: GetFileHashesInput) => {
  // Limit the number of concurrent file reads and hashing operations.
  const limit = pLimit(concurrency);
  const xxhash = await xxHashWasm();

  const hashes = await Promise.all(
    files.map((file) =>
      limit(async () => {
        // Allocate the 64K read buffer (matching WASM memory page size) inside the limit, so peak
        // memory is bounded by `concurrency` rather than by the number of files.
        const buffer = Buffer.allocUnsafe(64 * 1024);
        const filePath = directory ? path.join(directory, file) : file;
        return [file, await hashFile(buffer, filePath, xxhash)] as const;
      })
    )
  );

  // Path -> hash mapping
  return Object.fromEntries(hashes);
};
