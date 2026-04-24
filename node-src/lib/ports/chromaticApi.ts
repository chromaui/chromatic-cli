import type { FileDesc, TargetInfo } from '../../types';

/** Options shared by every {@link ChromaticApi} method that talks to the backend. */
export interface ChromaticApiCallOptions {
  /** Override the default GraphQL endpoint (e.g. the `/api` routing used for auth). */
  endpoint?: string;
  /** Extra request headers, merged over the adapter's defaults. */
  headers?: Record<string, string>;
  /** Retry count override; falls back to the adapter default. */
  retries?: number;
}

/**
 * Extra options specific to methods that publish, verify, or snapshot a build.
 * These calls authenticate with a per-build `reportToken`, so callers only need
 * to supply the token — the adapter builds the `Authorization` header itself.
 */
export interface ReportTokenCallOptions extends Omit<ChromaticApiCallOptions, 'headers'> {
  reportToken?: string;
}

/** Result of {@link ChromaticApi.announceBuild}. */
export interface AnnouncedBuild {
  id: string;
  number: number;
  browsers: string[];
  status: string;
  autoAcceptChanges: boolean;
  reportToken: string;
  features?: {
    uiTests: boolean;
    uiReview: boolean;
    isReactNativeApp: boolean;
  };
  app: {
    id: string;
    turboSnapAvailability: string;
  };
}

/** Result of {@link ChromaticApi.publishBuild}. */
export interface PublishedBuild {
  status: string;
  storybookUrl: string;
}

/** Input for {@link ChromaticApi.publishBuild}. */
export interface PublishBuildInput {
  onlyStoryFiles?: string[];
  onlyStoryNames?: string[];
  replacementBuildIds?: [string, string][];
  turboSnapBailReason?: unknown;
  turboSnapStatus: 'UNUSED' | 'APPLIED' | 'BAILED';
}

/** Intermediate shape returned while waiting for a build to start. */
export interface StartedBuild {
  startedAt?: number;
  failureReason?: string;
  upgradeBuilds?: { completedAt?: number }[];
}

/** Fully-verified build as returned by {@link ChromaticApi.verifyBuild}. Shape matches `Context['build']`. */
export interface VerifiedBuild {
  id: string;
  number: number;
  status: string;
  webUrl: string;
  storybookUrl?: string;
  specCount: number;
  componentCount: number;
  testCount: number;
  changeCount: number;
  errorCount: number;
  actualTestCount: number;
  actualCaptureCount: number;
  inheritedCaptureCount: number;
  interactionTestFailuresCount: number;
  autoAcceptChanges: boolean;
  turboSnapEnabled?: boolean;
  wasLimited?: boolean;
  browsers?: { browser: string }[];
  features?: { uiTests: boolean; uiReview: boolean; isReactNativeApp: boolean };
  app: {
    manageUrl: string;
    setupUrl: string;
    account?: { exceededThreshold: boolean; paymentRequired: boolean; billingUrl: string };
    repository?: { provider: string };
  };
  tests?: {
    spec: { name: string; component: { name: string; displayName: string } };
    parameters: { viewport: number; viewportIsDefault: boolean };
    mode: { id?: string; name: string };
  }[];
}

/** A single snapshot-poll response. */
export interface SnapshotBuildState {
  id: string;
  status: string;
  autoAcceptChanges: boolean;
  inProgressCount: number;
  testCount: number;
  changeCount: number;
  errorCount: number;
  completedAt?: number;
}

/** Test metadata returned by {@link ChromaticApi.getReport}. */
export interface ReportTest {
  status: string;
  result: string;
  spec: { name: string; component: { name: string; displayName: string } };
  parameters: { viewport: number; viewportIsDefault: boolean };
  mode: { name: string };
}

/** Report-level build metadata as returned by {@link ChromaticApi.getReport}. */
export interface ReportBuild {
  number: number;
  status: string;
  storybookUrl: string;
  webUrl: string;
  createdAt: number;
  completedAt: number;
  tests: ReportTest[];
}

/** Shape of {@link ChromaticApi.getLastBuildForCommit}. */
export interface LastBuildInfo {
  isOnboarding: boolean;
  lastBuild?: {
    id: string;
    status: string;
    storybookUrl: string;
    webUrl: string;
    specCount: number;
    componentCount: number;
    testCount: number;
    changeCount: number;
    errorCount: number;
    actualTestCount: number;
    actualCaptureCount: number;
    inheritedCaptureCount: number;
    interactionTestFailuresCount: number;
  };
}

/** Shape of {@link ChromaticApi.getAncestorBuilds}. */
export interface AncestorBuild {
  id: string;
  number: number;
  commit: string;
  uncommittedHash: string;
  isLocalBuild: boolean;
}

/** Shape of {@link ChromaticApi.getFirstCommittedAt}. */
export interface FirstCommittedAt {
  firstBuild: { committedAt: number };
  lastBuild: { commit: string; committedAt: number };
}

/** Shape of {@link ChromaticApi.getBaselineBuilds} responses. */
export interface BaselineBuild {
  id: string;
  number: number;
  status: string;
  commit: string;
  committedAt: number;
  uncommittedHash: string;
  isLocalBuild: boolean;
  changeCount: number;
}

/** Shape of {@link ChromaticApi.getMergedPullRequests}. */
export interface MergedPullRequest {
  lastHeadBuild: { commit: string };
}

/** A single item for the merge-commits query. */
export interface MergeInfoInput {
  commit: string;
  baseRefName: string;
}

/** Per-build description of local-build handling used across parent-commit queries. */
export interface LocalBuildsSpecifier {
  localBuildEmailHash?: string;
  localBuildIsLatestCommit?: boolean;
}

/** Result of {@link ChromaticApi.uploadBuild}. */
export interface UploadBuildResult {
  info?: {
    sentinelUrls: string[];
    targets: TargetInfo[];
    zipTarget?: TargetInfo;
  };
  userErrors: (
    | { __typename: 'UserError'; message: string }
    | {
        __typename: 'MaxFileCountExceededError';
        message: string;
        maxFileCount: number;
        fileCount: number;
      }
    | {
        __typename: 'MaxFileSizeExceededError';
        message: string;
        maxFileSize: number;
        filePaths: string[];
      }
  )[];
}

/** Result of {@link ChromaticApi.uploadMetadata}. */
export interface UploadMetadataResult {
  info?: { targets: TargetInfo[] };
  userErrors: { message: string }[];
}

/** A minimal file descriptor shared across upload calls. */
export type UploadFileInput = Pick<FileDesc, 'contentHash' | 'contentLength' | 'targetPath'>;

/**
 * Semantic boundary over the Chromatic GraphQL API. Production callers use the
 * GraphQL-backed adapter; tests use the in-memory fake.
 */
export interface ChromaticApi {
  /** Attach a bearer token used by subsequent calls. Forwards to the underlying GraphQL client. */
  setAuthorization(token: string): void;

  /** Exchange a user token + project ID for a short-lived CLI token (auth flow). */
  createCliToken(input: { projectId: string; userToken: string }): Promise<string>;

  /** Legacy path: exchange a long-lived project token for an app token. */
  createAppToken(input: { projectToken: string }): Promise<string>;

  /** Announce a new build; returns the server-assigned build identity. */
  announceBuild(input: { input: Record<string, unknown> }): Promise<AnnouncedBuild>;

  /** Tag a commit as skipped so future rebuilds exit early. Returns true when accepted. */
  skipBuild(input: { commit: string; branch: string; slug?: string }): Promise<boolean>;

  /** Publish the announced build for snapshotting. */
  publishBuild(
    input: { id: string; input: PublishBuildInput },
    options?: ReportTokenCallOptions
  ): Promise<PublishedBuild>;

  /** Poll the started-build endpoint while waiting for Storybook to boot. */
  getStartedBuild(
    input: { number: number },
    options?: ReportTokenCallOptions
  ): Promise<StartedBuild>;

  /** Fetch the fully-verified build once it has started. */
  verifyBuild(input: { number: number }, options?: ReportTokenCallOptions): Promise<VerifiedBuild>;

  /** Poll the snapshot endpoint while tests are running. */
  getSnapshotBuild(
    input: { number: number },
    options?: ReportTokenCallOptions
  ): Promise<SnapshotBuildState>;

  /** Fetch a page of the build's tests for report generation (JUnit, etc.). */
  getReport(
    input: { buildNumber: number; skip: number; limit: number },
    options?: ReportTokenCallOptions
  ): Promise<ReportBuild>;

  /** Fetch the last build for a commit/branch pair. */
  getLastBuildForCommit(input: { commit: string; branch: string }): Promise<LastBuildInfo>;

  /** Fetch ancestor builds for a given build, used during rebase detection. */
  getAncestorBuilds(input: {
    buildNumber: number;
    skip: number;
    limit: number;
  }): Promise<AncestorBuild[]>;

  /** Fetch the first/last build for a branch, used during parent-commit detection. */
  getFirstCommittedAt(
    input: { branch: string; localBuilds: LocalBuildsSpecifier },
    options?: ChromaticApiCallOptions
  ): Promise<FirstCommittedAt>;

  /** Determine which of the supplied commits already have a build. */
  hasBuildsWithCommits(input: {
    commits: string[];
    localBuilds: LocalBuildsSpecifier;
  }): Promise<string[]>;

  /** Resolve merge commits into the head builds of their PRs. */
  getMergedPullRequests(
    input: { mergeInfoList: MergeInfoInput[] },
    options?: ChromaticApiCallOptions
  ): Promise<MergedPullRequest[]>;

  /** Fetch the baseline builds for a branch and its parent commits. */
  getBaselineBuilds(input: {
    branch: string;
    parentCommits: string[];
    localBuilds: LocalBuildsSpecifier;
  }): Promise<BaselineBuild[]>;

  /** Announce a batch of files to be uploaded; returns signed URLs and sentinels. */
  uploadBuild(input: {
    buildId: string;
    files: UploadFileInput[];
    zip?: boolean;
  }): Promise<UploadBuildResult>;

  /** Announce metadata files to upload alongside the build. */
  uploadMetadata(input: {
    buildId: string;
    files: UploadFileInput[];
  }): Promise<UploadMetadataResult>;

  /** Best-effort telemetry event. */
  trackTelemetryEvent(input: {
    event: string;
    properties?: Record<string, unknown>;
  }): Promise<void>;
}
