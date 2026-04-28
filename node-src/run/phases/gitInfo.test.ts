import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as commitAndBranchModule from '../../git/getCommitAndBranch';
import * as parentCommitsModule from '../../git/getParentCommits';
import { createInMemoryChromaticApi } from '../../lib/ports/chromaticApiInMemoryAdapter';
import { createInMemoryGitAdapter } from '../../lib/ports/gitInMemoryAdapter';
import TestLogger from '../../lib/testLogger';
import type { Options } from '../../types';
import { runGitInfoPhase } from './gitInfo';

vi.mock('../../git/getCommitAndBranch');
vi.mock('../../git/getParentCommits');

const getCommitAndBranch = vi.mocked(commitAndBranchModule.default);
const getParentCommits = vi.mocked(parentCommitsModule.getParentCommits);

const baseCommitInfo = {
  commit: 'commit-sha',
  committedAt: 1_700_000_000,
  committerName: 'Tester',
  committerEmail: 'tester@example.com',
  branch: 'feature',
  slug: undefined as unknown as string,
  fromCI: false,
  ciService: undefined,
};

function makeFakes(
  options: {
    chromaticOverrides?: Parameters<typeof createInMemoryChromaticApi>[0];
    gitOverrides?: Parameters<typeof createInMemoryGitAdapter>[0];
  } = {}
) {
  const log = new TestLogger();
  const ports = {
    git: createInMemoryGitAdapter({
      branch: 'feature',
      version: 'git v1.0.0',
      userEmail: 'tester@example.com',
      slug: 'user/repo',
      uncommittedHash: 'uncommitted-abc',
      repositoryRoot: '/repo',
      repositoryCreationDate: new Date('2024-01-01'),
      committerCount: 7,
      storybookCreationDates: { '.storybook': new Date('2024-02-01') },
      committedFileCounts: { 'page,screen|js,jsx,ts,tsx': 42 },
      ...options.gitOverrides,
    }),
    chromatic: createInMemoryChromaticApi({
      lastBuilds: {},
      ...options.chromaticOverrides,
    }),
  };
  return { log, ports };
}

function makeOptions(overrides: Partial<Options> = {}): Options {
  return {
    isLocalBuild: false,
    interactive: true,
    ...overrides,
  } as Options;
}

beforeEach(() => {
  getCommitAndBranch.mockResolvedValue({ ...baseCommitInfo });
  getParentCommits.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('runGitInfoPhase', () => {
  it('returns a populated GitState slice with project metadata', async () => {
    const { log, ports } = makeFakes();
    const result = await runGitInfoPhase({
      options: makeOptions(),
      packageJson: { dependencies: { 'react-router-dom': '^6.0.0' } },
      log,
      ports,
    });

    expect(result.git).toMatchObject({
      version: 'git v1.0.0',
      gitUserEmail: 'tester@example.com',
      uncommittedHash: 'uncommitted-abc',
      rootPath: '/repo',
      branch: 'feature',
      commit: 'commit-sha',
      slug: 'user/repo',
    });
    expect(result.projectMetadata).toMatchObject({
      hasRouter: true,
      creationDate: new Date('2024-01-01'),
      storybookCreationDate: new Date('2024-02-01'),
      numberOfCommitters: 7,
      numberOfAppFiles: 42,
    });
    expect(result.outcome).toEqual({ kind: 'continue' });
  });

  it('throws when local build has no git user email', async () => {
    const { log, ports } = makeFakes({ gitOverrides: { branch: 'feature', userEmail: undefined } });
    await expect(
      runGitInfoPhase({
        options: makeOptions({ isLocalBuild: true }),
        packageJson: {},
        log,
        ports,
      })
    ).rejects.toThrow(/git/i);
  });

  it('overrides slug owner via ownerName option', async () => {
    const { log, ports } = makeFakes({
      gitOverrides: { branch: 'org:feature', slug: 'user/repo' },
    });
    getCommitAndBranch.mockResolvedValue({ ...baseCommitInfo, branch: 'org:feature' });
    const result = await runGitInfoPhase({
      options: makeOptions({ ownerName: 'org' }),
      packageJson: {},
      log,
      ports,
    });
    expect(result.git.branch).toBe('feature');
    expect(result.git.slug).toBe('org/repo');
  });

  it('strips undefined: prefix from branch when present', async () => {
    const { log, ports } = makeFakes();
    getCommitAndBranch.mockResolvedValue({ ...baseCommitInfo, branch: 'undefined:branch' });
    const result = await runGitInfoPhase({
      options: makeOptions(),
      packageJson: {},
      log,
      ports,
    });
    expect(result.git.branch).toBe('branch');
  });

  it('returns skip-commit outcome when --skip matches and chromatic.skipBuild succeeds', async () => {
    const { log, ports } = makeFakes({
      chromaticOverrides: {
        skipBuild: { 'commit-sha|feature|user/repo': true },
      },
    });
    const result = await runGitInfoPhase({
      options: makeOptions({ skip: 'feature' }),
      packageJson: {},
      log,
      ports,
    });
    expect(result.outcome).toEqual({ kind: 'skip-commit' });
  });

  it('throws skipFailed when skipBuild returns false', async () => {
    const { log, ports } = makeFakes();
    await expect(
      runGitInfoPhase({
        options: makeOptions({ skip: 'feature' }),
        packageJson: {},
        log,
        ports,
      })
    ).rejects.toThrow();
  });

  it('emits forceRebuild override when project is onboarding', async () => {
    const { log, ports } = makeFakes({
      chromaticOverrides: {
        lastBuilds: { 'commit-sha|feature': { isOnboarding: true } },
      },
    });
    const result = await runGitInfoPhase({
      options: makeOptions(),
      packageJson: {},
      log,
      ports,
    });
    expect(result.optionsOverride).toEqual({ forceRebuild: true });
    expect(result.isOnboarding).toBe(true);
  });

  it('returns skip-rebuild outcome when sole parent has a passing ancestor build', async () => {
    const ancestor = makeAncestor({ status: 'PASSED' });
    const { log, ports } = makeFakes({
      chromaticOverrides: {
        lastBuilds: { 'commit-sha|feature': { isOnboarding: false, lastBuild: ancestor } },
      },
    });
    getParentCommits.mockResolvedValue(['commit-sha']);

    const result = await runGitInfoPhase({
      options: makeOptions(),
      packageJson: {},
      log,
      ports,
    });

    expect(result.outcome).toMatchObject({
      kind: 'skip-rebuild',
      rebuildForBuild: ancestor,
      storybookUrl: ancestor.storybookUrl,
    });
    expect(result.rebuildForBuildId).toBe('ancestor-id');
  });

  it('bails turboSnap with noAncestorBuild when --only-changed and no parents', async () => {
    const { log, ports } = makeFakes();
    getParentCommits.mockResolvedValue([]);

    const result = await runGitInfoPhase({
      options: makeOptions({ onlyChanged: true }),
      packageJson: {},
      log,
      ports,
    });

    expect(result.outcome).toMatchObject({
      kind: 'continue',
      turboSnap: { bailReason: { noAncestorBuild: true } },
    });
  });

  it('bails turboSnap with rebuild when --only-changed and rebuildForBuildId is set', async () => {
    const ancestor = makeAncestor({ status: 'IN_PROGRESS' });
    const { log, ports } = makeFakes({
      chromaticOverrides: {
        lastBuilds: { 'commit-sha|feature': { isOnboarding: false, lastBuild: ancestor } },
      },
    });
    getParentCommits.mockResolvedValue(['commit-sha']);

    const result = await runGitInfoPhase({
      options: makeOptions({ onlyChanged: true }),
      packageJson: {},
      log,
      ports,
    });

    expect(result.outcome).toMatchObject({
      kind: 'continue',
      turboSnap: { bailReason: { rebuild: true } },
    });
    expect(result.rebuildForBuildId).toBe('ancestor-id');
  });

  it('bails turboSnap with changedExternalFiles when externals match changedFiles', async () => {
    const baseline = makeBaselineBuild();
    const { log, ports } = makeFakes({
      chromaticOverrides: { baselineBuilds: { 'feature|parent-1': [baseline] } },
    });
    getParentCommits.mockResolvedValue(['parent-1']);
    const changedFilesModule = await import('../../git/getChangedFilesWithReplacement');
    const changedSpy = vi
      .spyOn(changedFilesModule, 'getChangedFilesWithReplacement')
      .mockResolvedValue({ changedFiles: ['styles/main.scss'] });

    const result = await runGitInfoPhase({
      options: makeOptions({ onlyChanged: true, externals: ['**/*.scss'] }),
      packageJson: {},
      log,
      ports,
    });

    expect(result.outcome).toMatchObject({
      kind: 'continue',
      turboSnap: { bailReason: { changedExternalFiles: ['styles/main.scss'] } },
    });
    expect(result.git.changedFiles).toBeUndefined();

    changedSpy.mockRestore();
  });

  it('records changedFiles and replacementBuildIds when baseline has them', async () => {
    const baseline = makeBaselineBuild();
    const replacement = {
      id: 'replacement-1',
      number: 4,
      commit: 'replacement-commit',
      uncommittedHash: '',
      isLocalBuild: false,
    };
    const { log, ports } = makeFakes({
      chromaticOverrides: { baselineBuilds: { 'feature|parent-1': [baseline] } },
    });
    getParentCommits.mockResolvedValue(['parent-1']);
    const changedFilesModule = await import('../../git/getChangedFilesWithReplacement');
    const changedSpy = vi
      .spyOn(changedFilesModule, 'getChangedFilesWithReplacement')
      .mockResolvedValue({
        changedFiles: ['src/a.ts', 'src/b.ts'],
        replacementBuild: replacement,
      });

    const result = await runGitInfoPhase({
      options: makeOptions({ onlyChanged: true }),
      packageJson: {},
      log,
      ports,
    });

    expect(result.git.changedFiles).toEqual(['src/a.ts', 'src/b.ts']);
    expect(result.git.replacementBuildIds).toEqual([['baseline-1', 'replacement-1']]);
    expect(result.git.baselineCommits).toEqual(['baseline-commit']);
    expect(result.outcome).toMatchObject({ kind: 'continue', turboSnap: {} });

    changedSpy.mockRestore();
  });
});

function makeAncestor(overrides: { status: string }) {
  return {
    id: 'ancestor-id',
    status: overrides.status,
    storybookUrl: 'https://sb.example.com',
    webUrl: 'https://web.example.com',
    specCount: 1,
    componentCount: 1,
    testCount: 1,
    changeCount: 0,
    errorCount: 0,
    actualTestCount: 1,
    actualCaptureCount: 1,
    inheritedCaptureCount: 0,
    interactionTestFailuresCount: 0,
  };
}

function makeBaselineBuild() {
  return {
    id: 'baseline-1',
    number: 5,
    status: 'PASSED',
    commit: 'baseline-commit',
    committedAt: 1_690_000_000,
    uncommittedHash: '',
    isLocalBuild: false,
    changeCount: 0,
  };
}
