import { spawn } from 'yarn-or-npm';
import dedent from 'ts-dedent';

import {
  isClean,
  isUpToDate,
  getUpdateMessage,
  findMergeBase,
  checkout,
  checkoutPrevious,
  discardChanges,
} from '../git/git';
import log from '../lib/log';
import { runTest } from './index';

const installDependencies = () => spawn.sync(['install'], { stdio: 'inherit' });

export async function runPatchBuild(options) {
  const [headRef, baseRef] = options.patchBuild;

  // Make sure the git repo is in a clean state (no changes / untracked files).
  if (!(await isClean())) {
    throw new Error(dedent`
      The git working directory must be clean before running a patch build.
        (use "git stash --include-untracked --keep-index" to stash changes before you continue)
    `);
  }

  // Make sure both the head and base branches are up-to-date with the remote.
  if (!(await isUpToDate())) {
    throw new Error(await getUpdateMessage());
  }

  // Get the merge base commit hash.
  const mergeBase = await findMergeBase(headRef, baseRef);
  if (!mergeBase) {
    throw new Error(dedent`
      Failed to retrieve the merge base. You may have specified an invalid base branch.
      Are you sure the head branch is a descendant (i.e. fork) of the base branch?
        (try running this command yourself: "git merge-base --all ${headRef} ${baseRef}")
    `);
  }

  log.info(`Checking out merge base commit ${mergeBase}`);
  await checkout(mergeBase);

  try {
    log.info('Installing dependencies...');
    installDependencies(); // this might modify a lockfile

    log.info(`Starting patch build for ${baseRef}...`);
    return await runTest({ ...options, patchBranchName: baseRef }); // await here is necessary
  } finally {
    log.info('Restoring workspace...');
    await discardChanges(); // we need a clean state before checkout
    await checkoutPrevious();
    installDependencies();
    await discardChanges(); // drop lockfile changes
  }
}
