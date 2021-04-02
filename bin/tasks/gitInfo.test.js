import { getCommitAndBranch } from '../git/getCommitAndBranch';
import { getBaselineCommits, getSlug, getVersion } from '../git/git';
import { setGitInfo } from './gitInfo';

jest.mock('../git/getCommitAndBranch');
jest.mock('../git/git');

const log = { debug: jest.fn() };

describe('setGitInfo', () => {
  it('sets the git info on context', async () => {
    getCommitAndBranch.mockResolvedValue({ commit: '123asdf', branch: 'something' });
    getBaselineCommits.mockResolvedValue(['asd2344']);
    getVersion.mockResolvedValue('Git v1.0.0');
    getSlug.mockResolvedValue('user/repo');
    const ctx = { log, options: {} };
    await setGitInfo(ctx, {});
    expect(ctx.git).toMatchObject({
      commit: '123asdf',
      branch: 'something',
      baselineCommits: ['asd2344'],
      version: 'Git v1.0.0',
      slug: 'user/repo',
    });
  });

  it('supports overriding the owner name in the slug', async () => {
    getCommitAndBranch.mockResolvedValue({ commit: '123asdf', branch: 'something' });
    getBaselineCommits.mockResolvedValue(['asd2344']);
    getVersion.mockResolvedValue('Git v1.0.0');
    getSlug.mockResolvedValue('user/repo');
    const ctx = { log, options: { ownerName: 'org' } };
    await setGitInfo(ctx, {});
    expect(ctx.git).toMatchObject({
      commit: '123asdf',
      branch: 'something',
      baselineCommits: ['asd2344'],
      version: 'Git v1.0.0',
      slug: 'org/repo',
    });
  });
});
