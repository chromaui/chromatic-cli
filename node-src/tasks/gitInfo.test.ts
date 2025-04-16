import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getBaselineBuilds as getBaselineBuildsUnmocked } from '../git/getBaselineBuilds';
import { getChangedFilesWithReplacement as getChangedFilesWithReplacementUnmocked } from '../git/getChangedFilesWithReplacement';
import * as getCommitInfo from '../git/getCommitAndBranch';
import { getParentCommits as getParentCommitsUnmocked } from '../git/getParentCommits';
import * as git from '../git/git';
import { getHasRouter as getHasRouterUnmocked } from '../lib/getHasRouter';
import { setGitInfo } from './gitInfo';

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
const getNumberOfComitters = vi.mocked(git.getNumberOfComitters);
const getCommittedFileCount = vi.mocked(git.getCommittedFileCount);
const getUncommittedHash = vi.mocked(git.getUncommittedHash);
const getBaselineBuilds = vi.mocked(getBaselineBuildsUnmocked);
const getParentCommits = vi.mocked(getParentCommitsUnmocked);
const getHasRouter = vi.mocked(getHasRouterUnmocked);

const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() };

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
  getNumberOfComitters.mockResolvedValue(17);
  getCommittedFileCount.mockResolvedValue(100);
  getHasRouter.mockReturnValue(true);

  client.runQuery.mockReturnValue({ app: { isOnboarding: false } });
});

describe('setGitInfo', () => {
  it('sets the git info on context', async () => {
    const ctx = { log, options: {}, client } as any;
    await setGitInfo(ctx, {} as any);
    expect(ctx.git).toMatchObject({
      rootPath: '/path/to/project',
      commit: '123asdf',
      branch: 'something',
      parentCommits: ['asd2344'],
      version: 'Git v1.0.0',
      slug: 'user/repo',
    });
  });

  it('sets gitUserEmail to current user for local builds', async () => {
    const ctx = { log, options: { isLocalBuild: true }, client } as any;
    await setGitInfo(ctx, {} as any);
    expect(ctx.git).toMatchObject({
      gitUserEmail: 'user@email.com',
    });
  });

  it('supports overriding the owner name in the slug', async () => {
    const ctx = { log, options: { ownerName: 'org' }, client } as any;
    await setGitInfo(ctx, {} as any);
    expect(ctx.git).toMatchObject({ slug: 'org/repo' });
  });

  it('sets changedFiles', async () => {
    getBaselineBuilds.mockResolvedValue([{ commit: '012qwes' } as any]);
    getChangedFilesWithReplacement.mockResolvedValue({
      changedFiles: ['styles/main.scss', 'lib/utils.js'],
    });
    const ctx = { log, options: { onlyChanged: true }, client } as any;
    await setGitInfo(ctx, {} as any);
    expect(ctx.git.changedFiles).toEqual(['styles/main.scss', 'lib/utils.js']);
    expect(ctx.git.replacementBuildIds).toEqual([]);
  });

  it('sets changedFiles on a branch name containing a slash', async () => {
    getCommitAndBranch.mockResolvedValue({
      ...commitInfo,
      branch: 'something/else',
    });
    getBaselineBuilds.mockResolvedValue([{ commit: '012qwes' } as any]);
    getChangedFilesWithReplacement.mockResolvedValue({
      changedFiles: ['styles/main.scss', 'lib/utils.js'],
    });
    const ctx = { log, options: { onlyChanged: '!(main)' }, client } as any;
    await setGitInfo(ctx, {} as any);
    expect(ctx.git.changedFiles).toEqual(['styles/main.scss', 'lib/utils.js']);
    expect(ctx.git.replacementBuildIds).toEqual([]);
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
    const ctx = { log, options: { onlyChanged: true }, client } as any;
    await setGitInfo(ctx, {} as any);
    expect(ctx.git.changedFiles).toEqual(['styles/main.scss', 'lib/utils.js']);
    expect(ctx.git.replacementBuildIds).toEqual([['rebased', 'parent']]);
  });

  it('drops changedFiles when matching --externals', async () => {
    getBaselineBuilds.mockResolvedValue([{ commit: '012qwes' } as any]);
    getChangedFilesWithReplacement.mockResolvedValue({
      changedFiles: ['styles/main.scss', 'lib/utils.js'],
    });
    const ctx = { log, options: { onlyChanged: true, externals: ['**/*.scss'] }, client } as any;
    await setGitInfo(ctx, {} as any);
    expect(ctx.git.changedFiles).toBeUndefined();
  });

  it('forces rebuild automatically if app is onboarding', async () => {
    client.runQuery.mockReturnValue({ app: { isOnboarding: true } });
    const ctx = { log, options: { ownerName: 'org' }, client } as any;
    await setGitInfo(ctx, {} as any);
    expect(ctx.options.forceRebuild).toBe(true);
  });

  it('sets storybookUrl and rebuildForBuild on skipped rebuild', async () => {
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

    const ctx = { log, options: {}, client } as any;
    await setGitInfo(ctx, {} as any);
    expect(ctx.rebuildForBuild).toEqual(lastBuild);
    expect(ctx.storybookUrl).toEqual(lastBuild.storybookUrl);
  });

  it('removes undefined owner prefix from branch', async () => {
    const ctx = { log, options: {}, client } as any;
    getCommitAndBranch.mockResolvedValue({
      ...commitInfo,
      branch: 'undefined:repo',
    });
    await setGitInfo(ctx, {} as any);
    expect(ctx.git.branch).toBe('repo');
  });

  it('sets projectMetadata on context', async () => {
    const ctx = { log, options: { isLocalBuild: true }, client } as any;
    await setGitInfo(ctx, {} as any);
    expect(ctx.projectMetadata).toMatchObject({
      hasRouter: true,
      creationDate: new Date('2024-11-01'),
      storybookCreationDate: new Date('2025-11-01'),
      numberOfCommitters: 17,
      numberOfAppFiles: 100,
    });
  });
});
