import type { Context, Flags, Options, TaskName, TurboSnap } from '../types';

/**
 * Resolved configuration consumed by {@link ChromaticRun}. Mirrors today's
 * `run()` argument shape: the raw process arguments to parse, an optional
 * pre-built `flags` override (used by the GitHub Action and programmatic
 * callers), and a legacy `extraOptions` escape hatch. A later refactor will
 * tighten this into a single immutable named-field type with no escape hatch.
 */
export interface ChromaticConfig {
  argv?: string[];
  flags?: Flags;
  extraOptions?: Partial<Options>;
}

/** Phase identifiers emitted on {@link RunEvent | RunEvents}. */
export type PhaseName = TaskName;

export type { RuntimeConfig } from '../types';

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
  /** Populated by the dependency tracer when packageMetadataChanges drive a rebuild scope. */
  changedDependencyNames?: string[];
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

/**
 * Output of the build phase: the artifacts directory plus the resolved
 * command line and (optional) build log file. Consumed by `prepare` and
 * `upload` phases.
 */
export interface BuildArtifactsState {
  /** Directory containing the built Storybook output. */
  sourceDir: string;
  /** Resolved build command actually executed (undefined for prebuilt RN). */
  buildCommand?: string;
  /** Absolute path to the build log file, when one was requested. */
  buildLogFile?: string;
}

/** Path/length pair plus its slash-normalized "knownAs" key, computed during preparation. */
export interface FileLength {
  pathname: string;
  knownAs: string;
  contentLength: number;
}

/**
 * Enumerated file inventory produced by the prepare phase. Consumed by
 * `upload` (to build the per-file descriptor list) and by metadata serializers.
 */
export interface PreparedFileInfo {
  paths: string[];
  hashes?: Record<string, string>;
  statsPath: string;
  lengths: FileLength[];
  total: number;
}

/**
 * Output of the prepare phase: the validated source directory and the
 * enumerated file inventory, plus optional turbosnap-derived narrowing.
 */
export interface PreparedState {
  /**
   * Effective source directory. May differ from the input
   * {@link BuildArtifactsState.sourceDir} when validation re-resolves it from
   * the `Output directory:` line of the build log.
   */
  sourceDir: string;
  fileInfo: PreparedFileInfo;
  /** Subset of stories the run should snapshot, when turbosnap traced cleanly. */
  onlyStoryFiles?: string[];
  /** Files the dependency tracer could not resolve back to a known module. */
  untracedFiles?: string[];
}

/**
 * TurboSnap and patch-build state. The prepare phase populates `turboSnap`;
 * `mergeBase` is set later by the workspace phase for patch builds.
 */
export interface TurboSnapState {
  turboSnap?: TurboSnap;
  mergeBase?: string;
}

/**
 * Output of the `storybookInfo` phase: the detected Storybook configuration
 * the orchestrator and downstream phases consume. Backed by Context's
 * canonical `storybook` shape so existing readers keep working unchanged.
 */
export type StorybookState = Context['storybook'];

/**
 * Output of the `auth` phase: the resolved API token plus optional
 * user/account identifiers per RFC. The phase also installs the token on
 * `ports.chromatic` so downstream phases can issue authorized requests.
 */
export interface AuthState {
  token: string;
  userId?: string;
  accountId?: string;
}

/**
 * Output of the `initialize` phase: the announced build returned by the
 * Chromatic API plus the resolved onboarding flag. Consumed by every
 * downstream phase that mentions `ctx.announcedBuild` today.
 */
export interface AnnouncedState {
  announcedBuild: Context['announcedBuild'];
  isOnboarding: boolean;
}

/**
 * Output of the `upload` phase: the totals reported back to the caller and
 * the sentinel URLs the verify phase (or external consumers) wait on.
 */
export interface UploadedState {
  uploadedBytes: number;
  uploadedFiles: number;
  sentinelUrls: string[];
}

/**
 * Output of the `snapshot` phase: the final build returned by the polling
 * loop and an optional carry-over `rebuildForBuild` reference (set by the
 * gitInfo phase's skip-rebuild outcome and forwarded through unchanged).
 */
export interface SnapshotState {
  build: Context['build'];
  rebuildForBuild?: Context['rebuildForBuild'];
}

/**
 * Output of the `verify` phase: the verified build, the published Storybook
 * URL, and whether the run should skip the snapshot phase (publish-only,
 * `--list`, or `--exit-once-uploaded` for the matching branch).
 */
export interface VerifiedState {
  build: Context['build'];
  /**
   * The announced build merged with the publish-mutation response. Carried
   * forward so downstream phases keep reading the post-publish version.
   */
  announcedBuild: Context['announcedBuild'];
  storybookUrl: string;
  skipSnapshots?: boolean;
  isPublishOnly?: boolean;
}
