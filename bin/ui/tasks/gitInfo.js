import pluralize from 'pluralize';

const infoMessage = ({ commit, branch, baselineCommits }) => {
  const info = `Commit '${commit.substr(0, 7)}' on branch '${branch}'`;
  return baselineCommits.length
    ? `${info}; found ${pluralize('baseline commit', baselineCommits.length, true)}`
    : `${info}; no baseline commits found`;
};

export const initial = {
  status: 'initial',
  title: 'Retrieve git information',
};

export const pending = ctx => ({
  status: 'pending',
  title: 'Retrieving git information',
});

export const skipFailed = ctx => ({
  status: 'error',
  title: 'Retrieving git information',
  output: `Failed to skip build`,
});

export const skippedForCommit = ctx => ({
  status: 'skipped',
  title: 'Skipping build',
  output: `Skipping build for commit ${ctx.git.commit.substr(0, 7)} due to --skip`,
});

export const success = ctx => ({
  status: 'success',
  title: 'Retrieved git information',
  output: infoMessage(ctx.git),
});
