import * as turbosnap from '@cli/turbosnap';
import semver from 'semver';

import { groupUntracedFilesByGlob, rewriteErrorMessage } from '../../lib/utilities';
import { Context, Deps } from '../../types';
import missingStatsFile from '../../ui/messages/errors/missingStatsFile';
import { bailed, traced, tracing } from '../../ui/tasks/prepare';

// These are the special characters that need to be escaped in the filename
// because they are used as special characters in picomatch
const SPECIAL_CHARS_REGEXP = /([$()*+?[\]^])/g;
type TraceChangedFilesDeps = Pick<Deps, 'log' | 'options' | 'report'>;

export interface TraceChangedFilesInput {
  // The TurboSnap lib still reads and mutates `Context` directly. This is a deliberate escape hatch,
  // as refactoring the whole `lib/turbosnap` tree to `(deps, input)` is a large lift. We should
  // revisit it, but for now `lib/turbosnap.traceChangedFiles` still takes a Context.
  turboSnapContext: Context;
}

export interface TraceChangedFilesOutput {
  onlyStoryFiles?: string[];
}

/**
 * Traces which story files are affected by recent changes using TurboSnap.
 * Analyzes changed files to determine which stories need to be tested.
 *
 * @param deps - Logger, options, and the mid-task reporter.
 * @param input - The CLI context the TurboSnap lib reads and mutates.
 *
 * @returns The affected story files, or none when TurboSnap is unavailable or bailed.
 *
 * @throws {Error} if stats file is missing or tracing fails
 */
// TODO: refactor this function
// eslint-disable-next-line complexity
export async function traceChangedFiles(
  deps: TraceChangedFilesDeps,
  input: TraceChangedFilesInput
): Promise<TraceChangedFilesOutput> {
  const ctx = input.turboSnapContext;

  if (!ctx.turboSnap || ctx.turboSnap.unavailable) return {};
  if (!ctx.git.changedFiles) return {};
  if (!ctx.fileInfo?.statsPath) {
    // If we don't know the SB version, we should assume we don't support `--stats-json`
    const nonLegacyStatsSupported =
      ctx.storybook?.version &&
      semver.gte(semver.coerce(ctx.storybook.version) || '0.0.0', '8.0.0');

    ctx.turboSnap.bailReason = { missingStatsFile: true };
    throw new Error(missingStatsFile({ legacy: !nonLegacyStatsSupported }));
  }

  deps.report(tracing({ git: ctx.git, options: deps.options }));

  const { statsPath } = ctx.fileInfo;
  const { changedFiles } = ctx.git;

  try {
    const onlyStoryFiles = await turbosnap.traceChangedFiles(ctx);
    if (onlyStoryFiles) {
      // Escape special characters in the filename so it does not conflict with picomatch
      const escaped = Object.keys(onlyStoryFiles).map((key) =>
        key.replaceAll(SPECIAL_CHARS_REGEXP, String.raw`\$1`)
      );

      if (!deps.options.interactive) {
        if (!deps.options.traceChanged) {
          deps.log.info(
            `Found affected story files:\n${Object.entries(onlyStoryFiles)
              .flatMap(([id, files]) => files.map((f) => `  ${f} [${id}]`))
              .join('\n')}`
          );
        }
        if (ctx.untracedFiles && ctx.untracedFiles.length > 0) {
          deps.log.info(
            `Encountered ${ctx.untracedFiles.length} untraced files:\n${groupUntracedFilesByGlob(
              ctx.untracedFiles
            )}`
          );
        }
      }
      deps.report(traced({ options: deps.options, onlyStoryFiles: escaped }));
      return { onlyStoryFiles: escaped };
    }

    deps.report(bailed({ turboSnap: ctx.turboSnap }));
    return {};
  } catch (err) {
    if (!deps.options.interactive) {
      deps.log.info('Failed to retrieve dependent story files', { statsPath, changedFiles, err });
    }
    throw rewriteErrorMessage(err, `Could not retrieve dependent story files.\n${err.message}`);
  }
}
