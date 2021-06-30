/* eslint-disable jest/expect-expect */
import { exec } from 'child_process';
import execa from 'execa';
import process from 'process';
import tmp from 'tmp-promise';
import { promisify } from 'util';

import generateGitRepository from './generateGitRepository';
import { getParentCommits, getCommit, getSlug } from './git';
import longLineDescription from './mocks/long-line';
import longLoopDescription from './mocks/long-loop';
import createMockIndex from './mocks/mock-index';
import simpleLoopDescription from './mocks/simple-loop';
import threeParentsDescription from './mocks/three-parents';
import twoRootsDescription from './mocks/two-roots';

const execaCommand = jest.spyOn(execa, 'command');

// Bumping up the Jest timeout for this file because it is timing out sometimes
// I think this just a bit of a slow file due to git stuff, takes ~2-3s on my computer.
jest.setTimeout(30 * 1000);

const descriptions = {
  simpleLoop: simpleLoopDescription,
  longLine: longLineDescription,
  longLoop: longLoopDescription,
  threeParents: threeParentsDescription,
  twoRoots: twoRootsDescription,
};

const execPromise = promisify(exec);
function makeRunGit(directory) {
  return async function runGit(command) {
    return execPromise(command, { cwd: directory });
  };
}

const repositories = {};
beforeAll(async () =>
  Promise.all(
    Object.keys(descriptions).map(async (key) => {
      const dirname = (await tmp.dir({ unsafeCleanup: true, prefix: `chromatictest-` })).path;
      const runGit = makeRunGit(dirname);
      const commitMap = await generateGitRepository(runGit, descriptions[key]);
      repositories[key] = { dirname, runGit, commitMap };
    })
  )
);

function createClient(repository, builds, prs) {
  const mockIndex = createMockIndex(repository, builds, prs);
  return {
    runQuery(query, variables) {
      const queryName = query.match(/query ([a-zA-Z]+)/)[1];
      return mockIndex(queryName, variables);
    },
  };
}

function expectCommitsToEqualNames(hashes, names, { commitMap }) {
  return expect(hashes).toEqual(names.map((n) => commitMap[n].hash));
}

async function checkoutCommit(name, branch, { dirname, runGit, commitMap }) {
  process.chdir(dirname);
  await runGit(`git checkout ${branch !== 'HEAD' ? `-B ${branch}` : ''} ${commitMap[name].hash}`);

  return commitMap[name].hash;
}

const log = { debug: jest.fn() };

describe('getParentCommits', () => {
  it('returns no baseline when there are no builds for the app', async () => {
    const repository = repositories.simpleLoop;
    await checkoutCommit('F', 'main', repository);
    const client = createClient(repository, []);
    const git = { branch: 'main', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, [], repository);
  });

  it('returns the current commit when that already has a build', async () => {
    const repository = repositories.simpleLoop;
    await checkoutCommit('F', 'main', repository);
    const client = createClient(repository, [['F', 'main']]);
    const git = { branch: 'main', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, ['F'], repository);
  });

  it(`returns the current commit's parent when that already has a build`, async () => {
    const repository = repositories.simpleLoop;
    await checkoutCommit('C', 'main', repository);
    const client = createClient(repository, [['B', 'main']]);
    const git = { branch: 'main', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, ['B'], repository);
  });

  it(`returns both of the current commit's parents (in correct order) when they already have a build`, async () => {
    const repository = repositories.simpleLoop;
    await checkoutCommit('F', 'main', repository);
    const client = createClient(repository, [
      ['D', 'main'],
      ['E', 'main'],
    ]);
    const git = { branch: 'main', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, ['E', 'D'], repository);
  });

  it(`returns the all of the commit's parents (in correct order) when they all have a build`, async () => {
    const repository = repositories.threeParents;
    await checkoutCommit('E', 'main', repository);
    const client = createClient(repository, [
      ['B', 'main'],
      ['C', 'main'],
      ['D', 'main'],
    ]);
    const git = { branch: 'main', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, ['D', 'C', 'B'], repository);
  });

  it(`returns the all of the commit's ancestors (in correct order) when the parents don't have a build`, async () => {
    const repository = repositories.longLoop;
    await checkoutCommit('H', 'main', repository);
    const client = createClient(repository, [
      ['B', 'main'],
      ['C', 'main'],
    ]);
    const git = { branch: 'main', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, ['C', 'B'], repository);
  });

  it(`occludes commits that have a more recent build, simple line`, async () => {
    const repository = repositories.simpleLoop;
    await checkoutCommit('C', 'main', repository);
    const client = createClient(repository, [
      ['A', 'main'],
      ['B', 'main'],
    ]);
    const git = { branch: 'main', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, ['B'], repository);
  });

  it(`occludes commits that have a more recent build, both descendents on ancestor paths`, async () => {
    const repository = repositories.simpleLoop;
    await checkoutCommit('F', 'main', repository);
    const client = createClient(repository, [
      ['C', 'main'],
      ['D', 'main'],
      ['E', 'main'],
    ]);
    const git = { branch: 'main', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, ['E', 'D'], repository);
  });

  it(`returns the mainline commit with a build common to both ancestor paths when no builds on a loop`, async () => {
    const repository = repositories.simpleLoop;
    await checkoutCommit('F', 'main', repository);
    const client = createClient(repository, [['C', 'main']]);
    const git = { branch: 'main', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, ['C'], repository);
  });

  it(`returns a commit on one ancestor path when the other has no builds before rejoining mainline`, async () => {
    const repository = repositories.simpleLoop;
    await checkoutCommit('F', 'main', repository);
    const client = createClient(repository, [
      ['C', 'main'],
      ['D', 'main'],
    ]);
    const git = { branch: 'main', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, ['D'], repository);
  });

  it(`ignores irrelevant builds ahead of the current commit`, async () => {
    const repository = repositories.simpleLoop;
    await checkoutCommit('E', 'main', repository);
    const client = createClient(repository, [
      ['C', 'main'],
      ['D', 'branch'],
    ]);
    const git = { branch: 'main', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, ['C'], repository);
  });

  it(`returns nothing if the only builds are on irrelevant branches, build older`, async () => {
    const repository = repositories.simpleLoop;
    await checkoutCommit('E', 'main', repository);
    const client = createClient(repository, [['D', 'branch']]);
    const git = { branch: 'main', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, [], repository);
  });

  it(`returns nothing if the only builds are on irrelevant branches, build newer`, async () => {
    const repository = repositories.simpleLoop;
    await checkoutCommit('D', 'main', repository);
    const client = createClient(repository, [['E', 'branch']]);
    const git = { branch: 'main', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, [], repository);
  });

  it(`ignores builds on unrooted trees`, async () => {
    const repository = repositories.twoRoots;
    await checkoutCommit('D', 'main', repository);
    const client = createClient(repository, [['B', 'branch']]);
    const git = { branch: 'main', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, [], repository);
  });

  it(`ignores non-existent commits (i.e. wrong repo)`, async () => {
    const repository = repositories.twoRoots;
    await checkoutCommit('D', 'main', repository);
    const client = createClient(
      {
        commitMap: {
          Z: { hash: 'b0ff6070903ff046f769f958830d2ebf989ff981', committedAt: 1234 },
        },
      },
      [['Z', 'branch']]
    );
    const git = { branch: 'main', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, [], repository);
  });

  it(`returns what it can when not every ancestor path has a build`, async () => {
    const repository = repositories.simpleLoop;
    await checkoutCommit('F', 'main', repository);
    const client = createClient(repository, [['D', 'main']]);
    const git = { branch: 'main', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, ['D'], repository);
  });

  it(`continues to the end of a long list and fails`, async () => {
    const repository = repositories.longLine;
    await checkoutCommit('Z', 'main', repository);
    const client = createClient(repository, [['z', 'branch']]);
    const git = { branch: 'main', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, [], repository);
  });

  it(`continues to the end of a long list and succeeds`, async () => {
    const repository = repositories.longLine;
    await checkoutCommit('Z', 'main', repository);
    const client = createClient(repository, [['A', 'branch']]);
    const git = { branch: 'main', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, ['A'], repository);
  });

  it(`continues to the end of a long list and succeeds, even when the firstBuild has no committedAt`, async () => {
    const repository = repositories.longLine;
    await checkoutCommit('Z', 'branch', repository);

    const mockIndex = createMockIndex(repository, [['A', 'main']]);
    const mockIndexWithNullFirstBuildCommittedAt = (queryName, variables) => {
      if (queryName === 'TesterFirstCommittedAtQuery') {
        return { app: { firstBuild: { committedAt: null } } };
      }
      return mockIndex(queryName, variables);
    };
    const client = {
      runQuery(query, variables) {
        const queryName = query.match(/query ([a-zA-Z]+)/)[1];
        return mockIndexWithNullFirstBuildCommittedAt(queryName, variables);
      },
    };
    const git = { branch: 'branch', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, ['A'], repository);
  });

  it(`also includes rebased commits that were on the same branch`, async () => {
    const repository = repositories.simpleLoop;
    await checkoutCommit('E', 'branch', repository);
    const client = createClient(repository, [
      ['C', 'main'],
      ['D', 'branch'],
    ]);
    const git = { branch: 'branch', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, ['D'], repository);
  });

  it(`also includes rebased commits that were on the same branch, even if the branch is not checked out`, async () => {
    const repository = repositories.simpleLoop;
    await checkoutCommit('E', 'HEAD', repository);
    const client = createClient(repository, [
      ['C', 'main'],
      ['D', 'branch'],
    ]);
    const git = { branch: 'branch', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, ['D'], repository);
  });

  it(`ignores rebased commits if they are *newer* than the current commit`, async () => {
    const repository = repositories.simpleLoop;
    await checkoutCommit('D', 'branch', repository);
    const client = createClient(repository, [
      ['C', 'main'],
      ['E', 'branch'],
    ]);
    const git = { branch: 'branch', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, ['C'], repository);
  });

  it(`ignores rebased commits if the ignoreLastBuildOnBranch option is passed`, async () => {
    const repository = repositories.simpleLoop;
    await checkoutCommit('E', 'branch', repository);
    const client = createClient(repository, [
      ['C', 'main'],
      ['D', 'branch'],
    ]);
    const git = { branch: 'branch', ...(await getCommit()) };

    const parentCommits = await getParentCommits(
      { client, log, git },
      { ignoreLastBuildOnBranch: true }
    );
    expectCommitsToEqualNames(parentCommits, ['C'], repository);
  });

  it(`also includes rebased commits that were on the same branch, even if they are no longer in the index`, async () => {
    const repository = repositories.simpleLoop;
    await checkoutCommit('E', 'branch', repository);
    const Zhash = 'b0ff6070903ff046f769f958830d2ebf989ff981';
    const client = createClient(
      {
        ...repository,
        commitMap: {
          ...repository.commitMap,
          Z: { hash: Zhash, committedAt: repository.commitMap.A.committedAt },
        },
      },
      [
        ['C', 'main'],
        ['Z', 'branch'],
      ]
    );
    const git = { branch: 'branch', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expect(parentCommits).toEqual([Zhash, repository.commitMap.C.hash]);
  });

  it(`doesn't include rebased commits if they are ancestors of other builds`, async () => {
    const repository = repositories.simpleLoop;
    await checkoutCommit('C', 'branch', repository);
    // A is the latest commit on this branch, but B is newer
    const client = createClient(repository, [
      ['A', 'branch'],
      ['B', 'main'],
    ]);
    const git = { branch: 'branch', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, ['B'], repository);
  });

  it(`doesn't include rebased commits if the current commit has a build`, async () => {
    const repository = repositories.simpleLoop;
    await checkoutCommit('E', 'branch', repository);
    const client = createClient(repository, [
      ['D', 'main'],
      ['E', 'branch'],
    ]);
    const git = { branch: 'branch', ...(await getCommit()) };

    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, ['E'], repository);
  });

  it(`doesn't include rebased commits if the current branch is HEAD`, async () => {
    const repository = repositories.simpleLoop;
    await checkoutCommit('E', 'HEAD', repository);
    const client = createClient(repository, [
      ['C', 'main'],
      ['D', 'HEAD'],
    ]);
    const git = { branch: 'HEAD', ...(await getCommit()) };

    // We can pass 'HEAD' as the branch if we fail to find any other branch info from another source
    const parentCommits = await getParentCommits({ client, log, git });
    expectCommitsToEqualNames(parentCommits, ['C'], repository);
  });

  describe('PR commits', () => {
    it(`also includes PR head commits that were squashed to this commit`, async () => {
      const repository = repositories.simpleLoop;
      await checkoutCommit('E', 'main', repository);
      const client = createClient(
        repository,
        [
          ['C', 'main'],
          ['D', 'branch'],
        ],
        [['E', 'branch']]
      );
      const git = { branch: 'main', ...(await getCommit()) };

      const parentCommits = await getParentCommits({ client, log, git });
      // This doesn't include 'C' as D "covers" it.
      expectCommitsToEqualNames(parentCommits, ['D'], repository);
    });
  });
});

describe('getSlug', () => {
  it('returns the slug portion of the git url', async () => {
    execaCommand.mockImplementation(() => ({ all: 'git@github.com:chromaui/chromatic-cli.git' }));
    expect(await getSlug()).toBe('chromaui/chromatic-cli');

    execaCommand.mockImplementation(() => ({ all: 'https://github.com/chromaui/chromatic-cli' }));
    expect(await getSlug()).toBe('chromaui/chromatic-cli');

    execaCommand.mockImplementation(() => ({ all: 'https://gitlab.com/foo/bar.baz.git' }));
    expect(await getSlug()).toBe('foo/bar.baz');
  });
});
