import { getCommitAndBranch } from '../git/getCommitAndBranch';
import { getBaselineCommits, getSlug, getVersion } from '../git/git';
import { setGitInfo } from './gitInfo';

jest.mock('../git/getCommitAndBranch');
jest.mock('../git/git');

const log = { debug: jest.fn() };

describe('setGitInfo', () => {
  it('sets the git info on context', async () => {
    getCommitAndBranch.mockReturnValue(Promise.resolve({ commit: '123asdf', branch: 'something' }));
    getBaselineCommits.mockReturnValue(Promise.resolve(['asd2344']));
    getVersion.mockReturnValue(Promise.resolve('Git v1.0.0'));
    getSlug.mockReturnValue(Promise.resolve('user/repo'));
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
    getCommitAndBranch.mockReturnValue(Promise.resolve({ commit: '123asdf', branch: 'something' }));
    getBaselineCommits.mockReturnValue(Promise.resolve(['asd2344']));
    getVersion.mockReturnValue(Promise.resolve('Git v1.0.0'));
    getSlug.mockReturnValue(Promise.resolve('user/repo'));
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
