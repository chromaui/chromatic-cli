// Given a list of builds per-commit, in the format:
//   [name, branch]
//    - name is a string, as used in the repo description
//    - branch is a string

// and a commitMap (as returned by creating the repo), create a mock set of responses
// to the queries we run as part of our git algorithm

const mocks = {
  TesterFirstCommittedAtQuery: (builds, { branch }) => {
    const lastBuild = builds
      .slice()
      .reverse()
      .find(b => b.branch === branch);
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
  TesterHasBuildsWithCommitsQuery: (builds, { commits }) => ({
    app: {
      hasBuildsWithCommits: commits.filter(commit => !!builds.find(b => b.commit === commit)),
    },
  }),
};

export default function createMockIndex({ commitMap }, description) {
  const builds = [];
  description.forEach(([name, branch]) => {
    const { hash, committedAt: committedAtSeconds } = commitMap[name];
    const committedAt = parseInt(committedAtSeconds, 10) * 1000;

    const number = builds.length + 1;
    builds.push({
      number,
      commit: hash,
      committedAt,
      createdAt: committedAt,
      branch,
      // NOTE: we do not calculate baselineCommits here
    });
  });

  return function mockIndex(queryName, variables) {
    return mocks[queryName](builds, variables);
  };
}
