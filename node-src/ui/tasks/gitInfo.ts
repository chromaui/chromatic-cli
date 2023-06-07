import pluralize from 'pluralize';
import { Context } from '../../types';

const infoMessage = (
  { commit, branch, parentCommits, changedFiles }: Context['git'],
  { ownerName }: Context['options'],
  turboSnap: Context['turboSnap'] = {}
) => {
  const turboSnapStatus = turboSnap.bailReason ? '; TurboSnap disabled' : '';
  const branchName = ownerName ? `${ownerName}:${branch}` : branch;
  let message = `Commit '${commit.substr(0, 7)}' on branch '${branchName}'`;
  if (parentCommits.length > 0) {
    message += `; found ${pluralize('parent build', parentCommits.length, true)}`;
    if (changedFiles) {
      message += ` and ${pluralize('changed file', changedFiles.length, true)}`;
    }
    return `${message}${turboSnapStatus}`;
  }
  return `${message}; no ancestor found${turboSnapStatus}`;
};

export const initial = {
  status: 'initial',
  title: 'Retrieve git information',
};

export const pending = () => ({
  status: 'pending',
  title: 'Retrieving git information',
});

export const skippingBuild = (ctx: Context) => ({
  status: 'pending',
  title: 'Skipping build',
  output: `Skipping build for commit ${ctx.git.commit.substr(0, 7)}`,
});

export const skippedForCommit = (ctx: Context) => ({
  status: 'success',
  title: 'Skipping build',
  output: `Skipped build for commit ${ctx.git.commit.substr(0, 7)} due to --skip`,
});

export const skipFailed = () => ({
  status: 'error',
  title: 'Skipping build',
  output: `Failed to skip build`,
});

export const skippedRebuild = () => ({
  status: 'success',
  title: 'Skipping build',
  output: `Skipping rebuild of an already fully passed/accepted build`,
});

export const success = (ctx: Context) => ({
  status: 'success',
  title: 'Retrieved git information',
  output: infoMessage(ctx.git, ctx.options, ctx.turboSnap),
});
