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

const mocks = {
  TesterFirstCommittedAtQuery: (builds, prs, { branch, commit }) => {
    function lastBuildOnBranch(findingBranch) {
      return builds
        .slice()
        .reverse()
        .find(b => b.branch === findingBranch);
    }

    const lastBuild = lastBuildOnBranch(branch);
    const pr = prs.find(p => p.mergeCommitHash === commit);
    const prLastBuild = pr && lastBuildOnBranch(pr.headBranch);
    return {
      app: {
        firstBuild: builds[0] && {
          committedAt: builds[0].committedAt,
        },
        lastBuild: lastBuild && {
          commit: lastBuild.commit,
          committedAt: lastBuild.committedAt,
        },
        pullRequest: prLastBuild && {
          lastHeadBuild: {
            commit: prLastBuild.commit,
          },
        },
      },
    };
  },
  TesterHasBuildsWithCommitsQuery: (builds, _prs, { commits }) => ({
    app: {
      hasBuildsWithCommits: commits.filter(commit => !!builds.find(b => b.commit === commit)),
    },
  }),
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
      // NOTE: we do not calculate baselineCommits here
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
