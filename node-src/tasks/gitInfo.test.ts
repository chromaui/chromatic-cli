import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getBaselineBuilds as getBaselineBuildsUnmocked } from '../git/getBaselineBuilds';
import { getChangedFilesWithReplacement as getChangedFilesWithReplacementUnmocked } from '../git/getChangedFilesWithReplacement';
import * as getCommitInfo from '../git/getCommitAndBranch';
import { getParentCommits as getParentCommitsUnmocked } from '../git/getParentCommits';
import * as git from '../git/git';
import { setGitInfo } from './gitInfo';

vi.mock('../git/getCommitAndBranch');
vi.mock('../git/git');
vi.mock('../git/getParentCommits');
vi.mock('../git/getBaselineBuilds');
vi.mock('../git/getChangedFilesWithReplacement');

const getCommitAndBranch = vi.mocked(getCommitInfo.default);
const getChangedFilesWithReplacement = vi.mocked(getChangedFilesWithReplacementUnmocked);
const getSlug = vi.mocked(git.getSlug);
const getVersion = vi.mocked(git.getVersion);
const getUserEmail = vi.mocked(git.getUserEmail);
const getUncommittedHash = vi.mocked(git.getUncommittedHash);
const getBaselineBuilds = vi.mocked(getBaselineBuildsUnmocked);
const getParentCommits = vi.mocked(getParentCommitsUnmocked);

const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() };

const commitInfo = {
  commit: '123asdf',
  committedAt: 1640131292,
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
  client.runQuery.mockReturnValue({ app: { isOnboarding: false } });
});

describe('setGitInfo', () => {
  it('sets the git info on context', async () => {
    const ctx = { log, options: {}, client } as any;
    await setGitInfo(ctx, {} as any);
    expect(ctx.git).toMatchObject({
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
    expect(ctx.git.changedFiles).toBeNull();
  });

  it('forces rebuild automatically if app is onboarding', async () => {
    client.runQuery.mockReturnValue({ app: { isOnboarding: true } });
    const ctx = { log, options: { ownerName: 'org' }, client } as any;
    await setGitInfo(ctx, {} as any);
    expect(ctx.options.forceRebuild).toBe(true);
  });
});
