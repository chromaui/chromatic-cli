/** Lightweight stat facade returned by {@link FileSystem.stat}. */
export interface FileStat {
  /** Size of the file in bytes (0 for directories). */
  size: number;
  /** True when the path refers to a regular file. */
  isFile: () => boolean;
  /** True when the path refers to a directory. */
  isDirectory: () => boolean;
}

/** Handle to a temporary directory; caller must call {@link TemporaryDirectory.cleanup}. */
export interface TemporaryDirectory {
  path: string;
  cleanup: () => Promise<void>;
}

/** Handle to a temporary file; caller must call {@link TemporaryFile.cleanup}. */
export interface TemporaryFile {
  path: string;
  cleanup: () => Promise<void>;
}

/** Options accepted by {@link FileSystem.mkdtemp}. */
export interface MkdtempOptions {
  prefix?: string;
  /** When true, recursive removal is permitted on cleanup. */
  unsafeCleanup?: boolean;
}

/** Options accepted by {@link FileSystem.mkstemp}. */
export interface MkstempOptions {
  prefix?: string;
  postfix?: string;
  name?: string;
  tmpdir?: string;
}

/** Options accepted by {@link FileSystem.mkdir}. */
export interface MkdirOptions {
  recursive?: boolean;
}

/** Options accepted by {@link FileSystem.remove}. */
export interface RemoveOptions {
  recursive?: boolean;
  force?: boolean;
}

/** Options accepted by {@link FileSystem.createWriteStream}. */
export interface CreateWriteStreamOptions {
  flags?: string;
}

/**
 * Semantic boundary over filesystem and temp-file primitives. Production
 * callers use the node adapter; tests use the in-memory fake. Streams are
 * exposed for callers that interoperate with archiver/parser libraries.
 */
export interface FileSystem {
  /** Read a UTF-8 (or otherwise encoded) string from disk. */
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
  /** Read a binary buffer from disk. */
  readFile(path: string): Promise<Buffer>;
  /** Read and parse a JSON file. */
  readJson(path: string): Promise<unknown>;
  /** Resolve to true when the path exists. */
  exists(path: string): Promise<boolean>;
  /** Resolve a thin stat facade for the path. */
  stat(path: string): Promise<FileStat>;
  /** Enumerate basenames of a directory's entries. */
  readDir(path: string): Promise<string[]>;
  /** Write a string or buffer to a file, creating it if needed. */
  writeFile(path: string, data: string | Buffer): Promise<void>;
  /** Create a directory; pass `recursive: true` to mkdir parents. */
  mkdir(path: string, options?: MkdirOptions): Promise<void>;
  /** Remove a path; pass `recursive` and `force` for rm -rf semantics. */
  remove(path: string, options?: RemoveOptions): Promise<void>;
  /** Copy a single file. */
  copyFile(source: string, destination: string): Promise<void>;

  /** Create a temporary directory. Caller must invoke `cleanup`. */
  mkdtemp(options?: MkdtempOptions): Promise<TemporaryDirectory>;
  /** Create a temporary file. Caller must invoke `cleanup`. */
  mkstemp(options?: MkstempOptions): Promise<TemporaryFile>;

  /** Create a Node readable stream over the file at `path`. */
  createReadStream(path: string): import('stream').Readable;
  /** Create a Node writable stream over the file at `path`. */
  createWriteStream(path: string, options?: CreateWriteStreamOptions): import('stream').Writable;
}
