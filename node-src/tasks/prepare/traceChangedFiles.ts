import * as turbosnap from '@cli/turbosnap';

import { isTurboSnapV1Enabled } from '../../lib/turbosnap/shouldTraceWithV1';
import { TurboSnapInput, TurboSnapResult } from '../../lib/turbosnap/types';
import { groupUntracedFilesByGlob, rewriteErrorMessage } from '../../lib/utilities';
import { Deps, HashBasedTurboSnap, TurboSnap, TurboSnapOutcome, UntracedFile } from '../../types';
import turboSnapDryRun from '../../ui/messages/info/turboSnapDryRun';
import hashBasedBailed from '../../ui/messages/warnings/hashBasedBailed';
import { bailed, hashBased, traced, tracing } from '../../ui/tasks/prepare';
import { testType } from '../../ui/tasks/utilities';

// These are the special characters that need to be escaped in the filename
// because they are used as special characters in picomatch
const SPECIAL_CHARS_REGEXP = /([$()*+?[\]^])/g;
type TraceChangedFilesDeps = Pick<Deps, 'log' | 'options' | 'env' | 'client' | 'report'>;

export type TraceChangedFilesInput = Omit<TurboSnapInput, keyof TraceChangedFilesDeps>;

export interface TraceChangedFilesOutput {
  turboSnapOutcome: TurboSnapOutcome;
  turboSnap?: TurboSnap;
  onlyStoryFiles?: string[];
  untracedFiles?: UntracedFile[];
  changedDependencyNames?: string[];
}

/**
 * Traces which story files are affected by recent changes using TurboSnap.
 * Analyzes changed files to determine which stories need to be tested.
 *
 * @param deps - Logger, options, environment, GraphQL client, and the mid-task reporter.
 * @param input - The build, its stats file, and the git and Storybook state TurboSnap reads.
 *
 * @returns Which TurboSnap decides the build and the 1.0 trace results. `onlyStoryFiles` holds
 * picomatch-escaped affected module IDs, and is unset when tracing is skipped, bails, or fails while
 * TurboSnap v1 is disabled. An empty `onlyStoryFiles` array means no stories are affected.
 *
 * @throws {Error} When TurboSnap v1 is enabled and stats loading or tracing fails. The error
 * message is prefixed with context about retrieving dependent files.
 */
export async function traceChangedFiles(
  deps: TraceChangedFilesDeps,
  input: TraceChangedFilesInput
): Promise<TraceChangedFilesOutput> {
  const { log, options, env, client } = deps;

  try {
    const result = await turbosnap.traceChangedFiles(
      { ...input, log, options, env, client },
      { onTraceWithV1: () => deps.report(tracing({ git: input.git, options })) }
    );
    const output = toOutput(result);

    // When the Index applies TurboSnap 2.0 it ignores the 1.0 result, so report 2.0's decision
    // instead of 1.0's. The 1.0 story files are still sent along with the build.
    if (result.outcome.mechanism === 'v2') {
      reportHashBased(deps, result.outcome);
    } else {
      reportTraceResult(deps, result, output.onlyStoryFiles);
    }
    return output;
  } catch (err) {
    // The lib still collects hashes when TurboSnap v1 is disabled, and that build must stay
    // silent and must never fail because of it.
    if (!isTurboSnapV1Enabled(input)) {
      return { turboSnapOutcome: { mechanism: 'none' } };
    }

    if (!options.interactive) {
      const { statsPath } = input;
      const { changedFiles } = input.git;
      log.info(`Failed to retrieve dependent ${testType(deps)} files`, {
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

// Picks the trace results the build keeps and picomatch-escapes the affected story files.
function toOutput(result: TurboSnapResult): TraceChangedFilesOutput {
  const turboSnapOutcome = result.outcome;
  if (result.status === 'skipped') {
    return { turboSnapOutcome };
  }
  if (result.status === 'bailed') {
    return { turboSnapOutcome, turboSnap: result.turboSnap };
  }

  // Escape special characters in the filename so it does not conflict with picomatch
  const onlyStoryFiles = Object.keys(result.onlyStoryFiles).map((key) =>
    key.replaceAll(SPECIAL_CHARS_REGEXP, String.raw`\$1`)
  );
  return {
    turboSnapOutcome,
    turboSnap: result.turboSnap,
    onlyStoryFiles,
    untracedFiles: result.untracedFiles,
    changedDependencyNames: result.changedDependencyNames,
  };
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
        `Found potentially affected ${testType(deps)} files:\n${Object.entries(
          result.onlyStoryFiles
        )
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
  // A dry run skips verify, which prints the TurboSnap summary on a real build.
  if (deps.options.dryRun) {
    deps.log.info(turboSnapDryRun({ options: deps.options, onlyStoryFiles }));
  }
}

function reportHashBased(deps: TraceChangedFilesDeps, hashBasedTurboSnap: HashBasedTurboSnap) {
  deps.report(hashBased({ options: deps.options, hashBasedTurboSnap }));
  if (hashBasedTurboSnap.bailed) {
    deps.log.warn(hashBasedBailed({ hashBasedTurboSnap }));
  } else if (deps.options.dryRun) {
    deps.log.info(turboSnapDryRun({ options: deps.options, hashBased: true }));
  }
}
