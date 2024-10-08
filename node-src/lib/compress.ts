import archiver from 'archiver';
import { createReadStream, createWriteStream } from 'fs';
import { file as temporaryFile } from 'tmp-promise';

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
  const archive = archiver('zip', { zlib: { level: 9 } });
  const temporary = await temporaryFile({ postfix: '.zip' });
  // Passing a fd will cause `createWriteStream` to ignore the path (first) argument
  const sink = createWriteStream('', { fd: temporary.fd });

  return new Promise<{ path: string; size: number }>((resolve, reject) => {
    sink.on('close', () => {
      resolve({ path: temporary.path, size: archive.pointer() });
    });

    // 'warning' messages contain non-blocking errors
    archive.on('warning', (err) => {
      ctx.log.debug({ err }, 'Received warning when creating zip file');
    });
    archive.on('error', (err) => {
      reject(err);
    });
    archive.pipe(sink);

    for (const { localPath, targetPath: name } of files) {
      ctx.log.debug(`Adding to zip archive: ${name}`);
      archive.append(createReadStream(localPath), { name });
    }

    ctx.log.debug('Finalizing zip archive');
    archive.finalize().catch((err) => reject(err));
  });
}
