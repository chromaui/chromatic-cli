import * as turbosnap from '@cli/turbosnap';
import semver from 'semver';

import { getFileHashes } from '../../lib/getFileHashes';
import { createTask, transitionTo } from '../../lib/tasks';
import { rewriteErrorMessage } from '../../lib/utilities';
import { Context, Task } from '../../types';
import missingStatsFile from '../../ui/messages/errors/missingStatsFile';
import {
  bailed,
  hashing,
  initial,
  invalid,
  success,
  traced,
  tracing,
  validating,
} from '../../ui/tasks/prepare';
import { validateAndroidArtifact } from './validateAndroidArtifact';
import { validateFiles } from './validateFiles';

// These are the special characters that need to be escaped in the filename
// because they are used as special characters in picomatch
const SPECIAL_CHARS_REGEXP = /([$()*+?[\]^])/g;

/**
 * Traces which story files are affected by recent changes using TurboSnap.
 * Analyzes changed files to determine which stories need to be tested.
 *
 * @param ctx - The CLI context containing git info and TurboSnap configuration
 * @param task - The current Listr task for UI updates
 *
 * @throws {Error} if stats file is missing or tracing fails
 */
// TODO: refactor this function
// eslint-disable-next-line complexity
export async function traceChangedFiles(ctx: Context, task: Task) {
  if (!ctx.turboSnap || ctx.turboSnap.unavailable) return;
  if (!ctx.git.changedFiles) return;
  if (!ctx.fileInfo?.statsPath) {
    // If we don't know the SB version, we should assume we don't support `--stats-json`
    const nonLegacyStatsSupported =
      ctx.storybook?.version &&
      semver.gte(semver.coerce(ctx.storybook.version) || '0.0.0', '8.0.0');

    ctx.turboSnap.bailReason = { missingStatsFile: true };
    throw new Error(missingStatsFile({ legacy: !nonLegacyStatsSupported }));
  }

  transitionTo(tracing)(ctx, task);

  const { statsPath } = ctx.fileInfo;
  const { changedFiles } = ctx.git;

  try {
    const onlyStoryFiles = await turbosnap.traceChangedFiles(ctx);
    if (onlyStoryFiles) {
      // Escape special characters in the filename so it does not conflict with picomatch
      ctx.onlyStoryFiles = Object.keys(onlyStoryFiles).map((key) =>
        key.replaceAll(SPECIAL_CHARS_REGEXP, String.raw`\$1`)
      );

      if (!ctx.options.interactive) {
        if (!ctx.options.traceChanged) {
          ctx.log.info(
            `Found affected story files:\n${Object.entries(onlyStoryFiles)
              .flatMap(([id, files]) => files.map((f) => `  ${f} [${id}]`))
              .join('\n')}`
          );
        }
        if (ctx.untracedFiles && ctx.untracedFiles.length > 0) {
          ctx.log.info(
            `Encountered ${ctx.untracedFiles.length} untraced files:\n${ctx.untracedFiles
              .map((f) => `  ${f}`)
              .join('\n')}`
          );
        }
      }
      transitionTo(traced)(ctx, task);
    } else {
      transitionTo(bailed)(ctx, task);
    }
  } catch (err) {
    if (!ctx.options.interactive) {
      ctx.log.info('Failed to retrieve dependent story files', { statsPath, changedFiles, err });
    }
    throw rewriteErrorMessage(err, `Could not retrieve dependent story files.\n${err.message}`);
  }
}

/**
 * Calculates file hashes for all files to be uploaded.
 * File hashes are used for deduplication and integrity checking during upload.
 * Skips calculation if file hashing is disabled or the task is being skipped.
 *
 * @param ctx - The CLI context containing file info and options
 * @param task - The current Listr task for UI updates
 */
export async function calculateFileHashes(ctx: Context, task: Task) {
  if (ctx.skip || !ctx.options.fileHashing) return;
  transitionTo(hashing)(ctx, task);

  try {
    if (!ctx.fileInfo) {
      throw new Error(invalid(ctx).output);
    }

    const start = Date.now();
    ctx.fileInfo.hashes = await getFileHashes(
      ctx.fileInfo.paths,
      ctx.sourceDir,
      ctx.env.CHROMATIC_HASH_CONCURRENCY
    );
    ctx.log.debug(`Calculated file hashes in ${Date.now() - start}ms`);
  } catch (err) {
    ctx.log.warn('Failed to calculate file hashes');
    ctx.log.debug(err);
  }
}

/**
 * Sets up the Listr task for preparing the built storybook for upload to Chromatic.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns A Listr task.
 */
export default function main(ctx: Context) {
  return createTask({
    name: 'prepare',
    title: initial(ctx).title,
    skip: (ctx: Context) => {
      return !!ctx.skip;
    },
    steps: [
      transitionTo(validating),
      validateFiles,
      validateAndroidArtifact,
      traceChangedFiles,
      calculateFileHashes,
      transitionTo(success, true),
    ],
  });
}
