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
type MergeInfo = { commit: string; branch: string; }

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
  MergeCommitsQuery: (builds: Build[], prs: PR[], { mergeInfoList }: { mergeInfoList: MergeInfo[] }) => {
    const mergedPrs = [];
    for (const mergeInfo of mergeInfoList) {
      const pr = prs.find((p) => p.mergeCommitHash === mergeInfo.commit);
      const prLastBuild = pr && lastBuildOnBranch(builds, pr.headBranch);
      mergedPrs.push({
        lastHeadBuild: prLastBuild && {
          commit: prLastBuild.commit,
        }
      });
    }

    return {
      app: {
        mergedPullRequests: mergedPrs
      }
    };
  },
};

export default function createMockIndex({ commitMap }, buildDescriptions, prDescriptions = []) {
  const builds = buildDescriptions.map(([name, branch], index) => {
    let hash, committedAt;
    if (commitMap[name]) {
      const commitInfo = commitMap[name];
      hash = commitInfo.hash;
      committedAt = parseInt(commitInfo.committedAt, 10) * 1000;
    } else {
      // Allow for test cases with a commit that is no longer in the history
      hash = name;
      committedAt = Date.now();
    }

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
