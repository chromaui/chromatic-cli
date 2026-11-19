import { Context, TurboSnap, TurboSnapOutcome, UntracedFile } from '../../../types';

/** What TurboSnap 1.0 reads to trace changed files. */
export type TurboSnapV1Input = Pick<
  Context,
  'log' | 'options' | 'env' | 'git' | 'storybook' | 'turboSnap'
>;

/** What the TurboSnap dispatcher reads to run both generations. */
export interface TurboSnapInput extends TurboSnapV1Input, Pick<Context, 'client'> {
  /** Unset when sharing a Storybook, which announces no build to attach hashes to. */
  buildId?: string;
  sourceDir: string;
  statsPath?: string;
}

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
 * The TurboSnap dispatcher's result: the 1.0 trace result, plus which TurboSnap decides the build.
 * When the Index applies 2.0, the 1.0 result doesn't decide what is captured.
 */
export type TurboSnapResult = TraceChangedFilesResult & { outcome: TurboSnapOutcome };
