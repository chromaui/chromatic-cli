import * as getCommitInfo from '../git/getCommitAndBranch';
import * as git from '../git/git';
import { getParentCommits as getParentCommitsUnmocked } from '../git/getParentCommits';
import { getBaselineBuilds as getBaselineBuildsUnmocked } from '../git/getBaselineBuilds';
import { getChangedFilesWithReplacement as getChangedFilesWithReplacementUnmocked } from '../git/getChangedFilesWithReplacement';
import { setGitInfo } from './gitInfo';

jest.mock('../git/getCommitAndBranch');
jest.mock('../git/git');
jest.mock('../git/getParentCommits');
jest.mock('../git/getBaselineBuilds');
jest.mock('../git/getChangedFilesWithReplacement');

const getCommitAndBranch = <jest.MockedFunction<typeof getCommitInfo.default>>getCommitInfo.default;
const getChangedFilesWithReplacement = <
  jest.MockedFunction<typeof getChangedFilesWithReplacementUnmocked>
>getChangedFilesWithReplacementUnmocked;
const getSlug = <jest.MockedFunction<typeof git.getSlug>>git.getSlug;
const getVersion = <jest.MockedFunction<typeof git.getVersion>>git.getVersion;

const getBaselineBuilds = <jest.MockedFunction<typeof getBaselineBuildsUnmocked>>(
  getBaselineBuildsUnmocked
);
const getParentCommits = <jest.MockedFunction<typeof getParentCommitsUnmocked>>(
  getParentCommitsUnmocked
);

const log = { info: jest.fn(), warn: jest.fn(), debug: jest.fn() };

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
const client = { runQuery: jest.fn(), setAuthorization: jest.fn() };

beforeEach(() => {
  getCommitAndBranch.mockResolvedValue(commitInfo);
  getParentCommits.mockResolvedValue(['asd2344']);
  getBaselineBuilds.mockResolvedValue([]);
  getChangedFilesWithReplacement.mockResolvedValue({ changedFiles: [] });
  getVersion.mockResolvedValue('Git v1.0.0');
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
