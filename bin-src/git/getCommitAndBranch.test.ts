import envCi from 'env-ci';
import * as git from './git';

import getCommitAndBranch from './getCommitAndBranch';

jest.mock('env-ci');
jest.mock('./git');

const getBranch = <jest.MockedFunction<typeof git.getBranch>>git.getBranch;
const getCommit = <jest.MockedFunction<typeof git.getCommit>>git.getCommit;
const hasPreviousCommit = <jest.MockedFunction<typeof git.hasPreviousCommit>>git.hasPreviousCommit;

const log = { info: jest.fn(), warn: jest.fn(), debug: jest.fn() };

const processEnv = process.env;
beforeEach(() => {
  process.env = { ...processEnv };
  envCi.mockReturnValue({});
  getBranch.mockResolvedValue('main');
  getCommit.mockResolvedValue({
    commit: '48e0c83fadbf504c191bc868040b7a969a4f1feb',
    committedAt: 1640094096000,
    committerName: 'GitHub',
    committerEmail: 'noreply@github.com',
  });
  hasPreviousCommit.mockResolvedValue(true);
});

afterEach(() => {
  envCi.mockReset();
  getBranch.mockReset();
  getCommit.mockReset();
});

const commitInfo = {
  committedAt: 1640131292,
  committerName: 'Gert Hengeveld',
  committerEmail: 'gert@chromatic.com',
};

describe('getCommitAndBranch', () => {
  it('returns commit and branch info', async () => {
    const info = await getCommitAndBranch({ log });
    expect(info).toMatchObject({
      branch: 'main',
      commit: '48e0c83fadbf504c191bc868040b7a969a4f1feb',
      committedAt: 1640094096000,
      committerName: 'GitHub',
      committerEmail: 'noreply@github.com',
      slug: undefined,
    });
  });

  it('retrieves CI context', async () => {
    envCi.mockReturnValue({
      isCi: true,
      service: 'ci-service',
      branch: 'ci-branch',
      commit: 'ci-commit',
      slug: 'chromaui/env-ci',
    });
    getBranch.mockResolvedValue('HEAD');
    getCommit.mockImplementation((commit) => Promise.resolve({ commit, ...commitInfo }));
    const info = await getCommitAndBranch({ log });
    expect(info).toMatchObject({
      branch: 'ci-branch',
      commit: 'ci-commit',
      slug: 'chromaui/env-ci',
      fromCI: true,
      ciService: 'ci-service',
    });
  });

  it('prefers prBranch over ciBranch', async () => {
    envCi.mockReturnValue({
      branch: 'ci-branch',
      prBranch: 'ci-pr-branch',
    });
    getBranch.mockResolvedValue('HEAD');
    const info = await getCommitAndBranch({ log });
    expect(info).toMatchObject({ branch: 'ci-pr-branch' });
  });

  it('removes origin/ prefix in branch name', async () => {
    getBranch.mockResolvedValue('origin/master');
    const info = await getCommitAndBranch({ log });
    expect(info).toMatchObject({ branch: 'master' });
  });

  it('throws when there is only one commit', async () => {
    hasPreviousCommit.mockResolvedValue(false);
    await expect(getCommitAndBranch({ log })).rejects.toThrow('Found only one commit');
  });

  describe('with branchName', () => {
    it('uses provided branchName as branch', async () => {
      const info = await getCommitAndBranch({ log }, { branchName: 'foobar' });
      expect(info).toMatchObject({ branch: 'foobar' });
    });

    it('does not remove origin/ prefix in branch name', async () => {
      const info = await getCommitAndBranch({ log }, { branchName: 'origin/foobar' });
      expect(info).toMatchObject({ branch: 'origin/foobar' });
    });
  });

  describe('with patchBaseRef', () => {
    it('uses provided patchBaseRef as branch', async () => {
      const info = await getCommitAndBranch({ log }, { patchBaseRef: 'foobar' });
      expect(info).toMatchObject({ branch: 'foobar' });
    });

    it('prefers branchName over patchBaseRef', async () => {
      const info = await getCommitAndBranch({ log }, { branchName: 'foo', patchBaseRef: 'bar' });
      expect(info).toMatchObject({ branch: 'foo' });
    });
  });

  describe('with chromatic env vars', () => {
    it('sets the expected info', async () => {
      process.env.CHROMATIC_SHA = 'f78db92d';
      process.env.CHROMATIC_BRANCH = 'feature';
      process.env.CHROMATIC_SLUG = 'chromaui/chromatic';
      getCommit.mockImplementation((commit) => Promise.resolve({ commit, ...commitInfo }));
      const info = await getCommitAndBranch({ log });
      expect(info).toMatchObject({
        branch: 'feature',
        commit: 'f78db92d',
        ...commitInfo,
        slug: 'chromaui/chromatic',
      });
    });

    it('falls back to the provided SHA when commit cannot be retrieved', async () => {
      process.env.CHROMATIC_SHA = 'f78db92d';
      process.env.CHROMATIC_BRANCH = 'feature';
      getCommit
        .mockResolvedValueOnce({
          commit: '48e0c83fadbf504c191bc868040b7a969a4f1feb',
          ...commitInfo,
        })
        .mockRejectedValueOnce(
          new Error('fatal: bad object 48e0c83fadbf504c191bc868040b7a969a4f1feb')
        );
      const info = await getCommitAndBranch({ log });
      expect(info).toMatchObject({ branch: 'feature', commit: 'f78db92d' });
      expect(log.warn).toHaveBeenCalledWith(expect.stringMatching('Commit f78db92 does not exist'));
    });

    it('does not remove origin/ prefix in branch name', async () => {
      process.env.CHROMATIC_SHA = 'f78db92d';
      process.env.CHROMATIC_BRANCH = 'origin/feature';
      const info = await getCommitAndBranch({ log });
      expect(info).toMatchObject({ branch: 'origin/feature' });
    });
  });

  describe('GitHub PR build', () => {
    it('sets the expected info', async () => {
      process.env.GITHUB_EVENT_NAME = 'pull_request';
      process.env.GITHUB_HEAD_REF = 'github';
      process.env.GITHUB_REPOSITORY = 'chromaui/github';
      process.env.GITHUB_SHA = '3276c796';
      getCommit.mockResolvedValue({ commit: 'c11da9a9', ...commitInfo });
      const info = await getCommitAndBranch({ log });
      expect(getCommit).toHaveBeenCalledWith('github');
      expect(info).toMatchObject({
        branch: 'github',
        commit: 'c11da9a9',
        ...commitInfo,
        slug: 'chromaui/github',
      });
    });

    it('throws on missing variable', async () => {
      process.env.GITHUB_EVENT_NAME = 'pull_request';
      process.env.GITHUB_HEAD_REF = 'github';
      await expect(getCommitAndBranch({ log })).rejects.toThrow(
        'Missing GitHub environment variable'
      );
      process.env.GITHUB_HEAD_REF = '';
      process.env.GITHUB_SHA = '3276c796';
      await expect(getCommitAndBranch({ log })).rejects.toThrow(
        'Missing GitHub environment variable'
      );
    });

    it('throws on cross-fork PR (where refs are equal)', async () => {
      process.env.GITHUB_EVENT_NAME = 'pull_request';
      process.env.GITHUB_BASE_REF = 'github';
      process.env.GITHUB_HEAD_REF = 'github';
      process.env.GITHUB_SHA = '3276c796';
      await expect(getCommitAndBranch({ log })).rejects.toThrow('Cross-fork PR builds unsupported');
    });
  });

  describe('Travis PR build', () => {
    it('sets the expected info', async () => {
      process.env.TRAVIS_EVENT_TYPE = 'pull_request';
      process.env.TRAVIS_PULL_REQUEST_SHA = 'ef765ac7';
      process.env.TRAVIS_PULL_REQUEST_BRANCH = 'travis';
      process.env.TRAVIS_PULL_REQUEST_SLUG = 'chromaui/travis';
      getCommit.mockImplementation((commit) => Promise.resolve({ commit, ...commitInfo }));
      const info = await getCommitAndBranch({ log });
      expect(info).toMatchObject({
        branch: 'travis',
        commit: 'ef765ac7',
        ...commitInfo,
        slug: 'chromaui/travis',
      });
    });

    it('throws on missing variable', async () => {
      process.env.TRAVIS_EVENT_TYPE = 'pull_request';
      process.env.TRAVIS_PULL_REQUEST_SHA = 'ef765ac7';
      await expect(getCommitAndBranch({ log })).rejects.toThrow(
        'Missing Travis environment variable'
      );
    });
  });
});
