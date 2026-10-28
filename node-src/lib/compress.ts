import { createWriteStream } from 'fs';
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
    sink.on('close', () => {
      resolve({ path: temporary.path, size: sink.bytesWritten });
    });
    sink.on('error', reject);
    zipFile.on('error', (err) => {
      sink.destroy();
      reject(err);
    });
    zipFile.outputStream.pipe(sink);

    // yazl opens each file only when its entry is written, so this doesn't hold a descriptor per file.
    for (const { localPath, targetPath } of files) {
      ctx.log.debug(`Adding to zip archive: ${targetPath}`);
      zipFile.addFile(localPath, targetPath, { compressionLevel: 9 });
    }

    ctx.log.debug('Finalizing zip archive');
    zipFile.end();
  });
}
