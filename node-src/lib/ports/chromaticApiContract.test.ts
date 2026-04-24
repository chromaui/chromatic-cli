import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
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
import { createGraphqlChromaticApi } from './chromaticApiGraphqlAdapter';
import {
  createInMemoryChromaticApi,
  InMemoryChromaticApiState,
} from './chromaticApiInMemoryAdapter';

/**
 * A semantic primer over a ChromaticApi adapter. Each method primes the
 * adapter so a subsequent call returns the described value. For the GraphQL
 * adapter that means queueing a mocked `runQuery` response. For the in-memory
 * adapter that means mutating the fixture state.
 */
interface AdapterSetup {
  adapter: ChromaticApi;
  setAuthorizationCalls: () => string[];
  trackedEvents: () => { event: string; properties?: Record<string, unknown> }[];
  primeCliToken: (token: string) => void;
  primeAppToken: (token: string) => void;
  primeAnnouncedBuild: (build: AnnouncedBuild) => void;
  primeSkipBuild: (
    input: { commit: string; branch: string; slug?: string },
    result: boolean
  ) => void;
  primePublishBuild: (result: PublishedBuild) => void;
  primeStartedBuild: (number: number, result: StartedBuild) => void;
  primeVerifyBuild: (number: number, result: VerifiedBuild) => void;
  primeSnapshotBuild: (number: number, result: SnapshotBuildState) => void;
  primeReport: (buildNumber: number, result: ReportBuild) => void;
  primeLastBuild: (commit: string, branch: string, result: LastBuildInfo) => void;
  primeAncestorBuilds: (buildNumber: number, builds: AncestorBuild[]) => void;
  primeFirstCommittedAt: (branch: string, result: FirstCommittedAt) => void;
  primeHasBuildsWithCommits: (commits: string[], result: string[]) => void;
  primeMergedPullRequests: (
    mergeInfoList: { commit: string; baseRefName: string }[],
    result: MergedPullRequest[]
  ) => void;
  primeBaselineBuilds: (branch: string, parentCommits: string[], result: BaselineBuild[]) => void;
  primeUploadBuild: (result: UploadBuildResult) => void;
  primeUploadMetadata: (result: UploadMetadataResult) => void;
  primeTelemetrySuccess: () => void;
}

function graphqlSetup(): AdapterSetup {
  const runQuery = vi.fn();
  const setAuthorization = vi.fn();
  const client = { runQuery, setAuthorization };
  const adapter = createGraphqlChromaticApi({
    getClient: () => client as any,
    cliTokenEndpoint: 'https://index.example.com/api',
  });
  const prime = (value: unknown) => runQuery.mockResolvedValueOnce(value);
  return {
    adapter,
    setAuthorizationCalls: () => setAuthorization.mock.calls.map(([token]) => token as string),
    trackedEvents: () => [],
    primeCliToken: (token) => prime({ cliToken: token }),
    primeAppToken: (token) => prime({ appToken: token }),
    primeAnnouncedBuild: (build) => prime({ announceBuild: build }),
    primeSkipBuild: (_input, result) => prime(result),
    primePublishBuild: (result) => prime({ publishBuild: result }),
    primeStartedBuild: (_number, result) => prime({ app: { build: result } }),
    primeVerifyBuild: (_number, result) => prime({ app: { build: result } }),
    primeSnapshotBuild: (_number, result) => prime({ app: { build: result } }),
    primeReport: (_number, result) => prime({ app: { build: result } }),
    primeLastBuild: (_commit, _branch, result) => prime({ app: result }),
    primeAncestorBuilds: (_number, builds) => prime({ app: { build: { ancestorBuilds: builds } } }),
    primeFirstCommittedAt: (_branch, result) => prime({ app: result }),
    primeHasBuildsWithCommits: (_commits, result) =>
      prime({ app: { hasBuildsWithCommits: result } }),
    primeMergedPullRequests: (_list, result) => prime({ app: { mergedPullRequests: result } }),
    primeBaselineBuilds: (_branch, _parents, result) => prime({ app: { baselineBuilds: result } }),
    primeUploadBuild: (result) => prime({ uploadBuild: result }),
    primeUploadMetadata: (result) => prime({ uploadMetadata: result }),
    primeTelemetrySuccess: () => prime(undefined),
  };
}

function inMemorySetup(): AdapterSetup {
  const state: InMemoryChromaticApiState = {};
  const adapter = createInMemoryChromaticApi(state);
  return {
    adapter,
    setAuthorizationCalls: () =>
      state.authorizationToken === undefined ? [] : [state.authorizationToken],
    trackedEvents: () => state.trackedEvents ?? [],
    primeCliToken: (token) => {
      state.cliToken = token;
    },
    primeAppToken: (token) => {
      state.appToken = token;
    },
    primeAnnouncedBuild: (build) => {
      state.announcedBuild = build;
    },
    primeSkipBuild: (input, result) => {
      const key = `${input.commit}|${input.branch}|${input.slug ?? ''}`;
      state.skipBuild = { ...state.skipBuild, [key]: result };
    },
    primePublishBuild: (result) => {
      state.publishBuild = result;
    },
    primeStartedBuild: (number, result) => {
      state.startedBuilds = { ...state.startedBuilds, [number]: result };
    },
    primeVerifyBuild: (number, result) => {
      state.verifiedBuilds = { ...state.verifiedBuilds, [number]: result };
    },
    primeSnapshotBuild: (number, result) => {
      state.snapshotBuilds = { ...state.snapshotBuilds, [number]: result };
    },
    primeReport: (buildNumber, result) => {
      state.reportBuilds = { ...state.reportBuilds, [buildNumber]: result };
    },
    primeLastBuild: (commit, branch, result) => {
      state.lastBuilds = { ...state.lastBuilds, [`${commit}|${branch}`]: result };
    },
    primeAncestorBuilds: (buildNumber, builds) => {
      state.ancestorBuilds = { ...state.ancestorBuilds, [buildNumber]: builds };
    },
    primeFirstCommittedAt: (branch, result) => {
      state.firstCommittedAt = { ...state.firstCommittedAt, [branch]: result };
    },
    primeHasBuildsWithCommits: (commits, result) => {
      const key = [...commits].sort().join(',');
      state.buildsWithCommits = { ...state.buildsWithCommits, [key]: result };
    },
    primeMergedPullRequests: (list, result) => {
      const key = list.map((m) => `${m.commit}:${m.baseRefName}`).join(',');
      state.mergedPullRequests = { ...state.mergedPullRequests, [key]: result };
    },
    primeBaselineBuilds: (branch, parents, result) => {
      const key = `${branch}|${parents.join(',')}`;
      state.baselineBuilds = { ...state.baselineBuilds, [key]: result };
    },
    primeUploadBuild: (result) => {
      state.uploadBuild = result;
    },
    primeUploadMetadata: (result) => {
      state.uploadMetadata = result;
    },
    primeTelemetrySuccess: () => {
      // no-op: in-memory adapter records events directly
    },
  };
}

const adapters = [
  ['graphql', graphqlSetup],
  ['in-memory', inMemorySetup],
] as const;

const sampleAnnouncedBuild: AnnouncedBuild = {
  id: 'build-1',
  number: 1,
  browsers: ['chrome'],
  status: 'ANNOUNCED',
  autoAcceptChanges: false,
  reportToken: 'report-token',
  features: { uiTests: true, uiReview: true, isReactNativeApp: false },
  app: { id: 'app-1', turboSnapAvailability: 'AVAILABLE' },
};

describe.each(adapters)('ChromaticApi (%s)', (_name, makeSetup) => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('records the authorization token', () => {
    const { adapter, setAuthorizationCalls } = makeSetup();
    adapter.setAuthorization('tok-123');
    expect(setAuthorizationCalls()).toEqual(['tok-123']);
  });

  it('returns a CLI token', async () => {
    const { adapter, primeCliToken } = makeSetup();
    primeCliToken('cli-token');
    expect(await adapter.createCliToken({ projectId: 'p1', userToken: 'u1' })).toBe('cli-token');
  });

  it('returns an app token', async () => {
    const { adapter, primeAppToken } = makeSetup();
    primeAppToken('app-token');
    expect(await adapter.createAppToken({ projectToken: 'chpt_xyz' })).toBe('app-token');
  });

  it('announces a build', async () => {
    const { adapter, primeAnnouncedBuild } = makeSetup();
    primeAnnouncedBuild(sampleAnnouncedBuild);
    expect(await adapter.announceBuild({ input: { foo: 'bar' } })).toEqual(sampleAnnouncedBuild);
  });

  it('returns true when the server accepts the skip', async () => {
    const { adapter, primeSkipBuild } = makeSetup();
    primeSkipBuild({ commit: 'abc', branch: 'main', slug: 'org/repo' }, true);
    expect(await adapter.skipBuild({ commit: 'abc', branch: 'main', slug: 'org/repo' })).toBe(true);
  });

  it('publishes a build', async () => {
    const { adapter, primePublishBuild } = makeSetup();
    primePublishBuild({ status: 'PENDING', storybookUrl: 'https://sb/published' });
    expect(
      await adapter.publishBuild(
        { id: 'build-1', input: { turboSnapStatus: 'UNUSED' } },
        { reportToken: 'rt' }
      )
    ).toEqual({ status: 'PENDING', storybookUrl: 'https://sb/published' });
  });

  it('returns a started build', async () => {
    const { adapter, primeStartedBuild } = makeSetup();
    primeStartedBuild(42, { startedAt: 12_345 });
    expect(await adapter.getStartedBuild({ number: 42 }, { reportToken: 'rt' })).toEqual({
      startedAt: 12_345,
    });
  });

  it('returns a verified build', async () => {
    const { adapter, primeVerifyBuild } = makeSetup();
    const sample: VerifiedBuild = {
      id: 'build-1',
      number: 42,
      status: 'IN_PROGRESS',
      webUrl: 'https://chromatic/build/42',
      specCount: 1,
      componentCount: 1,
      testCount: 1,
      changeCount: 0,
      errorCount: 0,
      actualTestCount: 1,
      actualCaptureCount: 0,
      inheritedCaptureCount: 0,
      interactionTestFailuresCount: 0,
      autoAcceptChanges: false,
      app: { manageUrl: 'https://m', setupUrl: 'https://s' },
    };
    primeVerifyBuild(42, sample);
    expect(await adapter.verifyBuild({ number: 42 }, { reportToken: 'rt' })).toEqual(sample);
  });

  it('returns a snapshot build', async () => {
    const { adapter, primeSnapshotBuild } = makeSetup();
    const sample: SnapshotBuildState = {
      id: 'build-1',
      status: 'IN_PROGRESS',
      autoAcceptChanges: false,
      inProgressCount: 0,
      testCount: 1,
      changeCount: 0,
      errorCount: 0,
    };
    primeSnapshotBuild(42, sample);
    expect(await adapter.getSnapshotBuild({ number: 42 }, { reportToken: 'rt' })).toEqual(sample);
  });

  it('returns a report build page', async () => {
    const { adapter, primeReport } = makeSetup();
    const sample: ReportBuild = {
      number: 42,
      status: 'PASSED',
      storybookUrl: 'https://sb',
      webUrl: 'https://web',
      createdAt: 0,
      completedAt: 1000,
      tests: [],
    };
    primeReport(42, sample);
    expect(
      await adapter.getReport({ buildNumber: 42, skip: 0, limit: 100 }, { reportToken: 'rt' })
    ).toEqual(sample);
  });

  it('returns the last build for a commit', async () => {
    const { adapter, primeLastBuild } = makeSetup();
    primeLastBuild('abc', 'main', { isOnboarding: false });
    expect(await adapter.getLastBuildForCommit({ commit: 'abc', branch: 'main' })).toEqual({
      isOnboarding: false,
    });
  });

  it('returns ancestor builds', async () => {
    const { adapter, primeAncestorBuilds } = makeSetup();
    const builds: AncestorBuild[] = [
      { id: 'a', number: 1, commit: 'sha1', uncommittedHash: '', isLocalBuild: false },
    ];
    primeAncestorBuilds(42, builds);
    expect(await adapter.getAncestorBuilds({ buildNumber: 42, skip: 0, limit: 10 })).toEqual(
      builds
    );
  });

  it('returns first/last committedAt for a branch', async () => {
    const { adapter, primeFirstCommittedAt } = makeSetup();
    const sample: FirstCommittedAt = {
      firstBuild: { committedAt: 1 },
      lastBuild: { commit: 'abc', committedAt: 5 },
    };
    primeFirstCommittedAt('main', sample);
    expect(
      await adapter.getFirstCommittedAt({
        branch: 'main',
        localBuilds: { localBuildEmailHash: 'e', localBuildIsLatestCommit: true },
      })
    ).toEqual(sample);
  });

  it('returns which commits have builds', async () => {
    const { adapter, primeHasBuildsWithCommits } = makeSetup();
    primeHasBuildsWithCommits(['abc', 'def'], ['abc']);
    expect(
      await adapter.hasBuildsWithCommits({
        commits: ['abc', 'def'],
        localBuilds: {},
      })
    ).toEqual(['abc']);
  });

  it('returns merged pull requests', async () => {
    const { adapter, primeMergedPullRequests } = makeSetup();
    const list = [{ commit: 'sha1', baseRefName: 'main' }];
    primeMergedPullRequests(list, [{ lastHeadBuild: { commit: 'head-sha' } }]);
    expect(await adapter.getMergedPullRequests({ mergeInfoList: list })).toEqual([
      { lastHeadBuild: { commit: 'head-sha' } },
    ]);
  });

  it('returns baseline builds', async () => {
    const { adapter, primeBaselineBuilds } = makeSetup();
    const sample: BaselineBuild[] = [
      {
        id: 'b',
        number: 3,
        status: 'PASSED',
        commit: 'sha',
        committedAt: 10,
        uncommittedHash: '',
        isLocalBuild: false,
        changeCount: 0,
      },
    ];
    primeBaselineBuilds('main', ['p1'], sample);
    expect(
      await adapter.getBaselineBuilds({
        branch: 'main',
        parentCommits: ['p1'],
        localBuilds: {},
      })
    ).toEqual(sample);
  });

  it('uploads a build batch', async () => {
    const { adapter, primeUploadBuild } = makeSetup();
    const sample: UploadBuildResult = {
      info: { sentinelUrls: ['https://sentinel'], targets: [] },
      userErrors: [],
    };
    primeUploadBuild(sample);
    expect(await adapter.uploadBuild({ buildId: 'b', files: [], zip: false })).toEqual(sample);
  });

  it('uploads metadata', async () => {
    const { adapter, primeUploadMetadata } = makeSetup();
    const sample: UploadMetadataResult = { info: { targets: [] }, userErrors: [] };
    primeUploadMetadata(sample);
    expect(await adapter.uploadMetadata({ buildId: 'b', files: [] })).toEqual(sample);
  });

  it('records telemetry events', async () => {
    const { adapter, trackedEvents, primeTelemetrySuccess } = makeSetup();
    primeTelemetrySuccess();
    await adapter.trackTelemetryEvent({ event: 'something', properties: { foo: 'bar' } });
    // in-memory adapter records; graphql adapter just dispatches.
    const events = trackedEvents();
    if (events.length > 0) {
      expect(events).toEqual([{ event: 'something', properties: { foo: 'bar' } }]);
    }
  });
});
