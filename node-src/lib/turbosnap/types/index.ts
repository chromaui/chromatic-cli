import { HashBasedTurboSnap, TurboSnap, UntracedFile } from '../../../types';

export type TraceChangedFilesResult =
  | { status: 'skipped' } // turboSnap unavailable / no changed files from `git diff`
  | {
      status: 'bailed';
      turboSnap: TurboSnap;
    }
  | {
      status: 'traced';
      onlyStoryFiles: Record<string, string[]>;
      turboSnap: TurboSnap;
      changedDependencyNames?: string[];
      untracedFiles: UntracedFile[];
    };

/**
 * The TurboSnap dispatcher's result: the 1.0 trace result, plus the Index's TurboSnap 2.0 decision
 * when it applies 2.0, in which case the 1.0 result doesn't decide what is captured.
 */
export type TurboSnapResult = TraceChangedFilesResult & { hashBased?: HashBasedTurboSnap };
