import { stat, writeFileSync } from 'fs';
import { basename } from 'path';
import { withFile } from 'tmp-promise';

import { STORYBOOK_BUILD_LOG_FILE } from '../tasks/build';
import { Context, FileDesc } from '../types';
import getMetadataHtml from '../ui/content/metadata.html';
import { findStorybookMainConfig } from './getStorybookMetadata';
import { CHROMATIC_LOG_FILE } from './log';
import { uploadAsIndividualFiles } from './upload';
import { CHROMATIC_DIAGNOSTICS_FILE } from './writeChromaticDiagnostics';

const fileSize = (path: string): Promise<number> =>
  new Promise((resolve) => stat(path, (err, stats) => resolve(err ? 0 : stats.size)));

export async function uploadMetadataFiles(ctx: Context) {
  if (!ctx.announcedBuild) {
    ctx.log.warn('No build announced, skipping metadata upload.');
    return;
  }

  const metadataFiles = [
    CHROMATIC_DIAGNOSTICS_FILE,
    CHROMATIC_LOG_FILE,
    STORYBOOK_BUILD_LOG_FILE,
    await findStorybookMainConfig(ctx).catch(() => null),
    ctx.fileInfo?.statsPath,
  ].filter(Boolean);

  const files = await Promise.all<FileDesc>(
    metadataFiles.map(async (localPath) => {
      const targetPath = `.chromatic/${basename(localPath)}`;
      const contentLength = await fileSize(localPath);
      return contentLength && { localPath, targetPath, contentLength };
    })
  ).then((files) => files.filter(Boolean));

  await withFile(async ({ path }) => {
    const html = getMetadataHtml(ctx, files);
    writeFileSync(path, html);
    files.push({
      localPath: path,
      targetPath: '.chromatic/index.html',
      contentLength: html.length,
    });

    ctx.log.info('Uploading metadata files: \n- ' + files.map((f) => f.targetPath).join('\n- '));

    await uploadAsIndividualFiles(ctx, files);
  });
}
