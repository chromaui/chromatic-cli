import pluralize from 'pluralize';

const infoMessage = ({ commit, branch, parentCommits, changedFiles }, { ownerName }) => {
  const branchName = ownerName ? `${ownerName}:${branch}` : branch;
  let message = `Commit '${commit.substr(0, 7)}' on branch '${branchName}'`;
  if (parentCommits.length > 0) {
    message += `; found ${pluralize('parent commit', parentCommits.length, true)}`;
    if (changedFiles) {
      message += ` and ${pluralize('changed file', changedFiles.length, true)}`;
    }
    return message;
  }
  return `${message}; no parent commits found`;
};

export const initial = {
  status: 'initial',
  title: 'Retrieve git information',
};

export const pending = (ctx) => ({
  status: 'pending',
  title: 'Retrieving git information',
});

export const skippingBuild = (ctx) => ({
  status: 'pending',
  title: 'Skipping build',
  output: `Skipping build for commit ${ctx.git.commit.substr(0, 7)}`,
});

export const skippedForCommit = (ctx) => ({
  status: 'success',
  title: 'Skipping build',
  output: `Skipped build for commit ${ctx.git.commit.substr(0, 7)} due to --skip`,
});

export const skipFailed = (ctx) => ({
  status: 'error',
  title: 'Skipping build',
  output: `Failed to skip build`,
});

export const skippedRebuild = (ctx) => ({
  status: 'success',
  title: 'Skipping build',
  output: `Skipping rebuild of an already fully passed/accepted build`,
});

export const success = (ctx) => ({
  status: 'success',
  title: 'Retrieved git information',
  output: infoMessage(ctx.git, ctx.options),
});
