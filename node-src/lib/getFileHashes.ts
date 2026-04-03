import { close, open, read } from 'fs';
import pLimit from 'p-limit';
import path from 'path';
import xxHashWasm, { XXHash, XXHashAPI } from 'xxhash-wasm';

const BUFFER_BYTE_LENGTH = 64 * 1024;

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

function createBufferPool(poolSize: number) {
  const pool: Buffer[] = Array.from({ length: poolSize }, () =>
    Buffer.allocUnsafe(BUFFER_BYTE_LENGTH)
  );
  const waitQueue: ((buffer: Buffer) => void)[] = [];

  const acquire = (): Promise<Buffer> => {
    const buffer = pool.pop();
    if (buffer !== undefined) {
      return Promise.resolve(buffer);
    }
    return new Promise<Buffer>((resolve) => {
      waitQueue.push(resolve);
    });
  };

  const release = (buffer: Buffer): void => {
    const resolveNext = waitQueue.shift();
    if (resolveNext) {
      resolveNext(buffer);
    } else {
      pool.push(buffer);
    }
  };

  return { acquire, release };
}

function effectiveConcurrency(requested: number): number {
  if (Number.isFinite(requested) && requested >= 1) {
    return Math.min(Math.max(Math.floor(requested), 1), 512);
  }
  return 48;
}

export const getFileHashes = async (files: string[], directory: string, concurrency: number) => {
  if (files.length === 0) {
    return {};
  }

  const concurrentHashes = effectiveConcurrency(concurrency);
  const limit = pLimit(concurrentHashes);
  const xxhash = await xxHashWasm();

  // Reuse a small pool of 64K buffers (one per in-flight hash) instead of pre-allocating one per
  // file, which peaked at O(files * 64KB) heap for large Storybook outputs.
  const poolSize = Math.min(concurrentHashes, files.length);
  const { acquire, release } = createBufferPool(poolSize);

  const hashes = await Promise.all(
    files.map((file) =>
      limit(async () => {
        const buffer = await acquire();
        try {
          return [file, await hashFile(buffer, path.join(directory, file), xxhash)] as const;
        } finally {
          release(buffer);
        }
      })
    )
  );

  return Object.fromEntries(hashes);
};
