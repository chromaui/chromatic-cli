import { close, open, read } from 'fs';
import pLimit from 'p-limit';
import { join } from 'path';
import xxHashWasm, { XXHash, XXHashAPI } from 'xxhash-wasm';

const hashFile = (buffer: Buffer, path: string, xxhash: XXHashAPI): Promise<string> => {
  const BUFFER_SIZE = buffer.length;

  return new Promise((resolve, reject) => {
    const done = (fd: number, getResult: () => bigint) => {
      let result: bigint = undefined;
      close(fd, (closeErr) => {
        if (closeErr) reject(closeErr);
        else resolve(result.toString(16).padStart(16, '0'));
      });
      result = getResult();
    };

    const readIncremental = (fd: number, hash: XXHash<bigint>) => {
      read(fd, buffer, null, BUFFER_SIZE, -1, (readErr, bytesRead) => {
        if (readErr) {
          return close(fd, () => reject(readErr));
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

    open(path, 'r', (openErr, fd) => {
      if (openErr) {
        return reject(openErr);
      }
      read(fd, buffer, null, BUFFER_SIZE, -1, (readErr, bytesRead) => {
        if (readErr) {
          return close(fd, () => reject(readErr));
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

export const getFileHashes = async (files: string[], dir = process.cwd()) => {
  const limit = pLimit(48);

  // Pre-allocate a 64K buffer for each file, matching WASM memory page size.
  const buffers = files.map((file) => [Buffer.allocUnsafe(64 * 1024), file] as const);

  const api = await xxHashWasm();
  const hashes = await Promise.all(
    buffers.map(([buffer, file]) =>
      limit(async () => [file, await hashFile(buffer, join(dir, file), api)] as const)
    )
  );

  // Path -> hash mapping
  return Object.fromEntries(hashes);
};
