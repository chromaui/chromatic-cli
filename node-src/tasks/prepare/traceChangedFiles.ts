import * as turbosnap from '@cli/turbosnap';

import { groupUntracedFilesByGlob, rewriteErrorMessage } from '../../lib/utilities';
import { Context, Deps } from '../../types';
import { bailed, traced, tracing } from '../../ui/tasks/prepare';

// These are the special characters that need to be escaped in the filename
// because they are used as special characters in picomatch
const SPECIAL_CHARS_REGEXP = /([$()*+?[\]^])/g;
type TraceChangedFilesDeps = Pick<Deps, 'log' | 'options' | 'report'>;

export interface TraceChangedFilesInput {
  // The TurboSnap lib still reads `Context` (options, git, log), but no longer mutates it; this
  // function is the single place trace results get written back onto the context.
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
 * @param input - The CLI context the TurboSnap lib reads; trace results are written back to it.
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

  deps.report(tracing({ git: ctx.git, options: deps.options }));

  try {
    const result = await turbosnap.traceChangedFiles(ctx);
    if (result.status === 'skipped') {
      return {};
    }

    ctx.turboSnap = result.turboSnap;

    if (result.status === 'bailed') {
      deps.report(bailed({ turboSnap: result.turboSnap }));
      return {};
    }

    ctx.untracedFiles = result.untracedFiles;
    if (result.changedDependencyNames) {
      ctx.git.changedDependencyNames = result.changedDependencyNames;
    }

    // Escape special characters in the filename so it does not conflict with picomatch
    const escaped = Object.keys(result.onlyStoryFiles).map((key) =>
      key.replaceAll(SPECIAL_CHARS_REGEXP, String.raw`\$1`)
    );

    if (!deps.options.interactive) {
      if (!deps.options.traceChanged) {
        deps.log.info(
          `Found affected story files:\n${Object.entries(result.onlyStoryFiles)
            .flatMap(([id, files]) => files.map((f) => `  ${f} [${id}]`))
            .join('\n')}`
        );
      }
      if (result.untracedFiles.length > 0) {
        deps.log.info(
          `Encountered ${result.untracedFiles.length} untraced files:\n${groupUntracedFilesByGlob(
            result.untracedFiles
          )}`
        );
      }
    }
    deps.report(traced({ options: deps.options, onlyStoryFiles: escaped }));
    return { onlyStoryFiles: escaped };
  } catch (err) {
    if (!deps.options.interactive) {
      const { statsPath } = ctx.fileInfo ?? {};
      const { changedFiles } = ctx.git;
      deps.log.info('Failed to retrieve dependent story files', { statsPath, changedFiles, err });
    }
    throw rewriteErrorMessage(err, `Could not retrieve dependent story files.\n${err.message}`);
  }
}
