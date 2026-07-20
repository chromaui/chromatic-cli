/* eslint-disable max-lines */
import * as Sentry from '@sentry/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getBaselineBuilds as getBaselineBuildsUnmocked } from '../git/getBaselineBuilds';
import { getChangedFilesWithReplacement as getChangedFilesWithReplacementUnmocked } from '../git/getChangedFilesWithReplacement';
import * as getCommitInfo from '../git/getCommitAndBranch';
import { getParentCommits as getParentCommitsUnmocked } from '../git/getParentCommits';
import * as git from '../git/git';
import { getHasRouter as getHasRouterUnmocked } from '../lib/getHasRouter';
import TestLogger from '../lib/testLogger';
import {
  AncestorMissingError,
  BaselineDirtyError,
  GitCommandError,
  NetworkError,
  ReplacementFailedError,
} from '../lib/turbosnap/1.0/errors';
import {
  applyGitInfoOutput,
  applyGitInfoPartial,
  extractGitInfoInput,
  gatherGitInfo,
  GitInfoDeps,
  GitInfoInput,
  GitInfoOutput,
} from './gitInfo';

// Helper that `expect`s a result kind and asserts on the kind to type narrow the result,
// allowing later lines to access other result properties without casting
function expectKind<
  R extends { kind: 'continue' | 'partial' | 'skip' | 'skip-self' },
  K extends R['kind'],
>(result: R, kind: K): asserts result is Extract<R, { kind: K }> {
  expect(result.kind).toBe(kind);
}

// Helper that narrows a discriminated `phase` field on a partial result output.
function expectPhase<O extends { phase: string }, P extends O['phase']>(
  output: O,
  phase: P
): asserts output is Extract<O, { phase: P }> {
  expect(output.phase).toBe(phase);
}

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(() => 'fake-sentry-id'),
}));
vi.mock('../git/getCommitAndBranch');
vi.mock('../git/git');
vi.mock('../git/getParentCommits');
vi.mock('../git/getBaselineBuilds');
vi.mock('../git/getChangedFilesWithReplacement');
vi.mock('../lib/getHasRouter');

const getCommitAndBranch = vi.mocked(getCommitInfo.default);
const getChangedFilesWithReplacement = vi.mocked(getChangedFilesWithReplacementUnmocked);
const getSlug = vi.mocked(git.getSlug);
const getVersion = vi.mocked(git.getVersion);
const getUserEmail = vi.mocked(git.getUserEmail);
const getRepositoryCreationDate = vi.mocked(git.getRepositoryCreationDate);
const getRepositoryRoot = vi.mocked(git.getRepositoryRoot);
const getStorybookCreationDate = vi.mocked(git.getStorybookCreationDate);
const getNumberOfCommitters = vi.mocked(git.getNumberOfCommitters);
const getCommittedFileCount = vi.mocked(git.getCommittedFileCount);
const getUncommittedHash = vi.mocked(git.getUncommittedHash);
const getBaselineBuilds = vi.mocked(getBaselineBuildsUnmocked);
const getParentCommits = vi.mocked(getParentCommitsUnmocked);
const getHasRouter = vi.mocked(getHasRouterUnmocked);

const log = new TestLogger();

const commitInfo = {
  commit: '123asdf',
  committedAt: 1_640_131_292,
  committerName: 'Gert Hengeveld',
  committerEmail: 'gert@chromatic.com',
  branch: 'something',
  slug: undefined,
  isTravisPrBuild: false,
  fromCI: false,
  ciService: undefined,
};

const client = { runQuery: vi.fn(), setAuthorization: vi.fn() };

const buildDeps = (overrides: Partial<GitInfoDeps> = {}): GitInfoDeps => ({
  log,
  client: client as any,
  options: {} as any,
  runtime: {} as any,
  packageJson: {},
  report: vi.fn(),
  ...overrides,
});

const buildInput = (overrides: Partial<GitInfoInput> = {}): GitInfoInput => ({
  fromCI: false,
  interactive: false,
  isLocalBuild: false,
  skip: false,
  onlyChanged: false,
  ...overrides,
});

beforeEach(() => {
  getCommitAndBranch.mockResolvedValue(commitInfo);
  getUncommittedHash.mockResolvedValue('abc123');
  getParentCommits.mockResolvedValue(['asd2344']);
  getBaselineBuilds.mockResolvedValue([]);
  getChangedFilesWithReplacement.mockResolvedValue({ changedFiles: [] });
  getVersion.mockResolvedValue('Git v1.0.0');
  getUserEmail.mockResolvedValue('user@email.com');
  getSlug.mockResolvedValue('user/repo');
  getRepositoryCreationDate.mockResolvedValue(new Date('2024-11-01'));
  getRepositoryRoot.mockResolvedValue('/path/to/project');
  getStorybookCreationDate.mockResolvedValue(new Date('2025-11-01'));
  getNumberOfCommitters.mockResolvedValue(17);
  getCommittedFileCount.mockResolvedValue(100);
  getHasRouter.mockReturnValue(true);

  client.runQuery.mockReturnValue({ app: { isOnboarding: false } });
});

describe('gatherGitInfo', () => {
  it('returns continue with the git info', async () => {
    const result = await gatherGitInfo(buildDeps(), buildInput());
    expectKind(result, 'continue');
    expect(result.output.git).toMatchObject({
      rootPath: '/path/to/project',
      commit: '123asdf',
      branch: 'something',
      parentCommits: ['asd2344'],
      version: 'Git v1.0.0',
      slug: 'user/repo',
    });
  });

  it('sets gitUserEmail to current user for local builds', async () => {
    const result = await gatherGitInfo(buildDeps(), buildInput({ isLocalBuild: true }));
    expectKind(result, 'continue');
    expect(result.output.git).toMatchObject({ gitUserEmail: 'user@email.com' });
  });

  it('supports overriding the owner name in the slug', async () => {
    const result = await gatherGitInfo(buildDeps(), buildInput({ ownerName: 'org' }));
    expectKind(result, 'continue');
    expect(result.output.git).toMatchObject({ slug: 'org/repo' });
  });

  it('sets changedFiles', async () => {
    getBaselineBuilds.mockResolvedValue([{ commit: '012qwes' } as any]);
    getChangedFilesWithReplacement.mockResolvedValue({
      changedFiles: ['styles/main.scss', 'lib/utils.js'],
    });
    const result = await gatherGitInfo(buildDeps(), buildInput({ onlyChanged: true }));
    expectKind(result, 'continue');
    expect(result.output.git.changedFiles).toEqual(['styles/main.scss', 'lib/utils.js']);
    expect(result.output.git.replacementBuildIds).toEqual([]);
  });

  it('sets changedFiles on a branch name containing a slash', async () => {
    getCommitAndBranch.mockResolvedValue({ ...commitInfo, branch: 'something/else' });
    getBaselineBuilds.mockResolvedValue([{ commit: '012qwes' } as any]);
    getChangedFilesWithReplacement.mockResolvedValue({
      changedFiles: ['styles/main.scss', 'lib/utils.js'],
    });
    const result = await gatherGitInfo(buildDeps(), buildInput({ onlyChanged: '!(main)' }));
    expectKind(result, 'continue');
    expect(result.output.git.changedFiles).toEqual(['styles/main.scss', 'lib/utils.js']);
    expect(result.output.git.replacementBuildIds).toEqual([]);
  });

  it('sets replacementBuildIds when found', async () => {
    getBaselineBuilds.mockResolvedValue([{ id: 'rebased', commit: '012qwes' } as any]);
    getChangedFilesWithReplacement.mockResolvedValue({
      changedFiles: ['styles/main.scss', 'lib/utils.js'],
      replacementBuild: {
        id: 'parent',
        number: 1,
        commit: '987bca',
        uncommittedHash: '',
        isLocalBuild: false,
      },
    });
    const result = await gatherGitInfo(buildDeps(), buildInput({ onlyChanged: true }));
    expectKind(result, 'continue');
    expect(result.output.git.changedFiles).toEqual(['styles/main.scss', 'lib/utils.js']);
    expect(result.output.git.replacementBuildIds).toEqual([['rebased', 'parent']]);
  });

  it('drops changedFiles when matching --externals', async () => {
    getBaselineBuilds.mockResolvedValue([{ commit: '012qwes' } as any]);
    getChangedFilesWithReplacement.mockResolvedValue({
      changedFiles: ['styles/main.scss', 'lib/utils.js'],
    });
    const result = await gatherGitInfo(
      buildDeps(),
      buildInput({ onlyChanged: true, externals: ['**/*.scss'] })
    );
    expectKind(result, 'continue');
    expect(result.output.git.changedFiles).toBeUndefined();
  });

  it('forces rebuild automatically if app is onboarding', async () => {
    client.runQuery.mockReturnValue({ app: { isOnboarding: true } });
    const result = await gatherGitInfo(buildDeps(), buildInput({ ownerName: 'org' }));
    expectKind(result, 'continue');
    expect(result.output.setForceRebuild).toBe(true);
    expect(result.output.isOnboarding).toBe(true);
  });

  it('returns continue with rebuildForBuildId when force-rebuild prevents skip', async () => {
    const lastBuild = { id: 'last-build-id', status: 'PASSED', storybookUrl: 'https://x' };
    getParentCommits.mockResolvedValue([commitInfo.commit]);
    client.runQuery.mockReturnValue({ app: { isOnboarding: false, lastBuild } });

    const result = await gatherGitInfo(
      buildDeps({ runtime: { forceRebuild: true } as any }),
      buildInput()
    );

    expectKind(result, 'continue');
    expect(result.output.rebuildForBuildId).toBe('last-build-id');
  });

  it('returns rebuild-noop partial when ancestor is fully passed', async () => {
    const lastBuild = {
      id: 'parent',
      status: 'ACCEPTED',
      webUrl: 'some-web-url',
      storybookUrl: 'some-storybook-url',
      specCount: 1,
      testCount: 2,
      changeCount: 3,
      errorCount: 4,
      interactionTestFailuresCount: 5,
      componentCount: 6,
      actualTestCount: 7,
      actualCaptureCount: 8,
      inheritedCaptureCount: 9,
    };

    getParentCommits.mockResolvedValue([commitInfo.commit]);
    client.runQuery.mockReturnValue({ app: { lastBuild } });

    const result = await gatherGitInfo(buildDeps(), buildInput());
    expectKind(result, 'partial');
    expectPhase(result.output, 'rebuild-noop');
    expect(result.output.rebuildForBuild).toEqual(lastBuild);
    expect(result.output.storybookUrl).toEqual(lastBuild.storybookUrl);
  });

  it('returns skip-commit partial when skip matches branch and mutation succeeds', async () => {
    client.runQuery.mockResolvedValue(true);
    const report = vi.fn();
    const result = await gatherGitInfo(buildDeps({ report }), buildInput({ skip: true }));

    expectKind(result, 'partial');
    expectPhase(result.output, 'skip-commit');
    expect(result.output.git.commit).toBe(commitInfo.commit);
    expect(result.output.projectMetadata).toMatchObject({ hasRouter: true });
    expect(report).toHaveBeenCalledWith({
      title: 'Skipping build',
      output: `Skipping build for commit ${result.output.git.commit.slice(0, 7)}`,
    });
  });

  it('throws when skip matches branch but mutation returns falsy', async () => {
    client.runQuery.mockResolvedValue(false);
    await expect(gatherGitInfo(buildDeps(), buildInput({ skip: true }))).rejects.toThrow(
      /Failed to skip build/
    );
  });

  it('removes undefined owner prefix from branch', async () => {
    getCommitAndBranch.mockResolvedValue({ ...commitInfo, branch: 'undefined:repo' });
    const result = await gatherGitInfo(buildDeps(), buildInput());
    expectKind(result, 'continue');
    expect(result.output.git.branch).toBe('repo');
  });

  it('returns projectMetadata', async () => {
    const result = await gatherGitInfo(buildDeps(), buildInput({ isLocalBuild: true }));
    expectKind(result, 'continue');
    expect(result.output.projectMetadata).toMatchObject({
      hasRouter: true,
      creationDate: new Date('2024-11-01'),
      storybookCreationDate: new Date('2025-11-01'),
      numberOfCommitters: 17,
      numberOfAppFiles: 100,
    });
  });
});

describe('invalidChangedFiles bail detail', () => {
  beforeEach(() => {
    getBaselineBuilds.mockResolvedValue([{ commit: '012qwes' } as any]);
  });

  const cases: { name: string; err: Error; subreason: string }[] = [
    {
      name: 'AncestorMissingError',
      err: new AncestorMissingError('012qwes'),
      subreason: 'ancestorMissing',
    },
    {
      name: 'BaselineDirtyError',
      err: new BaselineDirtyError('012qwes'),
      subreason: 'baselineDirty',
    },
    { name: 'NetworkError', err: new NetworkError(), subreason: 'networkError' },
    {
      name: 'ReplacementFailedError',
      err: new ReplacementFailedError(),
      subreason: 'replacementFailed',
    },
    {
      name: 'GitCommandError',
      err: new GitCommandError('git diff'),
      subreason: 'gitCommandFailed',
    },
  ];

  it.each(cases)('classifies $name into $subreason', async ({ err, subreason }) => {
    getChangedFilesWithReplacement.mockRejectedValueOnce(err);

    const result = await gatherGitInfo(buildDeps(), buildInput({ onlyChanged: true }));
    expectKind(result, 'continue');

    expect(result.output.turboSnap?.bailReason).toMatchObject({
      invalidChangedFiles: true,
      bailSubreason: subreason,
      sentryEventId: 'fake-sentry-id',
    });
    expect(result.output.git.changedFiles).toBeUndefined();
    expect(result.output.git.replacementBuildIds).toBeUndefined();

    expect(Sentry.captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({
        tags: { bail_path: 'gitInfo.invalidChangedFiles', bail_detail: subreason },
        fingerprint: [subreason],
      })
    );
  });

  it('leaves bailSubreason undefined and omits fingerprint for a generic error', async () => {
    const err = new Error('something else');
    getChangedFilesWithReplacement.mockRejectedValueOnce(err);

    const result = await gatherGitInfo(buildDeps(), buildInput({ onlyChanged: true }));
    expectKind(result, 'continue');

    expect(result.output.turboSnap?.bailReason).toEqual({
      invalidChangedFiles: true,
      sentryEventId: 'fake-sentry-id',
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({
        tags: { bail_path: 'gitInfo.invalidChangedFiles' },
      })
    );
    const captureContext = vi.mocked(Sentry.captureException).mock.calls.at(-1)?.[1] as any;
    expect(captureContext.tags).not.toHaveProperty('bail_detail');
    expect(captureContext).not.toHaveProperty('fingerprint');
  });
});

describe('applyGitInfoPartial', () => {
  it('writes git, projectMetadata, and exit code on skip-commit', () => {
    const ctx = { runtime: {} } as any;
    const git = { commit: 'abc' } as any;
    const projectMetadata = { hasRouter: true };
    applyGitInfoPartial(ctx, { phase: 'skip-commit', git, projectMetadata });

    expect(ctx.git).toBe(git);
    expect(ctx.projectMetadata).toBe(projectMetadata);
    expect(ctx.exitCode).toBe(0);
    expect(ctx.rebuildForBuildId).toBeUndefined();
    expect(ctx.rebuildForBuild).toBeUndefined();
    expect(ctx.runtime.forceRebuild).toBeUndefined();
  });

  it('writes rebuild-noop fields including rebuildForBuildId, storybookUrl, and forceRebuild', () => {
    const ctx = { runtime: {} } as any;
    const partial = {
      phase: 'rebuild-noop' as const,
      git: { commit: 'abc' } as any,
      projectMetadata: {},
      isOnboarding: true,
      rebuildForBuildId: 'b1',
      rebuildForBuild: { id: 'b1' } as any,
      storybookUrl: 'https://x',
      setForceRebuild: true,
    };
    applyGitInfoPartial(ctx, partial);

    expect(ctx.rebuildForBuildId).toBe('b1');
    expect(ctx.rebuildForBuild).toBe(partial.rebuildForBuild);
    expect(ctx.storybookUrl).toBe('https://x');
    expect(ctx.isOnboarding).toBe(true);
    expect(ctx.runtime.forceRebuild).toBe(true);
    expect(ctx.exitCode).toBe(0);
  });

  it('does not toggle forceRebuild on rebuild-noop when setForceRebuild is false', () => {
    const ctx = { runtime: {} } as any;
    applyGitInfoPartial(ctx, {
      phase: 'rebuild-noop',
      git: {} as any,
      projectMetadata: {},
      isOnboarding: false,
      rebuildForBuildId: 'b1',
      rebuildForBuild: { id: 'b1' } as any,
      storybookUrl: 'https://x',
      setForceRebuild: false,
    });

    expect(ctx.runtime.forceRebuild).toBeUndefined();
  });
});

const baseOutput = (overrides: Partial<GitInfoOutput> = {}): GitInfoOutput => ({
  git: { commit: 'abc' } as any,
  projectMetadata: { hasRouter: true },
  isOnboarding: false,
  turboSnap: undefined,
  build: undefined,
  setForceRebuild: false,
  rebuildForBuildId: undefined,
  ...overrides,
});

describe('applyGitInfoOutput', () => {
  it('writes git, projectMetadata, and isOnboarding on continue', () => {
    const ctx = { runtime: {} } as any;
    const output = baseOutput({ isOnboarding: true });
    applyGitInfoOutput(ctx, output);

    expect(ctx.git).toBe(output.git);
    expect(ctx.projectMetadata).toBe(output.projectMetadata);
    expect(ctx.isOnboarding).toBe(true);
  });

  it('writes turboSnap, build, and rebuildForBuildId when provided', () => {
    const ctx = { runtime: {} } as any;
    const turboSnap = { bailReason: { rebuild: true as const } };
    const build = { id: 'baseline' } as any;
    applyGitInfoOutput(ctx, baseOutput({ turboSnap, build, rebuildForBuildId: 'r1' }));

    expect(ctx.turboSnap).toBe(turboSnap);
    expect(ctx.build).toBe(build);
    expect(ctx.rebuildForBuildId).toBe('r1');
  });

  it('sets runtime.forceRebuild only when setForceRebuild is true', () => {
    const ctx = { runtime: {} } as any;
    applyGitInfoOutput(ctx, baseOutput({ setForceRebuild: true }));
    expect(ctx.runtime.forceRebuild).toBe(true);

    const ctx2 = { runtime: {} } as any;
    applyGitInfoOutput(ctx2, baseOutput({ setForceRebuild: false }));
    expect(ctx2.runtime.forceRebuild).toBeUndefined();
  });
});

describe('extractGitInfoInput', () => {
  it('sets expected fields on context', () => {
    const ctx = {
      runtime: {},
      options: {
        branchName: 'branch',
        ownerName: 'owner',
        repositorySlug: 'repo',
        patchBaseRef: 'base',
        fromCI: true,
        interactive: false,
        isLocalBuild: false,
        skip: false,
        ignoreLastBuildOnBranch: false,
        onlyChanged: false,
        externals: ['foo'],
        untraced: ['bar'],
      },
    } as any;

    const input = extractGitInfoInput(ctx);

    expect(input).toMatchObject({
      branchName: 'branch',
      ownerName: 'owner',
      repositorySlug: 'repo',
      patchBaseRef: 'base',
      fromCI: true,
      interactive: false,
      isLocalBuild: false,
      skip: false,
      ignoreLastBuildOnBranch: false,
      onlyChanged: false,
      externals: ['foo'],
      untraced: ['bar'],
    });
  });
});
