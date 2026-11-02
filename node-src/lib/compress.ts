import { createWriteStream } from 'fs';
import { rm } from 'fs/promises';
import { Readable } from 'stream';
import { file as temporaryFile } from 'tmp-promise';
import { ZipFile } from 'yazl';

import { Context, FileDesc } from '../types';

/**
 * Make a zip file with a list of files (usually used to zip build files to upload to Chromatic).
 *
 * @param ctx The context set when executing the CLI.
 * @param files The list of files to add to the zip.
 *
 * @returns A promise that resolves with details of the created zip.
 */
export default async function makeZipFile(ctx: Context, files: FileDesc[]) {
  const zipFile = new ZipFile();
  const temporary = await temporaryFile({ postfix: '.zip' });
  // Passing a fd will cause `createWriteStream` to ignore the path (first) argument
  const sink = createWriteStream('', { fd: temporary.fd });

  return new Promise<{ path: string; size: number }>((resolve, reject) => {
    // Reject first: destroying the sink emits 'close', which would otherwise resolve.
    // The partial zip is deleted by path because `sink.destroy()` already closes its descriptor.
    const fail = (err: Error) => {
      reject(err);
      (zipFile.outputStream as Readable).destroy();
      sink.destroy();
      rm(temporary.path, { force: true }).catch(() => {});
    };

    sink.on('close', () => {
      resolve({ path: temporary.path, size: sink.bytesWritten });
    });
    sink.on('error', fail);
    zipFile.on('error', fail);
    zipFile.outputStream.pipe(sink);

    try {
      // yazl opens each file only when its entry is written, so this doesn't hold a descriptor per file.
      for (const { localPath, targetPath } of files) {
        ctx.log.debug(`Adding to zip archive: ${targetPath}`);
        // `forceDosTimestamp` skips yazl's Unix timestamp field, which throws outside the zip's error
        // handling for files modified before 1970.
        zipFile.addFile(localPath, targetPath, { compressionLevel: 9, forceDosTimestamp: true });
      }

      ctx.log.debug('Finalizing zip archive');
      zipFile.end();
    } catch (err) {
      // yazl validates entry names synchronously, e.g. absolute paths or `..` segments.
      fail(err as Error);
    }
  });
}
