import * as turbosnap from '@cli/turbosnap';

import { isTurboSnapV1Enabled } from '../../lib/turbosnap/shouldTraceWithV1';
import { TurboSnapResult } from '../../lib/turbosnap/types';
import { groupUntracedFilesByGlob, rewriteErrorMessage } from '../../lib/utilities';
import { Context, Deps, HashBasedTurboSnap } from '../../types';
import hashBasedBailed from '../../ui/messages/warnings/hashBasedBailed';
import { bailed, hashBased, traced, tracing } from '../../ui/tasks/prepare';
import { testType } from '../../ui/tasks/utilities';

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
 * @returns An object with picomatch-escaped affected module IDs in `onlyStoryFiles`, or `{}` when
 * tracing is skipped, bails, or fails while TurboSnap v1 is disabled. An empty `onlyStoryFiles`
 * array means no stories are affected.
 *
 * @throws {Error} When TurboSnap v1 is enabled and stats loading or tracing fails. The error
 * message is prefixed with context about retrieving dependent files.
 */
export async function traceChangedFiles(
  deps: TraceChangedFilesDeps,
  input: TraceChangedFilesInput
): Promise<TraceChangedFilesOutput> {
  const ctx = input.turboSnapContext;

  try {
    const result = await turbosnap.traceChangedFiles(ctx, {
      onTraceWithV1: () => deps.report(tracing({ git: ctx.git, options: deps.options })),
    });
    const output = applyTraceResult(ctx, result);

    // When the Index applies TurboSnap 2.0 it ignores the 1.0 result, so report 2.0's decision
    // instead of 1.0's. The 1.0 story files are still sent along with the build.
    if (result.hashBased) {
      reportHashBased(deps, result.hashBased);
    } else {
      reportTraceResult(deps, result, output.onlyStoryFiles);
    }
    return output;
  } catch (err) {
    // The lib still collects hashes when TurboSnap v1 is disabled, and that build must stay
    // silent and must never fail because of it.
    if (!isTurboSnapV1Enabled(ctx)) {
      return {};
    }

    if (!deps.options.interactive) {
      const { statsPath } = ctx.fileInfo ?? {};
      const { changedFiles } = ctx.git;
      deps.log.info(`Failed to retrieve dependent ${testType(deps)} files`, {
        statsPath,
        changedFiles,
        err,
      });
    }
    throw rewriteErrorMessage(
      err,
      `Could not retrieve dependent ${testType(deps)} files.\n${err.message}`
    );
  }
}

// Writes the trace results onto the context and returns the picomatch-escaped affected story files.
function applyTraceResult(ctx: Context, result: TurboSnapResult): TraceChangedFilesOutput {
  if (result.hashBased) {
    ctx.hashBasedTurboSnap = result.hashBased;
  }
  if (result.status === 'skipped') {
    return {};
  }

  ctx.turboSnap = result.turboSnap;
  if (result.status === 'bailed') {
    return {};
  }

  ctx.untracedFiles = result.untracedFiles;
  if (result.changedDependencyNames) {
    ctx.git.changedDependencyNames = result.changedDependencyNames;
  }

  // Escape special characters in the filename so it does not conflict with picomatch
  const onlyStoryFiles = Object.keys(result.onlyStoryFiles).map((key) =>
    key.replaceAll(SPECIAL_CHARS_REGEXP, String.raw`\$1`)
  );
  return { onlyStoryFiles };
}

function reportTraceResult(
  deps: TraceChangedFilesDeps,
  result: TurboSnapResult,
  onlyStoryFiles: TraceChangedFilesOutput['onlyStoryFiles']
) {
  if (result.status === 'bailed') {
    deps.report(bailed({ turboSnap: result.turboSnap }));
  }
  if (result.status !== 'traced') {
    return;
  }

  if (!deps.options.interactive) {
    if (!deps.options.traceChanged) {
      deps.log.info(
        `Found affected ${testType(deps)} files:\n${Object.entries(result.onlyStoryFiles)
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
  deps.report(traced({ options: deps.options, onlyStoryFiles }));
}

function reportHashBased(deps: TraceChangedFilesDeps, hashBasedTurboSnap: HashBasedTurboSnap) {
  deps.report(hashBased({ options: deps.options, hashBasedTurboSnap }));
  if (hashBasedTurboSnap.bailed) {
    deps.log.warn(hashBasedBailed({ hashBasedTurboSnap }));
  }
}
