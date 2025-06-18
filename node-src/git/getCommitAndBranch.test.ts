import envCi from 'env-ci';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Logger } from '../lib/log';
import type { Context } from '../types';
import * as mergeQueue from './getBranchFromMergeQueuePullRequestNumber';
import getCommitAndBranch from './getCommitAndBranch';
import * as git from './git';

vi.mock('env-ci');
vi.mock('./git');
vi.mock('./getBranchFromMergeQueuePullRequestNumber');

const getBranch = vi.mocked(git.getBranch);
const getCommit = vi.mocked(git.getCommit);
const hasPreviousCommit = vi.mocked(git.hasPreviousCommit);
const getBranchFromMergeQueue = vi.mocked(mergeQueue.getBranchFromMergeQueuePullRequestNumber);
const mergeQueueBranchMatch = vi.mocked(git.mergeQueueBranchMatch);

const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() } as unknown as Logger;
const ctx = { log } as unknown as Context;

beforeEach(() => {
  // clear out the CI environment variables we use
  // so we can customize what is present per test
  for (const environment of [
    'CHROMATIC_BRANCH',
    'CHROMATIC_PULL_REQUEST_SHA',
    'CHROMATIC_SHA',
    'CHROMATIC_SLUG',
    'CI_BRANCH',
    'CI',
    'GERRIT_BRANCH',
    'GITHUB_ACTIONS',
    'GITHUB_BASE_REF',
    'GITHUB_EVENT_NAME',
    'GITHUB_HEAD_REF',
    'GITHUB_REF',
    'GITHUB_REPOSITORY',
    'GITHUB_SHA',
    'HEAD',
    'REPOSITORY_URL',
    'TRAVIS_COMMIT',
    'TRAVIS_EVENT_TYPE',
    'TRAVIS_PULL_REQUEST_BRANCH',
    'TRAVIS_PULL_REQUEST_SHA',
    'TRAVIS_PULL_REQUEST_SLUG',
    'TRAVIS_REPO_SLUG',
  ]) {
    vi.stubEnv(environment, '');
  }
  envCi.mockReturnValue({});
  getBranch.mockResolvedValue('main');
  getCommit.mockResolvedValue({
    commit: '48e0c83fadbf504c191bc868040b7a969a4f1feb',
    committedAt: 1_640_094_096_000,
    committerName: 'GitHub',
    committerEmail: 'noreply@github.com',
  });
  hasPreviousCommit.mockResolvedValue(true);
  mergeQueueBranchMatch.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  envCi.mockReset();
  getBranch.mockReset();
  getCommit.mockReset();
  getBranchFromMergeQueue.mockReset();
});

const commitInfo = {
  committedAt: 1_640_131_292,
  committerName: 'Gert Hengeveld',
  committerEmail: 'gert@chromatic.com',
};

describe('getCommitAndBranch', () => {
  it('returns commit and branch info', async () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'push');

    const info = await getCommitAndBranch(ctx);
    expect(info).toMatchObject({
      branch: 'main',
      commit: '48e0c83fadbf504c191bc868040b7a969a4f1feb',
      committedAt: 1_640_094_096_000,
      committerName: 'GitHub',
      committerEmail: 'noreply@github.com',
      slug: undefined,
    });
  });

  it('recovers from errors inside env-ci', async () => {
    envCi.mockImplementation(() => {
      throw new Error('oh no');
    });

    getBranch.mockResolvedValue('HEAD');
    getCommit.mockImplementation((_, commit) =>
      Promise.resolve({ commit: commit as string, ...commitInfo })
    );
    const info = await getCommitAndBranch(ctx);
    expect(info).toMatchObject({
      branch: 'HEAD',
      fromCI: false,
    });
  });

  it('retrieves CI context', async () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'push');

    envCi.mockReturnValue({
      isCi: true,
      service: 'ci-service',
      branch: 'ci-branch',
      commit: 'ci-commit',
      slug: 'chromaui/env-ci',
    });
    getBranch.mockResolvedValue('HEAD');
    getCommit.mockImplementation((_, commit) =>
      Promise.resolve({ commit: commit as string, ...commitInfo })
    );
    const info = await getCommitAndBranch(ctx);
    expect(info).toMatchObject({
      branch: 'ci-branch',
      commit: 'ci-commit',
      slug: 'chromaui/env-ci',
      fromCI: true,
      ciService: 'ci-service',
    });
  });

  it('prefers prBranch over ciBranch', async () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'push');

    envCi.mockReturnValue({
      branch: 'ci-branch',
      prBranch: 'ci-pr-branch',
    });
    getBranch.mockResolvedValue('HEAD');
    const info = await getCommitAndBranch(ctx);
    expect(info).toMatchObject({ branch: 'ci-pr-branch' });
  });

  it('removes origin/ prefix in branch name', async () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'push');

    getBranch.mockResolvedValue('origin/main');
    const info = await getCommitAndBranch(ctx);
    expect(info).toMatchObject({ branch: 'main' });
  });

  it('throws when there is only one commit, CI', async () => {
    envCi.mockReturnValue({ isCi: true });
    hasPreviousCommit.mockResolvedValue(false);
    await expect(getCommitAndBranch(ctx)).rejects.toThrow('Found only one commit');
  });

  it('does NOT throw when there is only one commit, non-CI', async () => {
    envCi.mockReturnValue({ isCi: false });
    hasPreviousCommit.mockResolvedValue(false);
    const info = await getCommitAndBranch(ctx);
    expect(info).toMatchObject({});
  });

  describe('with branchName', () => {
    it('uses provided branchName as branch', async () => {
      vi.stubEnv('GITHUB_EVENT_NAME', 'push');

      const info = await getCommitAndBranch(ctx, { branchName: 'foobar' });
      expect(info).toMatchObject({ branch: 'foobar' });
    });

    it('does not remove origin/ prefix in branch name', async () => {
      vi.stubEnv('GITHUB_EVENT_NAME', 'push');

      const info = await getCommitAndBranch(ctx, { branchName: 'origin/foobar' });
      expect(info).toMatchObject({ branch: 'origin/foobar' });
    });
  });

  describe('with patchBaseRef', () => {
    it('uses provided patchBaseRef as branch', async () => {
      vi.stubEnv('GITHUB_EVENT_NAME', 'push');

      const info = await getCommitAndBranch(ctx, { patchBaseRef: 'foobar' });
      expect(info).toMatchObject({ branch: 'foobar' });
    });

    it('prefers branchName over patchBaseRef', async () => {
      vi.stubEnv('GITHUB_EVENT_NAME', 'push');

      const info = await getCommitAndBranch(ctx, { branchName: 'foo', patchBaseRef: 'bar' });
      expect(info).toMatchObject({ branch: 'foo' });
    });
  });

  describe('with chromatic env vars', () => {
    it('sets the expected info', async () => {
      vi.stubEnv('CHROMATIC_SHA', 'f78db92d');
      vi.stubEnv('CHROMATIC_BRANCH', 'feature');
      vi.stubEnv('CHROMATIC_SLUG', 'chromaui/chromatic');
      getCommit.mockImplementation((_, commit) =>
        Promise.resolve({ commit: commit as string, ...commitInfo })
      );
      const info = await getCommitAndBranch(ctx);
      expect(info).toMatchObject({
        branch: 'feature',
        commit: 'f78db92d',
        ...commitInfo,
        slug: 'chromaui/chromatic',
      });
    });

    it('falls back to the provided SHA when commit cannot be retrieved', async () => {
      vi.stubEnv('CHROMATIC_SHA', 'f78db92d');
      vi.stubEnv('CHROMATIC_BRANCH', 'feature');
      getCommit
        .mockResolvedValueOnce({
          commit: '48e0c83fadbf504c191bc868040b7a969a4f1feb',
          ...commitInfo,
        })
        .mockRejectedValueOnce(
          new Error('fatal: bad object 48e0c83fadbf504c191bc868040b7a969a4f1feb')
        );
      const info = await getCommitAndBranch(ctx);
      expect(info).toMatchObject({ branch: 'feature', commit: 'f78db92d' });
      expect(log.warn).toHaveBeenCalledWith(expect.stringMatching('Commit f78db92 does not exist'));
    });

    it('does not remove origin/ prefix in branch name', async () => {
      vi.stubEnv('CHROMATIC_SHA', 'f78db92d');
      vi.stubEnv('CHROMATIC_BRANCH', 'origin/feature');
      const info = await getCommitAndBranch(ctx);
      expect(info).toMatchObject({ branch: 'origin/feature' });
    });
  });

  describe('GitHub PR build', () => {
    it('sets the expected info', async () => {
      vi.stubEnv('GITHUB_EVENT_NAME', 'pull_request');
      vi.stubEnv('GITHUB_HEAD_REF', 'github');
      vi.stubEnv('GITHUB_REPOSITORY', 'chromaui/github');
      vi.stubEnv('GITHUB_SHA', '3276c796');
      getCommit.mockResolvedValue({ commit: 'c11da9a9', ...commitInfo });
      const info = await getCommitAndBranch(ctx);
      expect(getCommit).toHaveBeenCalledWith(ctx, 'github');
      expect(info).toMatchObject({
        branch: 'github',
        commit: 'c11da9a9',
        ...commitInfo,
        slug: 'chromaui/github',
      });
    });

    it('throws on missing variable', async () => {
      vi.stubEnv('GITHUB_EVENT_NAME', 'pull_request');
      vi.stubEnv('GITHUB_HEAD_REF', 'github');
      vi.stubEnv('GITHUB_SHA', '');
      await expect(getCommitAndBranch(ctx)).rejects.toThrow('Missing GitHub environment variable');
      vi.stubEnv('GITHUB_HEAD_REF', '');
      vi.stubEnv('GITHUB_SHA', '3276c796');
      await expect(getCommitAndBranch(ctx)).rejects.toThrow('Missing GitHub environment variable');
    });

    it('throws on cross-fork PR (where refs are equal)', async () => {
      vi.stubEnv('GITHUB_EVENT_NAME', 'pull_request');
      vi.stubEnv('GITHUB_BASE_REF', 'github');
      vi.stubEnv('GITHUB_HEAD_REF', 'github');
      vi.stubEnv('GITHUB_SHA', '3276c796');
      await expect(getCommitAndBranch(ctx)).rejects.toThrow('Cross-fork PR builds unsupported');
    });
  });

  describe('Travis PR build', () => {
    it('sets the expected info', async () => {
      vi.stubEnv('TRAVIS_EVENT_TYPE', 'pull_request');
      vi.stubEnv('TRAVIS_PULL_REQUEST_SHA', 'ef765ac7');
      vi.stubEnv('TRAVIS_PULL_REQUEST_BRANCH', 'travis');
      vi.stubEnv('TRAVIS_PULL_REQUEST_SLUG', 'chromaui/travis');
      getCommit.mockImplementation((_, commit) =>
        Promise.resolve({ commit: commit as string, ...commitInfo })
      );
      const info = await getCommitAndBranch(ctx);
      expect(info).toMatchObject({
        branch: 'travis',
        commit: 'ef765ac7',
        ...commitInfo,
        slug: 'chromaui/travis',
      });
    });

    it('throws on missing variable', async () => {
      vi.stubEnv('TRAVIS_EVENT_TYPE', 'pull_request');
      vi.stubEnv('TRAVIS_PULL_REQUEST_SHA', 'ef765ac7');
      await expect(getCommitAndBranch(ctx)).rejects.toThrow('Missing Travis environment variable');
    });
  });

  describe('with mergeQueue branch', () => {
    it('uses PRs branchName as branch instead of temporary mergeQueue branch', async () => {
      mergeQueueBranchMatch.mockResolvedValue(4);
      getBranchFromMergeQueue.mockResolvedValue('branch-before-merge-queue');
      const info = await getCommitAndBranch(ctx, {
        branchName:
          'this-is-merge-queue-branch-format/main/pr-4-48e0c83fadbf504c191bc868040b7a969a4f1feb',
      });
      expect(info).toMatchObject({ branch: 'branch-before-merge-queue' });
    });
  });
});
