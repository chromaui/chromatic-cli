import { TurboSnap, UntracedFile } from '../../types';

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
