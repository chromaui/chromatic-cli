import { getCommitAndBranch } from '../git/getCommitAndBranch';
import { getBaselineCommits, getVersion } from '../git/git';
import { setGitInfo } from './gitInfo';

jest.mock('../git/getCommitAndBranch');
jest.mock('../git/git');

const log = { debug: jest.fn() };

describe('setGitInfo', () => {
  it('sets the git info on context', async () => {
    getCommitAndBranch.mockReturnValue({ commit: '123asdf', branch: 'something' });
    getBaselineCommits.mockReturnValue(['asd2344']);
    getVersion.mockReturnValue('Git v1.0.0');
    const ctx = { log, options: {} };
    await setGitInfo(ctx, {});
    expect(ctx.git).toMatchObject({
      commit: '123asdf',
      branch: 'something',
      baselineCommits: ['asd2344'],
      version: 'Git v1.0.0',
    });
  });
});
