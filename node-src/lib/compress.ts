import archiver from 'archiver';
import { createReadStream, createWriteStream } from 'fs';
import { file as temporaryFile } from 'tmp-promise';

import { Context, FileDesc } from '../types';

export default async function makeZipFile(ctx: Context, files: FileDesc[]) {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const temporary = await temporaryFile({ postfix: '.zip' });
  const sink = createWriteStream(undefined, { fd: temporary.fd });

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
