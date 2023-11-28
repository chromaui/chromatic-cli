// Given:

// - a commitMap (as returned by creating the repo),
// - a list of builds per - commit, in the format:
//   [name, branch]
//    - name is a string, as used in the repo description
//    - branch is a string
// - a list of merged PRs, in the format:
//   [name, headBranch]
//    - name is a string, as used in the repo description
//    - branch is a string

// create a mock set of responses to the queries we run as part of our git algorithm

type Build = { branch: string; commit: string; committedAt: number };
type PR = { mergeCommitHash: string; headBranch: string };

function lastBuildOnBranch(builds: Build[], findingBranch: string) {
  return builds
    .slice()
    .reverse()
    .find((b) => b.branch === findingBranch);
}

const mocks = {
  FirstCommittedAtQuery: (builds: Build[], prs: PR[], { branch }: { branch: string }) => {
    const lastBuild = lastBuildOnBranch(builds, branch);
    return {
      app: {
        firstBuild: builds[0] && {
          committedAt: builds[0].committedAt,
        },
        lastBuild: lastBuild && {
          commit: lastBuild.commit,
          committedAt: lastBuild.committedAt,
        },
      },
    };
  },
  HasBuildsWithCommitsQuery: (builds: Build[], prs: PR[], { commits }: { commits: string[] }) => ({
    app: {
      hasBuildsWithCommits: commits.filter((commit) => !!builds.find((b) => b.commit === commit)),
    },
  }),
  IsMergeCommitQuery: (builds: Build[], prs: PR[], { commit }: { commit: string }) => {
    const pr = prs.find((p) => p.mergeCommitHash === commit);
    const prLastBuild = pr && lastBuildOnBranch(builds, pr.headBranch);

    return {
      app: {
        pullRequest: prLastBuild && {
          lastHeadBuild: {
            commit: prLastBuild.commit,
          },
        },
      },
    };
  },
};

export default function createMockIndex({ commitMap }, buildDescriptions, prDescriptions = []) {
  const builds = buildDescriptions.map(([name, branch], index) => {
    const { hash, committedAt: committedAtSeconds } = commitMap[name];
    const committedAt = parseInt(committedAtSeconds, 10) * 1000;

    const number = index + 1;
    return {
      number,
      commit: hash,
      committedAt,
      createdAt: committedAt,
      branch,
      // NOTE: we do not calculate parentCommits here
    };
  });

  const prs = prDescriptions.map(([name, headBranch]) => {
    const { hash } = commitMap[name];

    return {
      mergeCommitHash: hash,
      headBranch,
    };
  });

  return function mockIndex(queryName, variables) {
    return mocks[queryName](builds, prs, variables);
  };
}
