/* eslint-disable max-lines */
import { exec } from 'child_process';
import process from 'process';
import tmp from 'tmp-promise';
import { promisify } from 'util';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import generateGitRepository from './generateGitRepository';
import { getParentCommits } from './getParentCommits';
import { getCommit } from './git';
import doubleLoopDescription from './mocks/doubleLoop';
import longLineDescription from './mocks/longLine';
import longLoopDescription from './mocks/longLoop';
import createMockIndex from './mocks/mockIndex';
import simpleLoopDescription from './mocks/simpleLoop';
import threeParentsDescription from './mocks/threeParents';
import twoRootsDescription from './mocks/twoRoots';

const descriptions = {
  simpleLoop: simpleLoopDescription,
  longLine: longLineDescription,
  longLoop: longLoopDescription,
  doubleLoop: doubleLoopDescription,
  threeParents: threeParentsDescription,
  twoRoots: twoRootsDescription,
};

const execPromise = promisify(exec);
function makeRunGit(directory) {
  return async function runGit(command) {
    return execPromise(command, { cwd: directory });
  };
}

function createClient({
  repository,
  builds,
  prs,
}: {
  repository: Pick<Repository, 'commitMap'>;
  builds: [string, string][];
  prs?: [string, string][];
}) {
  const mockIndex = createMockIndex(repository, builds, prs);
  return {
    runQuery(query, variables) {
      const queryName = query.match(/query ([A-Za-z]+)/)[1];
      return mockIndex(queryName, variables);
    },
  };
}

function expectCommitsToEqualNames(hashes, names, { commitMap }) {
  return expect(hashes).toEqual(names.map((name) => commitMap[name]?.hash || name));
}

async function checkoutCommit(name, branch, { dirname, runGit, commitMap }) {
  process.chdir(dirname);
  await runGit(`git checkout ${branch === 'HEAD' ? '' : `-B ${branch}`} ${commitMap[name].hash}`);

  return commitMap[name].hash;
}

const log = { debug: vi.fn() };
const ctx = { log } as any;
const options = {};

// This is built in from TypeScript 4.5
type Awaited<T> = T extends Promise<infer U> ? U : T;

export interface Repository {
  dirname: string;
  runGit: ReturnType<typeof makeRunGit>;
  commitMap: Awaited<ReturnType<typeof generateGitRepository>>;
}

const repositories: Record<string, Repository> = {};
beforeAll(async () => {
  await Promise.all(
    Object.keys(descriptions).map(async (key) => {
      const { path: dirname } = await tmp.dir({ unsafeCleanup: true, prefix: `chromatictest-` });
      const runGit = makeRunGit(dirname);
      const commitMap = await generateGitRepository(runGit, descriptions[key]);
      repositories[key] = { dirname, runGit, commitMap };
    })
  );
});

describe('getParentCommits', () => {
  it('returns no baseline when there are no builds for the app', async () => {
    //  A - B - C - D - (F)  [main]
    //            \   /
    //              E
    const repository = repositories.simpleLoop;
    await checkoutCommit('F', 'main', repository);
    const client = createClient({ repository, builds: [] });
    const git = { branch: 'main', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, [], repository);
  });

  it('returns the current commit when that already has a build', async () => {
    //  A - B - C - D - [(F)]  [main]
    //            \   /
    //              E
    const repository = repositories.simpleLoop;
    await checkoutCommit('F', 'main', repository);
    const client = createClient({ repository, builds: [['F', 'main']] });
    const git = { branch: 'main', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, ['F'], repository);
  });

  it(`returns the current commit's parent when that already has a build`, async () => {
    //  A -[B]-(C)- D - F  [main]
    //            \   /
    //              E
    const repository = repositories.simpleLoop;
    await checkoutCommit('C', 'main', repository);
    const client = createClient({ repository, builds: [['B', 'main']] });
    const git = { branch: 'main', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, ['B'], repository);
  });

  it(`returns both of the current commit's parents (in correct order) when they already have a build`, async () => {
    //  A - B - C -[D]-(F)  [main]
    //            \   /
    //             [E]
    const repository = repositories.simpleLoop;
    await checkoutCommit('F', 'main', repository);
    const client = createClient({
      repository,
      builds: [
        ['D', 'main'],
        ['E', 'branch'],
      ],
    });
    const git = { branch: 'main', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, ['E', 'D'], repository);
  });

  it(`returns all of the commit's parents (in correct order) when they all have a build`, async () => {
    //     [B]
    //    /   \
    //  A -[C]-(E)
    //    \   /
    //     [D]
    const repository = repositories.threeParents;
    await checkoutCommit('E', 'main', repository);
    const client = createClient({
      repository,
      builds: [
        ['B', 'main'],
        ['C', 'main'],
        ['D', 'main'],
      ],
    });
    const git = { branch: 'main', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, ['D', 'C', 'B'], repository);
  });

  it(`returns all of the commit's ancestors (in correct order) when the parents don't have a build`, async () => {
    //  A -[B]- D - F -(H)
    //    \           /
    //     [C]- E - G
    const repository = repositories.longLoop;
    await checkoutCommit('H', 'main', repository);
    const client = createClient({
      repository,
      builds: [
        ['B', 'main'],
        ['C', 'main'],
      ],
    });
    const git = { branch: 'main', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, ['C', 'B'], repository);
  });

  it(`occludes commits that have a more recent build, simple line`, async () => {
    // The first rule of baseline selection we choose the most "recent" (in terms
    // of git) build, so a build should never be selected if an ancestor is also selected.
    //
    // [A]-[B]-(C)- D - F   [main]
    //            \   /
    //              E
    const repository = repositories.simpleLoop;
    await checkoutCommit('C', 'main', repository);
    const client = createClient({
      repository,
      builds: [
        ['A', 'main'],
        ['B', 'main'],
      ],
    });
    const git = { branch: 'main', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, ['B'], repository);
  });

  it(`occludes commits that have a more recent build, both descendents on ancestor paths`, async () => {
    // When all build's paths to the current build is "covered" by selected descendents, we don't
    // use it either.
    //
    //  A - B -[C]-[D]-(F)  [main]
    //            \   /
    //             [E]
    const repository = repositories.simpleLoop;
    await checkoutCommit('F', 'main', repository);
    const client = createClient({
      repository,
      builds: [
        ['C', 'main'],
        ['D', 'main'],
        ['E', 'main'],
      ],
    });
    const git = { branch: 'main', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, ['E', 'D'], repository);
  });

  it(`returns the mainline commit with a build common to both ancestor paths when no builds on a loop`, async () => {
    // However, if ancestor commits exist without builds, we look past them for parent builds.
    //
    //  A - B -[C]- D -(F)  [main]
    //            \   /
    //              E
    const repository = repositories.simpleLoop;
    await checkoutCommit('F', 'main', repository);
    const client = createClient({ repository, builds: [['C', 'main']] });
    const git = { branch: 'main', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, ['C'], repository);
  });

  it(`returns a commit on one ancestor path when the other has no builds before rejoining mainline`, async () => {
    // Although C is independently reachable from F, it is a "pure" ancestor of D
    // (C does not contain any code that isn't in D), so any changes or baseline
    // choices that happened in D will have taken C into account.
    //
    //  A - B -[C]-[D]-(F)  [main]
    //            \   /
    //              E
    const repository = repositories.simpleLoop;
    await checkoutCommit('F', 'main', repository);
    const client = createClient({
      repository,
      builds: [
        ['C', 'main'],
        ['D', 'main'],
      ],
    });
    const git = { branch: 'main', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, ['D'], repository);
  });

  it(`ignores irrelevant builds ahead of the current commit`, async () => {
    //  A - B -[C]-[D]- F  [main]
    //            \   /
    //             (E)
    const repository = repositories.simpleLoop;
    await checkoutCommit('E', 'main', repository);
    const client = createClient({
      repository,
      builds: [
        ['C', 'main'],
        ['D', 'branch'],
      ],
    });
    const git = { branch: 'main', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, ['C'], repository);
  });

  it(`returns nothing if the only builds are on irrelevant branches, build older`, async () => {
    //  A - B - C -[D]- F  [main]
    //            \   /
    //             (E)
    const repository = repositories.simpleLoop;
    await checkoutCommit('E', 'main', repository);
    const client = createClient({ repository, builds: [['D', 'branch']] });
    const git = { branch: 'main', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, [], repository);
  });

  it(`returns nothing if the only builds are on irrelevant branches, build newer`, async () => {
    //  A - B - C -(D)- F  [main]
    //            \   /
    //             [E]
    const repository = repositories.simpleLoop;
    await checkoutCommit('D', 'main', repository);
    const client = createClient({ repository, builds: [['E', 'branch']] });
    const git = { branch: 'main', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, [], repository);
  });

  it(`ignores builds on unreachable commits`, async () => {
    //  A - C -(D)  [main]
    //
    // [B]
    const repository = repositories.twoRoots;
    await checkoutCommit('D', 'main', repository);
    const client = createClient({ repository, builds: [['B', 'branch']] });
    const git = { branch: 'main', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, [], repository);
  });

  it(`ignores non-existent commits (i.e. wrong repo)`, async () => {
    //  A - C -(D) [main]
    //
    //  B
    const repository = repositories.twoRoots;
    await checkoutCommit('D', 'main', repository);
    const client = createClient({
      repository: {
        commitMap: {
          Z: { hash: 'b0ff6070903ff046f769f958830d2ebf989ff981', committedAt: 1234 },
        },
      },
      builds: [['Z', 'branch']],
    });
    const git = { branch: 'main', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, [], repository);
  });

  it(`returns what it can when not every ancestor path has a build`, async () => {
    //  A - B - C -[D]-(F)  [main]
    //            \   /
    //              E
    const repository = repositories.simpleLoop;
    await checkoutCommit('F', 'main', repository);
    const client = createClient({ repository, builds: [['D', 'main']] });
    const git = { branch: 'main', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, ['D'], repository);
  });

  it(`continues to the end of a long list and fails`, async () => {
    //  A - B - ..... - Y -(Z)  [main]
    //
    // [z]
    const repository = repositories.longLine;
    await checkoutCommit('Z', 'main', repository);
    const client = createClient({ repository, builds: [['z', 'branch']] });
    const git = { branch: 'main', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, [], repository);
  });

  it(`continues to the end of a long list and succeeds`, async () => {
    // [A]- B - ..... - Y -(Z)  [main]
    //
    //  z
    const repository = repositories.longLine;
    await checkoutCommit('Z', 'main', repository);
    const client = createClient({ repository, builds: [['A', 'branch']] });
    const git = { branch: 'main', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, ['A'], repository);
  });

  it(`continues to the end of a long list and succeeds, even when the firstBuild has no committedAt`, async () => {
    // [A]- B - ..... - Y -(Z)  [main]
    //
    //  z
    const repository = repositories.longLine;
    await checkoutCommit('Z', 'branch', repository);

    const mockIndex = createMockIndex(repository, [['A', 'main']]);
    const mockIndexWithNullFirstBuildCommittedAt = (queryName, variables) => {
      if (queryName === 'FirstCommittedAtQuery') {
        return { app: { firstBuild: { committedAt: null } } };
      }
      return mockIndex(queryName, variables);
    };
    const client = {
      runQuery(query, variables) {
        const queryName = query.match(/query ([A-Za-z]+)/)[1];
        return mockIndexWithNullFirstBuildCommittedAt(queryName, variables);
      },
    };
    const git = { branch: 'branch', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, ['A'], repository);
  });

  it(`also includes rebased commits that were on the same branch`, async () => {
    // In this example, D has been rebased to E, so they have the same branch name
    // but E is newer and not directly connected in git history.
    //
    //             [D] [branch (rebased)]
    //            /   \
    //  A - B -[C]      F  [main]
    //            \   /
    //             (E)   [branch]
    const repository = repositories.simpleLoop;
    await checkoutCommit('E', 'branch', repository);
    const client = createClient({
      repository,
      builds: [
        ['C', 'main'],
        ['D', 'branch'],
      ],
    });
    const git = { branch: 'branch', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, ['D'], repository);
  });

  it(`also includes rebased commits that were on the same branch, even if the branch is not checked out`, async () => {
    // As above but sometimes git systems do not actually check the branch out, just the commit
    // (we read the branch from somewhere else, e.g. env var)
    //
    //             [D] [branch (rebased)]
    //            /   \
    //  A - B -[C]      F  [main]
    //            \   /
    //             (E)   [HEAD, with branch set]
    const repository = repositories.simpleLoop;
    await checkoutCommit('E', 'HEAD', repository);
    const client = createClient({
      repository,
      builds: [
        ['C', 'main'],
        ['D', 'branch'],
      ],
    });
    const git = { branch: 'branch', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, ['D'], repository);
  });

  it(`ignores rebased commits if they are *newer* than the current commit`, async () => {
    // Same scenario, but otherway around, i.e. the existing build is newer, so
    // we are running a historic commit and shouldn't use the baseline.
    //
    //             (D) [branch]
    //            /   \
    //  A - B -[C]      F  [main]
    //            \   /
    //             [E]   [branch (rebased)]
    const repository = repositories.simpleLoop;
    await checkoutCommit('D', 'branch', repository);
    const client = createClient({
      repository,
      builds: [
        ['C', 'main'],
        ['E', 'branch'],
      ],
    });
    const git = { branch: 'branch', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, ['C'], repository);
  });

  it(`ignores rebased commits if the ignoreLastBuildOnBranch option is passed`, async () => {
    // Same as the original example, but we've been asked not to infer rebasing.
    //
    //             [D] [branch (rebased)]
    //            /   \
    //  A - B -[C]      F  [main]
    //            \   /
    //             (E)   [branch]
    const repository = repositories.simpleLoop;
    await checkoutCommit('E', 'branch', repository);
    const client = createClient({
      repository,
      builds: [
        ['C', 'main'],
        ['D', 'branch'],
      ],
    });
    const git = { branch: 'branch', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any, {
      ignoreLastBuildOnBranch: true,
    });
    expectCommitsToEqualNames(parentCommits, ['C'], repository);
  });

  it(`also includes rebased commits that were on the same branch, even if they are no longer in the index`, async () => {
    // In this case we know nothing about Z in terms of history, which can often happen with rebasing
    //
    // [Z] [branch (rebased)]
    //
    //  A - B -[C]- D - F  [main]
    //            \   /
    //             (E)   [branch]
    const repository = repositories.simpleLoop;
    await checkoutCommit('E', 'branch', repository);
    const Zhash = 'b0ff6070903ff046f769f958830d2ebf989ff981';
    const client = createClient({
      repository: {
        ...repository,
        commitMap: {
          ...repository.commitMap,
          Z: { hash: Zhash, committedAt: repository.commitMap.A.committedAt },
        },
      },
      builds: [
        ['C', 'main'],
        ['Z', 'branch'],
      ],
    });
    const git = { branch: 'branch', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expect(parentCommits).toEqual([Zhash, repository.commitMap.C.hash]);
  });

  it(`doesn't include rebased commits if they are ancestors of other builds`, async () => {
    // Somehow (?) A has been rebased to E, but we still shouldn't use it as parent, because
    // B is a more recent ancestor with a build.
    //
    // [A] [branch]
    //    \
    //     [B] - C - D - F[main]
    //             \   /
    //              (E)   [branch]
    //
    const repository = repositories.simpleLoop;
    await checkoutCommit('C', 'branch', repository);
    const client = createClient({
      repository,
      builds: [
        ['A', 'branch'],
        ['B', 'main'],
      ],
    });
    const git = { branch: 'branch', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, ['B'], repository);
  });

  it(`doesn't include rebased commits if the current commit has a build`, async () => {
    // No need to use D as a parent as E has a build
    //
    //             [D] [branch (rebased)]
    //            /   \
    //  A - B -[C]      F  [main]
    //            \   /
    //             [E]   [branch]
    const repository = repositories.simpleLoop;
    await checkoutCommit('E', 'branch', repository);
    const client = createClient({
      repository,
      builds: [
        ['D', 'main'],
        ['E', 'branch'],
      ],
    });
    const git = { branch: 'branch', ...(await getCommit(ctx)) };

    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, ['E'], repository);
  });

  it(`doesn't include rebased commits if the current branch is HEAD`, async () => {
    // We aren't get properly told about branch names. We shouldn't assume HEAD is a branch name
    // (it probably isn't).
    //
    //             [D] [HEAD]
    //            /   \
    //  A - B -[C]      F  [main]
    //            \   /
    //             [E]   [HEAD]
    const repository = repositories.simpleLoop;
    await checkoutCommit('E', 'HEAD', repository);
    const client = createClient({
      repository,
      builds: [
        ['C', 'main'],
        ['D', 'HEAD'],
      ],
    });
    const git = { branch: 'HEAD', ...(await getCommit(ctx)) };

    // We can pass 'HEAD' as the branch if we fail to find any other branch info from another source
    const parentCommits = await getParentCommits({ client, log, git, options } as any);
    expectCommitsToEqualNames(parentCommits, ['C'], repository);
  });

  describe('PR commits', () => {
    it(`also includes PR head commits that were squashed to this commit`, async () => {
      //
      //
      //             [D]   [branch, squash merged into E]
      //            /   \
      //  A - B -[C]      F
      //            \   /
      //             (E)   [main]
      const repository = repositories.simpleLoop;
      await checkoutCommit('E', 'main', repository);
      const client = createClient({
        repository,
        builds: [
          ['C', 'main'],
          ['D', 'branch'],
        ],
        // Talking to GH (etc) tells us that commit E is the merge commit for "branch"
        prs: [['E', 'branch']],
      });
      const git = { branch: 'main', ...(await getCommit(ctx)) };

      const parentCommits = await getParentCommits({ client, log, git, options } as any);
      // This doesn't include 'C' as D "covers" it.
      expectCommitsToEqualNames(parentCommits, ['D'], repository);
    });

    it(`also finds squash merge commits that were on previous commits without builds`, async () => {
      // []: has build, <>: is squash merge, (): current commit
      //
      //     B -[D]      [branch]
      //    /
      //  A -[C]-<E>-(G) [main]
      const repository = repositories.longLoop;
      await checkoutCommit('G', 'main', repository);
      const client = createClient({
        repository,
        builds: [
          ['C', 'main'],
          ['D', 'branch'],
        ],
        // Talking to GH (etc) tells us that commit E is the merge commit for "branch"
        prs: [['E', 'branch']],
      });
      const git = { branch: 'main', ...(await getCommit(ctx)) };

      const parentCommits = await getParentCommits({ client, log, git, options } as any);
      expectCommitsToEqualNames(parentCommits, ['D', 'C'], repository);
    });

    it(`deals with situations where the last build on the squashed branch isn't the last commit`, async () => {
      // []: has build, <>: is squash merge, (): current commit
      //
      //     [B]- D      [branch]
      //    /
      //  A -[C]-<E>-(G) [main]
      const repository = repositories.longLoop;
      await checkoutCommit('G', 'main', repository);
      const client = createClient({
        repository,
        builds: [
          ['C', 'main'],
          ['B', 'branch'],
        ],
        // Talking to GH (etc) tells us that commit E is the merge commit for "branch"
        prs: [['E', 'branch']],
      });
      const git = { branch: 'main', ...(await getCommit(ctx)) };

      const parentCommits = await getParentCommits({ client, log, git, options } as any);
      expectCommitsToEqualNames(parentCommits, ['C', 'B'], repository);
    });

    it(`occludes commits that have a more recent build on a squashed branch`, async () => {
      // []: has build, <>: is squash merge, (): current commit
      //
      //     [B]- D      [branch]
      //    /
      //  [A]- C -<E>-(G) [main]
      const repository = repositories.longLoop;
      await checkoutCommit('G', 'main', repository);
      const client = createClient({
        repository,
        builds: [
          ['A', 'main'],
          ['B', 'branch'],
        ],
        // Talking to GH (etc) tells us that commit E is the merge commit for "branch"
        prs: [['E', 'branch']],
      });
      const git = { branch: 'main', ...(await getCommit(ctx)) };

      const parentCommits = await getParentCommits({ client, log, git, options } as any);
      // This doesn't include A as B "covers" it.
      expectCommitsToEqualNames(parentCommits, ['B'], repository);
    });

    it(`deals with situations where squashed branches have no builds`, async () => {
      // []: has build, <>: is squash merge, (): current commit
      //
      //     B - D       [branch]
      //    /
      //  A -[C]-<E>-(G) [main]
      const repository = repositories.longLoop;
      await checkoutCommit('G', 'main', repository);
      const client = createClient({
        repository,
        builds: [['C', 'main']],
        // Talking to GH (etc) tells us that commit E is the merge commit for "branch"
        prs: [['E', 'branch']],
      });
      const git = { branch: 'main', ...(await getCommit(ctx)) };

      const parentCommits = await getParentCommits({ client, log, git, options } as any);
      expectCommitsToEqualNames(parentCommits, ['C'], repository);
    });

    it(`deals with situations where squashed branches no longer exist in the repo but have a build`, async () => {
      // []: has build, <>: is squash merge, (): current commit
      //
      //  [MISSING] [no longer in repo]
      //
      //  [A]- C -<(D)> [main]
      const repository = repositories.twoRoots;
      await checkoutCommit('D', 'main', repository);
      const client = createClient({
        repository,
        builds: [
          ['A', 'main'],
          ['MISSING', 'branch'],
        ],
        // Talking to GH (etc) tells us that commit D is the merge commit for "branch" (which no longer exists)
        prs: [['D', 'branch']],
      });
      const git = { branch: 'main', ...(await getCommit(ctx)) };

      const parentCommits = await getParentCommits({ client, log, git, options } as any);
      expectCommitsToEqualNames(parentCommits, ['MISSING', 'A'], repository);
    });

    // We could support this situation via recursing and doing a second (etc) check for squash merge commits,
    // but that would make things a lot more complex and this situation seems quite unlikely and is easily avoided
    // by ensuring you run a build for E.
    it(`does not find parents for commits on a squashed branch that are themselves squash merge commits`, async () => {
      // []: has build, <>: is squash merge, (): current commit
      //
      //       [F]        [branch2]
      //      /
      //    [C]-<E>       [branch]
      //   /
      //  A -[B]-<D>- G  [main]
      const repository = repositories.doubleLoop;
      await checkoutCommit('G', 'main', repository);
      const client = createClient({
        repository,
        builds: [
          ['B', 'main'],
          ['C', 'branch'],
          ['F', 'branch2'],
        ],
        // Talking to GH (etc) tells us that commit G is the merge commit for "branch"
        prs: [
          ['D', 'branch'],
          ['E', 'branch2'],
        ],
      });
      const git = { branch: 'main', ...(await getCommit(ctx)) };

      const parentCommits = await getParentCommits({ client, log, git, options } as any);
      expectCommitsToEqualNames(parentCommits, ['C', 'B'], repository);
    });

    it(`does not affect finding a merge commit's parents (in correct order) when they already have a build`, async () => {
      // []: has build, <>: is squash merge, (): current commit
      //  A - B - C -[D]-(F)  [main]
      //            \   /
      //             [E]      [branch]
      const repository = repositories.simpleLoop;
      await checkoutCommit('F', 'main', repository);
      const client = createClient({
        repository,
        builds: [
          ['D', 'main'],
          ['E', 'branch'],
        ],
        // Talking to GH (etc) tells us that commit F is the merge commit for "branch"
        prs: [['F', 'branch']],
      });
      const git = { branch: 'main', ...(await getCommit(ctx)) };

      const parentCommits = await getParentCommits({ client, log, git, options } as any);
      expectCommitsToEqualNames(parentCommits, ['E', 'D'], repository);
    });
  });
});
