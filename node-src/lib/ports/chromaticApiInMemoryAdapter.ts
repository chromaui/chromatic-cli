import {
  AncestorBuild,
  AnnouncedBuild,
  BaselineBuild,
  ChromaticApi,
  FirstCommittedAt,
  LastBuildInfo,
  MergedPullRequest,
  PublishedBuild,
  ReportBuild,
  SnapshotBuildState,
  StartedBuild,
  UploadBuildResult,
  UploadMetadataResult,
  VerifiedBuild,
} from './chromaticApi';

/**
 * Fixture-driven state backing the in-memory {@link ChromaticApi} adapter.
 * Every field is optional so tests populate only what they exercise. Callers
 * also read `authorizationToken` and `trackedEvents` to assert on recorded
 * interactions.
 */
export interface InMemoryChromaticApiState {
  /** The most recent token passed to {@link ChromaticApi.setAuthorization}. */
  authorizationToken?: string;

  /** Token returned by {@link ChromaticApi.createCliToken}. */
  cliToken?: string;
  /** Token returned by {@link ChromaticApi.createAppToken}. */
  appToken?: string;

  announcedBuild?: AnnouncedBuild;

  /** Keyed by `${commit}|${branch}|${slug ?? ''}`. Defaults to false. */
  skipBuild?: Record<string, boolean>;

  publishBuild?: PublishedBuild;

  /** Keyed by build number. */
  startedBuilds?: Record<number, StartedBuild>;
  verifiedBuilds?: Record<number, VerifiedBuild>;
  snapshotBuilds?: Record<number, SnapshotBuildState>;
  reportBuilds?: Record<number, ReportBuild>;

  /** Keyed by `${commit}|${branch}`. */
  lastBuilds?: Record<string, LastBuildInfo>;

  /** Keyed by build number. Defaults to empty list. */
  ancestorBuilds?: Record<number, AncestorBuild[]>;

  /** Keyed by branch name. */
  firstCommittedAt?: Record<string, FirstCommittedAt>;

  /** Keyed by the sorted+joined commit list. Defaults to empty list. */
  buildsWithCommits?: Record<string, string[]>;

  /** Keyed by the joined `commit:baseRefName` tuples. Defaults to empty list. */
  mergedPullRequests?: Record<string, MergedPullRequest[]>;

  /** Keyed by `${branch}|${parentCommits.join(',')}`. Defaults to empty list. */
  baselineBuilds?: Record<string, BaselineBuild[]>;

  uploadBuild?: UploadBuildResult;
  uploadMetadata?: UploadMetadataResult;

  /** Events captured by {@link ChromaticApi.trackTelemetryEvent}. */
  trackedEvents?: { event: string; properties?: Record<string, unknown> }[];
}

function mergeKey(input: { mergeInfoList: { commit: string; baseRefName: string }[] }): string {
  return input.mergeInfoList.map((m) => `${m.commit}:${m.baseRefName}`).join(',');
}

/**
 * Construct a {@link ChromaticApi} backed by an in-memory fixture. The state
 * object is held by reference so tests can mutate it between calls.
 *
 * @param state The mutable fixture driving the adapter's responses.
 *
 * @returns A ChromaticApi that reads from the provided state object.
 */
export function createInMemoryChromaticApi(state: InMemoryChromaticApiState): ChromaticApi {
  return {
    setAuthorization(token) {
      state.authorizationToken = token;
    },
    async createCliToken() {
      if (!state.cliToken) throw new Error('No cliToken fixture');
      return state.cliToken;
    },
    async createAppToken() {
      if (!state.appToken) throw new Error('No appToken fixture');
      return state.appToken;
    },
    async announceBuild() {
      if (!state.announcedBuild) throw new Error('No announcedBuild fixture');
      return state.announcedBuild;
    },
    async skipBuild(input) {
      const key = `${input.commit}|${input.branch}|${input.slug ?? ''}`;
      return state.skipBuild?.[key] ?? false;
    },
    async publishBuild() {
      if (!state.publishBuild) throw new Error('No publishBuild fixture');
      return state.publishBuild;
    },
    async getStartedBuild(input) {
      const build = state.startedBuilds?.[input.number];
      if (!build) throw new Error(`No startedBuild fixture for number ${input.number}`);
      return build;
    },
    async verifyBuild(input) {
      const build = state.verifiedBuilds?.[input.number];
      if (!build) throw new Error(`No verifyBuild fixture for number ${input.number}`);
      return build;
    },
    async getSnapshotBuild(input) {
      const build = state.snapshotBuilds?.[input.number];
      if (!build) throw new Error(`No snapshotBuild fixture for number ${input.number}`);
      return build;
    },
    async getReport(input) {
      const build = state.reportBuilds?.[input.buildNumber];
      if (!build) throw new Error(`No reportBuild fixture for number ${input.buildNumber}`);
      return build;
    },
    async getLastBuildForCommit(input) {
      const key = `${input.commit}|${input.branch}`;
      return state.lastBuilds?.[key] ?? { isOnboarding: false };
    },
    async getAncestorBuilds(input) {
      return state.ancestorBuilds?.[input.buildNumber] ?? [];
    },
    async getFirstCommittedAt(input) {
      const result = state.firstCommittedAt?.[input.branch];
      if (!result) throw new Error(`No firstCommittedAt fixture for branch ${input.branch}`);
      return result;
    },
    async hasBuildsWithCommits(input) {
      return state.buildsWithCommits?.[[...input.commits].sort().join(',')] ?? [];
    },
    async getMergedPullRequests(input) {
      return state.mergedPullRequests?.[mergeKey(input)] ?? [];
    },
    async getBaselineBuilds(input) {
      const key = `${input.branch}|${input.parentCommits.join(',')}`;
      return state.baselineBuilds?.[key] ?? [];
    },
    async uploadBuild() {
      if (!state.uploadBuild) throw new Error('No uploadBuild fixture');
      return state.uploadBuild;
    },
    async uploadMetadata() {
      if (!state.uploadMetadata) throw new Error('No uploadMetadata fixture');
      return state.uploadMetadata;
    },
    async trackTelemetryEvent(input) {
      state.trackedEvents = [...(state.trackedEvents ?? []), input];
    },
  };
}
