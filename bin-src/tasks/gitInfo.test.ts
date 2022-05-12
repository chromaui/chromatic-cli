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

beforeEach(() => {
  getCommitAndBranch.mockResolvedValue(commitInfo);
  getParentCommits.mockResolvedValue(['asd2344']);
  getBaselineBuilds.mockResolvedValue([]);
  getChangedFilesWithReplacement.mockResolvedValue({ changedFiles: [] });
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
    getChangedFilesWithReplacement.mockResolvedValue({
      changedFiles: ['styles/main.scss', 'lib/utils.js'],
    });
    const ctx = { log, options: { onlyChanged: true } } as any;
    await setGitInfo(ctx, {} as any);
    expect(ctx.git.changedFiles).toEqual(['styles/main.scss', 'lib/utils.js']);
    expect(ctx.git.replacementCommits).toEqual([]);
  });

  it('sets replacementCommits when found', async () => {
    getBaselineBuilds.mockResolvedValue([{ commit: '012qwes' } as any]);
    getChangedFilesWithReplacement.mockResolvedValue({
      changedFiles: ['styles/main.scss', 'lib/utils.js'],
      replacementBuild: {
        id: 'old',
        number: 1,
        commit: '987bca',
      },
    });
    const ctx = { log, options: { onlyChanged: true } } as any;
    await setGitInfo(ctx, {} as any);
    expect(ctx.git.changedFiles).toEqual(['styles/main.scss', 'lib/utils.js']);
    expect(ctx.git.replacementCommits).toEqual([['012qwes', '987bca']]);
  });

  it('drops changedFiles when matching --externals', async () => {
    getBaselineBuilds.mockResolvedValue([{ commit: '012qwes' } as any]);
    getChangedFilesWithReplacement.mockResolvedValue({
      changedFiles: ['styles/main.scss', 'lib/utils.js'],
    });
    const ctx = { log, options: { onlyChanged: true, externals: ['**/*.scss'] } } as any;
    await setGitInfo(ctx, {} as any);
    expect(ctx.git.changedFiles).toBeNull();
  });
});
