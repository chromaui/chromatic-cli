import archiver from 'archiver';
import { createReadStream, createWriteStream } from 'fs';
import { file as tempFile } from 'tmp-promise';

import { Context, FileDesc } from '../types';

export default async function makeZipFile(ctx: Context, files: FileDesc[]) {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const tmp = await tempFile({ postfix: '.zip' });
  const sink = createWriteStream(null, { fd: tmp.fd });

  return new Promise<{ path: string; size: number }>((resolve, reject) => {
    sink.on('close', () => {
      resolve({ path: tmp.path, size: archive.pointer() });
    });

    // 'warning' messages contain non-blocking errors
    archive.on('warning', (err) => {
      ctx.log.debug({ err }, 'Received warning when creating zip file');
    });
    archive.on('error', (err) => {
      reject(err);
    });
    archive.pipe(sink);

    files.forEach(({ localPath, targetPath: name }) => {
      ctx.log.debug({ name }, 'Adding file to zip archive');
      archive.append(createReadStream(localPath), { name });
    });

    ctx.log.debug('Finalizing zip archive');
    archive.finalize();
  });
}
