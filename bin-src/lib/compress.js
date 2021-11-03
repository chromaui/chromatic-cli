import archiver from 'archiver';
import fs from 'fs-extra';
import { join } from 'path';
import { file as tempFile } from 'tmp-promise';

export default async function makeZipFile(ctx) {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const tmp = await tempFile({ postfix: '.zip' });
  const sink = fs.createWriteStream(null, { fd: tmp.fd });
  const { paths } = ctx.fileInfo;

  return new Promise((resolve, _) => {
    sink.on('close', () => {
      resolve({ path: tmp.path, size: archive.pointer() });
    });
    archive.pipe(sink);
    paths.forEach((path) => {
      archive.append(fs.createReadStream(join(ctx.sourceDir, path)), { name: path });
    });
    archive.finalize();
  });
}
