import { HashBasedTurboSnap, TurboSnap, UntracedFile } from '../../../types';

export type TraceChangedFilesResult = (
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
    }
) & {
  // Set when the Index applies TurboSnap 2.0, so the 1.0 result above doesn't decide what is captured.
  hashBased?: HashBasedTurboSnap;
};
