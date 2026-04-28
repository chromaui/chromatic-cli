import path from 'path';
import { PassThrough, Readable } from 'stream';

import {
  CreateWriteStreamOptions,
  FileStat,
  FileSystem,
  MkdirOptions,
  MkdtempOptions,
  MkstempOptions,
  RemoveOptions,
  TemporaryDirectory,
  TemporaryFile,
} from './fs';

/**
 * In-memory state backing {@link createInMemoryFileSystem}. Tests can pass a
 * pre-populated state object to seed files; callers receive the same object
 * back so they can inspect writes after the adapter has been used.
 */
export interface InMemoryFileSystemState {
  files: Map<string, Buffer>;
  directories: Set<string>;
  tempCounter: { value: number };
}

/**
 * Construct an empty in-memory state. Exposed so tests can seed paths before
 * passing the state to {@link createInMemoryFileSystem}.
 *
 * @returns A fresh {@link InMemoryFileSystemState} record.
 */
export function createInMemoryFileSystemState(): InMemoryFileSystemState {
  return {
    files: new Map(),
    directories: new Set(['/', '/tmp']),
    tempCounter: { value: 0 },
  };
}

function normalize(input: string): string {
  return path.normalize(input);
}

function ensureParents(state: InMemoryFileSystemState, target: string) {
  let current = path.dirname(target);
  while (current && current !== path.dirname(current)) {
    state.directories.add(current);
    current = path.dirname(current);
  }
}

function removeRecursive(state: InMemoryFileSystemState, key: string) {
  const prefix = key.endsWith(path.sep) ? key : key + path.sep;
  state.directories.delete(key);
  for (const directory of state.directories) {
    if (directory.startsWith(prefix)) state.directories.delete(directory);
  }
  for (const filePath of state.files.keys()) {
    if (filePath.startsWith(prefix)) state.files.delete(filePath);
  }
}

/**
 * Construct an in-memory {@link FileSystem} backed by a Map of file paths to
 * buffers. Useful in tests where the production node adapter would touch real
 * disk.
 *
 * @param state Optional pre-populated state. A fresh state is created when omitted.
 *
 * @returns A FileSystem whose reads and writes are confined to the supplied state.
 */
export function createInMemoryFileSystem(
  state: InMemoryFileSystemState = createInMemoryFileSystemState()
): FileSystem {
  function readBuffer(filePath: string): Buffer {
    const buffer = state.files.get(normalize(filePath));
    if (!buffer) {
      const err: NodeJS.ErrnoException = new Error(
        `ENOENT: no such file or directory, open '${filePath}'`
      );
      err.code = 'ENOENT';
      throw err;
    }
    return buffer;
  }

  return {
    async readFile(filePath: string, encoding?: BufferEncoding) {
      const buffer = readBuffer(filePath);
      return (encoding ? buffer.toString(encoding) : buffer) as any;
    },
    async readJson(filePath: string) {
      return JSON.parse(readBuffer(filePath).toString('utf8'));
    },
    async exists(targetPath: string) {
      const key = normalize(targetPath);
      return state.files.has(key) || state.directories.has(key);
    },
    async stat(targetPath: string): Promise<FileStat> {
      const key = normalize(targetPath);
      const buffer = state.files.get(key);
      if (buffer) {
        return { size: buffer.length, isFile: () => true, isDirectory: () => false };
      }
      if (state.directories.has(key)) {
        return { size: 0, isFile: () => false, isDirectory: () => true };
      }
      const err: NodeJS.ErrnoException = new Error(
        `ENOENT: no such file or directory, stat '${targetPath}'`
      );
      err.code = 'ENOENT';
      throw err;
    },
    async readDir(directoryPath: string) {
      const key = normalize(directoryPath);
      const prefix = key.endsWith(path.sep) ? key : key + path.sep;
      const seen = new Set<string>();
      for (const filePath of state.files.keys()) {
        if (filePath.startsWith(prefix)) {
          const relative = filePath.slice(prefix.length);
          const head = relative.split(path.sep)[0];
          if (head) seen.add(head);
        }
      }
      for (const directory of state.directories) {
        if (directory.startsWith(prefix)) {
          const relative = directory.slice(prefix.length);
          const head = relative.split(path.sep)[0];
          if (head) seen.add(head);
        }
      }
      return [...seen];
    },
    async writeFile(filePath: string, data: string | Buffer) {
      const key = normalize(filePath);
      const buffer = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
      ensureParents(state, key);
      state.files.set(key, buffer);
    },
    async mkdir(directoryPath: string, options: MkdirOptions = {}) {
      const key = normalize(directoryPath);
      if (options.recursive) {
        ensureParents(state, key + path.sep + '_');
      }
      state.directories.add(key);
    },
    async remove(targetPath: string, options: RemoveOptions = {}) {
      const key = normalize(targetPath);
      if (state.files.delete(key)) return;
      if (state.directories.has(key)) {
        if (!options.recursive) {
          throw Object.assign(new Error(`ENOTEMPTY: ${targetPath}`), { code: 'ENOTEMPTY' });
        }
        removeRecursive(state, key);
        return;
      }
      if (!options.force) {
        const err: NodeJS.ErrnoException = new Error(
          `ENOENT: no such file or directory, rm '${targetPath}'`
        );
        err.code = 'ENOENT';
        throw err;
      }
    },
    async copyFile(source: string, destination: string) {
      const buffer = readBuffer(source);
      ensureParents(state, normalize(destination));
      state.files.set(normalize(destination), Buffer.from(buffer));
    },
    async mkdtemp(options: MkdtempOptions = {}): Promise<TemporaryDirectory> {
      const id = ++state.tempCounter.value;
      const temporaryPath = path.join('/tmp', `${options.prefix ?? 'tmp-'}${id}`);
      state.directories.add(temporaryPath);
      return {
        path: temporaryPath,
        cleanup: async () => removeRecursive(state, temporaryPath),
      };
    },
    async mkstemp(options: MkstempOptions = {}): Promise<TemporaryFile> {
      const id = ++state.tempCounter.value;
      const baseDirectory = options.tmpdir ?? '/tmp';
      const fileName = options.name ?? `${options.prefix ?? 'tmp-'}${id}${options.postfix ?? ''}`;
      const temporaryPath = path.join(baseDirectory, fileName);
      state.directories.add(baseDirectory);
      state.files.set(normalize(temporaryPath), Buffer.alloc(0));
      return {
        path: temporaryPath,
        cleanup: async () => {
          state.files.delete(normalize(temporaryPath));
        },
      };
    },
    createReadStream(filePath: string) {
      return Readable.from(readBuffer(filePath));
    },
    createWriteStream(filePath: string, _options: CreateWriteStreamOptions = {}) {
      const key = normalize(filePath);
      const chunks: Buffer[] = [];
      const stream = new PassThrough();
      stream.on('data', (chunk: Buffer | string) => {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      });
      stream.on('finish', () => {
        ensureParents(state, key);
        state.files.set(key, Buffer.concat(chunks));
      });
      return stream;
    },
  };
}
