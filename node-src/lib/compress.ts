import archiver from 'archiver';
import { createReadStream, createWriteStream } from 'fs';
import { file as tempFile } from 'tmp-promise';
import { Context } from '../types';

export default async function makeZipFile(ctx: Context, fileInfo: { paths: string[] }) {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const tmp = await tempFile({ postfix: '.zip' });
  const sink = createWriteStream(null, { fd: tmp.fd });
  const { paths } = fileInfo;

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

    paths.forEach((path) => {
      ctx.log.debug({ path }, 'Adding file to zip archive');
      archive.append(createReadStream(path), { name: path });
    });

    ctx.log.debug('Finalizing zip archive');
    archive.finalize();
  });
}
