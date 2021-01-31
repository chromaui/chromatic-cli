import { getCommitAndBranch } from '../git/getCommitAndBranch';
import { getBaselineCommits, getSlug, getVersion, getChangedFiles } from '../git/git';
import { setGitInfo } from './gitInfo';

jest.mock('../git/getCommitAndBranch');
jest.mock('../git/git');

const log = { debug: jest.fn() };

const client = { runQuery: jest.fn() };
client.runQuery.mockReturnValue({ skipBuild: true });

describe('setGitInfo', () => {
  it('sets the git info on context', async () => {
    getCommitAndBranch.mockReturnValue({ commit: '123asdf', branch: 'something' });
    getBaselineCommits.mockReturnValue(['asd2344']);
    getVersion.mockReturnValue('Git v1.0.0');
    getSlug.mockReturnValue('user/repo');
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
    getCommitAndBranch.mockReturnValue({ commit: '123asdf', branch: 'something' });
    getBaselineCommits.mockReturnValue(['asd2344']);
    getVersion.mockReturnValue('Git v1.0.0');
    getSlug.mockReturnValue('user/repo');
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

  it('skips build when --ignore-changed-files matches all changed files', async () => {
    getCommitAndBranch.mockReturnValue({ commit: '123asdf', branch: 'something' });
    getBaselineCommits.mockReturnValue(['asd2344', 'foobar1']);
    getChangedFiles.mockReturnValue(['foo.js', 'bar/baz.js']);
    getVersion.mockReturnValue('Git v1.0.0');
    getSlug.mockReturnValue('user/repo');
    const ctx = { log, client, options: { ownerName: 'org', ignoreChangedFiles: '**/*.js' } };
    await setGitInfo(ctx, {});
    expect(getChangedFiles).toHaveBeenCalledWith('asd2344', '123asdf');
    expect(getChangedFiles).toHaveBeenCalledWith('foobar1', '123asdf');
    expect(ctx.skip).toBe(true);
    expect(ctx.skipReason).toBe('--ignore-changed-files');
  });
});
