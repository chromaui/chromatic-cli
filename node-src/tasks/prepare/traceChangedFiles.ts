import type { Deps, FileInfo } from '../../types';

// These are the special characters that need to be escaped in the filename
// because they are used as special characters in picomatch
const SPECIAL_CHARS_REGEXP = /([$()*+?[\]^])/g;

type TraceChangedFilesDeps = Pick<Deps, 'log' | 'options'>;

export interface TraceChangedFilesInput {
  untracedFiles: string[] | undefined;
  transitionToTracing: () => void;
  transitionToTraced: () => void;
  transitionToBailed: () => void;
  statsPath: FileInfo['statsPath'];
  runInnerTrace: (
    statsPath: FileInfo['statsPath']
  ) => Promise<Record<string, string[]> | undefined>;
}

/**
 * Runs the TurboSnap inner trace and reports affected story files.
 *
 * @param deps - The CLI dependencies containing logging and options
 * @param input - The input containing trace callbacks and untraced file metadata
 *
 * @returns Escaped affected story file paths, or undefined if
 *   the inner trace bailed (no affected files identified).
 */
export async function traceChangedFiles(
  deps: TraceChangedFilesDeps,
  input: TraceChangedFilesInput
): Promise<string[] | undefined> {
  input.transitionToTracing();

  const innerResult = await input.runInnerTrace(input.statsPath);
  if (!innerResult) {
    input.transitionToBailed();
    return;
  }

  // Escape special characters in the filename so it does not conflict with picomatch
  const onlyStoryFiles = Object.keys(innerResult).map((key) =>
    key.replaceAll(SPECIAL_CHARS_REGEXP, String.raw`\$1`)
  );

  if (!deps.options.interactive) {
    if (!deps.options.traceChanged) {
      deps.log.info(
        `Found affected story files:\n${Object.entries(innerResult)
          .flatMap(([id, files]) => files.map((f) => `  ${f} [${id}]`))
          .join('\n')}`
      );
    }
    if (input.untracedFiles && input.untracedFiles.length > 0) {
      deps.log.info(
        `Encountered ${input.untracedFiles.length} untraced files:\n${input.untracedFiles
          .map((f) => `  ${f}`)
          .join('\n')}`
      );
    }
  }
  input.transitionToTraced();
  return onlyStoryFiles;
}
