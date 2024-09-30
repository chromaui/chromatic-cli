import { close, open, read } from 'fs';
import pLimit from 'p-limit';
import path from 'path';
import xxHashWasm, { XXHash, XXHashAPI } from 'xxhash-wasm';

const hashFile = (buffer: Buffer, path: string, xxhash: XXHashAPI): Promise<string> => {
  const BUFFER_SIZE = buffer.length;

  // This uses callback-style fs functions because it runs faster than with their promise-based counterparts.
  return new Promise((resolve, reject) => {
    const done = (fd: number, getResult: () => bigint) => {
      let result: bigint = undefined;
      close(fd, (closeError) => {
        if (closeError) reject(closeError);
        else resolve(result.toString(16).padStart(16, '0'));
      });
      result = getResult();
    };

    const readIncremental = (fd: number, hash: XXHash<bigint>) => {
      read(fd, buffer, undefined, BUFFER_SIZE, -1, (readError, bytesRead) => {
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
      read(fd, buffer, undefined, BUFFER_SIZE, -1, (readError, bytesRead) => {
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

export const getFileHashes = async (files: string[], directory: string, concurrency: number) => {
  // Limit the number of concurrent file reads and hashing operations.
  const limit = pLimit(concurrency);
  const xxhash = await xxHashWasm();

  // Pre-allocate a 64K buffer for each file, matching WASM memory page size.
  const buffers = files.map((file) => [Buffer.allocUnsafe(64 * 1024), file] as const);

  const hashes = await Promise.all(
    buffers.map(([buffer, file]) =>
      limit(async () => [file, await hashFile(buffer, path.join(directory, file), xxhash)] as const)
    )
  );

  // Path -> hash mapping
  return Object.fromEntries(hashes);
};
