import * as turbosnap from '@cli/turbosnap';
import semver from 'semver';

import { transitionTo } from '../../lib/tasks';
import { groupUntracedFilesByGlob, rewriteErrorMessage } from '../../lib/utilities';
import { Context, Task } from '../../types';
import missingStatsFile from '../../ui/messages/errors/missingStatsFile';
import { bailed, traced, tracing } from '../../ui/tasks/prepare';

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
            `Encountered ${ctx.untracedFiles.length} untraced files:\n${groupUntracedFilesByGlob(
              ctx.untracedFiles
            )}`
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
