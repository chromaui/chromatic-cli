import * as getCommitInfo from '../git/getCommitAndBranch';
import * as git from '../git/git';
import { setGitInfo } from './gitInfo';

jest.mock('../git/getCommitAndBranch');
jest.mock('../git/git');

const getCommitAndBranch = <jest.MockedFunction<typeof getCommitInfo.default>>getCommitInfo.default;
const getBaselineBuilds = <jest.MockedFunction<typeof git.getBaselineBuilds>>git.getBaselineBuilds;
const getChangedFiles = <jest.MockedFunction<typeof git.getChangedFiles>>git.getChangedFiles;
const getParentCommits = <jest.MockedFunction<typeof git.getParentCommits>>git.getParentCommits;
const getSlug = <jest.MockedFunction<typeof git.getSlug>>git.getSlug;
const getVersion = <jest.MockedFunction<typeof git.getVersion>>git.getVersion;

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

beforeEach(() => {
  getCommitAndBranch.mockResolvedValue(commitInfo);
  getParentCommits.mockResolvedValue(['asd2344']);
  getBaselineBuilds.mockResolvedValue([]);
  getChangedFiles.mockResolvedValue([]);
  getVersion.mockResolvedValue('Git v1.0.0');
  getSlug.mockResolvedValue('user/repo');
});

describe('setGitInfo', () => {
  it('sets the git info on context', async () => {
    const ctx = { log, options: {} } as any;
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
    const ctx = { log, options: { ownerName: 'org' } } as any;
    await setGitInfo(ctx, {} as any);
    expect(ctx.git).toMatchObject({ slug: 'org/repo' });
  });

  it('sets changedFiles', async () => {
    getBaselineBuilds.mockResolvedValue([{ commit: '012qwes' } as any]);
    getChangedFiles.mockResolvedValue(['styles/main.scss', 'lib/utils.js']);
    const ctx = { log, options: { onlyChanged: true } } as any;
    await setGitInfo(ctx, {} as any);
    expect(ctx.git.changedFiles).toEqual(['styles/main.scss', 'lib/utils.js']);
  });

  it('drops changedFiles when matching --externals', async () => {
    getBaselineBuilds.mockResolvedValue([{ commit: '012qwes' } as any]);
    getChangedFiles.mockResolvedValue(['styles/main.scss', 'lib/utils.js']);
    const ctx = { log, options: { onlyChanged: true, externals: ['**/*.scss'] } } as any;
    await setGitInfo(ctx, {} as any);
    expect(ctx.git.changedFiles).toBeNull();
  });
});
