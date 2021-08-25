import { getCommitAndBranch } from '../git/getCommitAndBranch';
import {
  getBaselineBuilds,
  getChangedFiles,
  getParentCommits,
  getSlug,
  getVersion,
} from '../git/git';
import { setGitInfo } from './gitInfo';

jest.mock('../git/getCommitAndBranch');
jest.mock('../git/git');

const log = { warn: jest.fn(), debug: jest.fn() };

beforeEach(() => {
  getCommitAndBranch.mockResolvedValue({ commit: '123asdf', branch: 'something' });
  getParentCommits.mockResolvedValue(['asd2344']);
  getBaselineBuilds.mockResolvedValue([]);
  getChangedFiles.mockResolvedValue([]);
  getVersion.mockResolvedValue('Git v1.0.0');
  getSlug.mockResolvedValue('user/repo');
});

describe('setGitInfo', () => {
  it('sets the git info on context', async () => {
    const ctx = { log, options: {} };
    await setGitInfo(ctx, {});
    expect(ctx.git).toMatchObject({
      commit: '123asdf',
      branch: 'something',
      parentCommits: ['asd2344'],
      version: 'Git v1.0.0',
      slug: 'user/repo',
    });
  });

  it('supports overriding the owner name in the slug', async () => {
    const ctx = { log, options: { ownerName: 'org' } };
    await setGitInfo(ctx, {});
    expect(ctx.git).toMatchObject({ slug: 'org/repo' });
  });

  it('sets changedFiles', async () => {
    getBaselineBuilds.mockResolvedValue([{ commit: '012qwes' }]);
    getChangedFiles.mockResolvedValue(['styles/main.scss', 'lib/utils.js']);
    const ctx = { log, options: { onlyChanged: true } };
    await setGitInfo(ctx, {});
    expect(ctx.git.changedFiles).toEqual(['styles/main.scss', 'lib/utils.js']);
  });

  it('drops changedFiles when matching --externals', async () => {
    getBaselineBuilds.mockResolvedValue([{ commit: '012qwes' }]);
    getChangedFiles.mockResolvedValue(['styles/main.scss', 'lib/utils.js']);
    const ctx = { log, options: { onlyChanged: true, externals: ['*.scss'] } };
    await setGitInfo(ctx, {});
    expect(ctx.git.changedFiles).toBeNull();
  });
});
