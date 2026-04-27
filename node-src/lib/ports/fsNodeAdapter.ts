import { createReadStream, createWriteStream } from 'fs';
import fsp from 'fs/promises';
import { dir as temporaryDirectoryFactory, file as temporaryFileFactory } from 'tmp-promise';

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
 * Construct the production {@link FileSystem} backed by `fs.promises` and
 * `tmp-promise`.
 *
 * @returns A FileSystem that talks directly to the host disk.
 */
export function createNodeFileSystem(): FileSystem {
  return {
    readFile(filePath: string, encoding?: BufferEncoding) {
      return encoding ? fsp.readFile(filePath, encoding) : (fsp.readFile(filePath) as any);
    },
    async readJson(filePath: string) {
      const text = await fsp.readFile(filePath, 'utf8');
      return JSON.parse(text);
    },
    async exists(filePath: string) {
      try {
        await fsp.access(filePath);
        return true;
      } catch {
        return false;
      }
    },
    async stat(filePath: string): Promise<FileStat> {
      const result = await fsp.stat(filePath);
      return {
        size: result.size,
        isFile: () => result.isFile(),
        isDirectory: () => result.isDirectory(),
      };
    },
    async readDir(directoryPath: string) {
      return fsp.readdir(directoryPath);
    },
    async writeFile(filePath: string, data: string | Buffer) {
      await fsp.writeFile(filePath, data);
    },
    async mkdir(directoryPath: string, options: MkdirOptions = {}) {
      await fsp.mkdir(directoryPath, { recursive: options.recursive });
    },
    async remove(targetPath: string, options: RemoveOptions = {}) {
      await fsp.rm(targetPath, { recursive: options.recursive, force: options.force });
    },
    async copyFile(source: string, destination: string) {
      await fsp.copyFile(source, destination);
    },
    async mkdtemp(options: MkdtempOptions = {}): Promise<TemporaryDirectory> {
      const result = await temporaryDirectoryFactory({
        prefix: options.prefix,
        unsafeCleanup: options.unsafeCleanup,
      });
      return { path: result.path, cleanup: result.cleanup };
    },
    async mkstemp(options: MkstempOptions = {}): Promise<TemporaryFile> {
      const result = await temporaryFileFactory({
        prefix: options.prefix,
        postfix: options.postfix,
        name: options.name,
        tmpdir: options.tmpdir,
      });
      return { path: result.path, cleanup: result.cleanup };
    },
    createReadStream(filePath: string) {
      return createReadStream(filePath);
    },
    createWriteStream(filePath: string, options: CreateWriteStreamOptions = {}) {
      return createWriteStream(filePath, options);
    },
  };
}
