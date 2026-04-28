import type { Context, Options, TaskName } from '../types';

/**
 * Resolved configuration consumed by {@link ChromaticRun}. For now this is a
 * direct alias over the historical resolved {@link Options} shape produced by
 * `getOptions`. A later refactor will tighten this to an explicit named-field
 * type with no `extraOptions` escape hatch.
 */
export type ChromaticConfig = Options;

/** Phase identifiers emitted on {@link RunEvent | RunEvents}. */
export type PhaseName = TaskName;

/**
 * A read-only projection of the build the run produced. This is the
 * forward-compatible subset of `ctx.build` callers actually consume; new
 * fields land here as named-only additions.
 */
export interface PublishedBuild {
  id?: string;
  number?: number;
  status?: string;
  webUrl?: string;
  storybookUrl?: string;
  specCount?: number;
  componentCount?: number;
  testCount?: number;
  changeCount?: number;
  errorCount?: number;
  interactionTestFailuresCount?: number;
  actualTestCount?: number;
  actualCaptureCount?: number;
  inheritedCaptureCount?: number;
}

export interface Diagnostic {
  message: string;
  level?: 'info' | 'warn' | 'error';
}

export type RunEvent =
  | { type: 'phase:start'; phase: PhaseName; title: string }
  | {
      type: 'phase:progress';
      phase: PhaseName;
      current: number;
      total: number;
      unit: string;
    }
  | { type: 'phase:end'; phase: PhaseName; durationMs: number; skipped: boolean }
  | { type: 'diagnostic'; diagnostic: Diagnostic }
  | { type: 'build:announced'; buildNumber: number; webUrl: string };

export interface RunDiagnostics {
  sessionId: string;
  durationMs: number;
  phasesRun: readonly PhaseName[];
  reportPath?: string;
}

export interface RunResult {
  exitCode: number;
  exitCodeKey: string;
  build?: PublishedBuild;
  storybookUrl?: string;
  errors: readonly Error[];
  warnings: readonly Error[];
  diagnostics: RunDiagnostics;
}

/**
 * Read-only escape hatch over the in-flight context. Required for the
 * transitional period while phases still write to a shared mutable record;
 * once each phase produces a typed slice this collapses to the slice product.
 */
export type RunState = Readonly<Context>;

/**
 * Output of the gitInfo phase. Consumed by every downstream phase that
 * reasons about the repository, baseline builds, or change-driven scoping.
 */
export interface GitState {
  version?: string;
  rootPath?: string;
  gitUserEmail?: string;
  branch: string;
  commit: string;
  committerEmail?: string;
  committedAt: number;
  slug?: string;
  fromCI: boolean;
  ciService?: string;
  mergeCommit?: string;
  uncommittedHash?: string;
  parentCommits?: string[];
  baselineCommits?: string[];
  changedFiles?: string[];
  replacementBuildIds?: [string, string][];
  /**
   * Branch glob matcher for resolving boolean/string flags (`--skip`,
   * `--only-changed`, etc.) against the resolved branch. Closure-captured;
   * not serializable.
   */
  matchesBranch?: (glob: boolean | string) => boolean;
  packageMetadataChanges?: { changedFiles: string[]; commit: string }[];
}

/** Repository-scoped metadata captured alongside {@link GitState}. */
export interface ProjectMetadata {
  hasRouter?: boolean;
  creationDate?: Date;
  storybookCreationDate?: Date;
  numberOfCommitters?: number;
  numberOfAppFiles?: number;
}
