import * as Sentry from '@sentry/node';
import { stat, writeFileSync } from 'fs';
import path from 'path';
import { withFile } from 'tmp-promise';

import { trimStatsFile } from '../../bin-src/trimStatsFile';
import { HTTPClientError } from '../io/httpClient';
import { Context, FileDesc } from '../types';
import metadataHtml from '../ui/html/metadata.html';
import uploadingMetadata from '../ui/messages/info/uploadingMetadata';
import {
  findStorybookConfigFile,
  MAIN_CONFIG_PATTERN,
  PREVIEW_CONFIG_PATTERN,
} from './getStorybookMetadata';
import { getManifestPath } from './turbosnap/v2/manifest';
import { uploadMetadata } from './upload';

const MANIFEST_TARGET_PATH = '.chromatic/turbosnap-manifest.json';

const fileSize = (path: string): Promise<number> =>
  new Promise((resolve) => stat(path, (err, stats) => resolve(err ? 0 : stats.size)));

/**
 * Names how an upload failed without the file path or URL, so repeats group together.
 *
 * @param error The error `uploadFiles` rejected with, which holds the fetch error as its cause.
 *
 * @returns The HTTP status, the error code (such as `ECONNRESET`), or the error's name.
 */
function uploadErrorKind(error: unknown): string {
  const cause = error instanceof Error && error.cause !== undefined ? error.cause : error;
  if (cause instanceof HTTPClientError) return `HTTP ${cause.response.status}`;
  const { code, name } = (cause ?? {}) as { code?: unknown; name?: unknown };
  return [code, name].find((value) => typeof value === 'string') ?? 'unknown';
}

/**
 * Upload metadata files to Chromatic for debugging issues with Chromatic support.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns A promise that resolves when all metadata files are uploaded.
 */
export async function uploadMetadataFiles(ctx: Context) {
  if (!ctx.announcedBuild) {
    ctx.log.warn('No build announced, skipping metadata upload.');
    return;
  }

  try {
    return await withPausedLog(ctx, async () => {
      const metadataFiles = [
        ctx.options.logFile,
        ctx.options.diagnosticsFile,
        ctx.options.storybookLogFile,
        ctx.sourceDir && getManifestPath(ctx.sourceDir),
        await findStorybookConfigFile(ctx.options.storybookConfigDir, MAIN_CONFIG_PATTERN).catch(
          () => undefined
        ),
        await findStorybookConfigFile(ctx.options.storybookConfigDir, PREVIEW_CONFIG_PATTERN).catch(
          () => undefined
        ),
        ctx.fileInfo?.statsPath &&
          (await trimStatsFile(ctx.fileInfo.statsPath).catch((err) => {
            ctx.log.debug(`Failed to trim stats file: ${err}`);
            return undefined;
          })),
      ].filter((m): m is string => !!m);

      const unfilteredFiles = await Promise.all(
        metadataFiles.map(async (localPath) => {
          const contentLength = await fileSize(localPath);
          const targetPath = `.chromatic/${path.basename(localPath)}`;
          return contentLength && { contentLength, localPath, targetPath };
        })
      );
      const files = unfilteredFiles
        .filter((f): f is FileDesc => !!f)
        .sort((a, b) => a.targetPath.localeCompare(b.targetPath, 'en', { numeric: true }));

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

        const failures = await uploadMetadata(ctx, files);
        for (const { target, error } of failures) {
          ctx.log.debug(`Failed to upload metadata file ${target.targetPath}`, error);
          Sentry.captureException(error, {
            // The index will read the manifest from S3, so keep its failures in one issue per kind.
            ...(target.targetPath === MANIFEST_TARGET_PATH && {
              fingerprint: ['turbosnap-manifest-upload', uploadErrorKind(error)],
            }),
          });
        }
      });
    });
  } catch (err) {
    // Log the error but don't rethrow to fail upwards. This step is a best-effort stage and
    // shouldn't impact the build pipeline.
    ctx.log.debug('Failed to upload metadata files to Chromatic', err);
    Sentry.captureException(err);
  }
}

/**
 * Pauses the log file stream during a callback execution, ensuring it's always resumed.
 * This prevents writes to the log file during operations that require a stable file size,
 * such as uploading to S3 with file size limits.
 *
 * @param ctx The context set when executing the CLI.
 * @param callback The async function to execute while the log is paused.
 *
 * @returns A promise that resolves with the callback's return value.
 */
async function withPausedLog<T>(ctx: Context, callback: () => Promise<T>): Promise<T> {
  ctx.log.pause();

  try {
    return await callback();
  } finally {
    ctx.log.resume();
  }
}
