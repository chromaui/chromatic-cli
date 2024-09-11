import { stat, writeFileSync } from 'fs';
import path from 'path';
import { withFile } from 'tmp-promise';

import { main as trimStatsFile } from '../../bin-src/trim-stats-file';
import { Context, FileDesc } from '../types';
import metadataHtml from '../ui/html/metadata.html';
import uploadingMetadata from '../ui/messages/info/uploadingMetadata';
import { findStorybookConfigFile } from './getStorybookMetadata';
import { uploadMetadata } from './upload';

const fileSize = (path: string): Promise<number> =>
  new Promise((resolve) => stat(path, (err, stats) => resolve(err ? 0 : stats.size)));

export async function uploadMetadataFiles(ctx: Context) {
  if (!ctx.announcedBuild) {
    ctx.log.warn('No build announced, skipping metadata upload.');
    return;
  }

  const metadataFiles = [
    ctx.options.logFile,
    ctx.options.diagnosticsFile,
    ctx.options.storybookLogFile,
    await findStorybookConfigFile(ctx, /^main\.[jt]sx?$/).catch(() => null),
    await findStorybookConfigFile(ctx, /^preview\.[jt]sx?$/).catch(() => null),
    ctx.fileInfo?.statsPath && (await trimStatsFile([ctx.fileInfo.statsPath])),
  ].filter(Boolean);

  const files = await Promise.all<FileDesc>(
    metadataFiles.map(async (localPath) => {
      const contentLength = await fileSize(localPath);
      const targetPath = `.chromatic/${path.basename(localPath)}`;
      return contentLength && { contentLength, localPath, targetPath };
    })
  ).then((files) =>
    files
      .filter(Boolean)
      .sort((a, b) => a.targetPath.localeCompare(b.targetPath, 'en', { numeric: true }))
  );

  if (files.length === 0) {
    ctx.log.warn('No metadata files found, skipping metadata upload.');
    return;
  }

  await withFile(async ({ path }) => {
    const html = metadataHtml(ctx, files);
    writeFileSync(path, html);
    files.push({
      contentLength: html.length,
      localPath: path,
      targetPath: '.chromatic/index.html',
    });

    const directoryUrl = `${ctx.build.storybookUrl}.chromatic/`;
    ctx.log.info(uploadingMetadata(directoryUrl, files));

    await uploadMetadata(ctx, files);
  });
}
