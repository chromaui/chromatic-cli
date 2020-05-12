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
  const { patchBaseRef, patchHeadRef } = options;

  // Make sure the git repo is in a clean state (no changes / untracked files).
  if (!(await isClean())) {
    log.error(dedent`
      The git working directory must be clean before running a patch build.
        (use "git stash --include-untracked --keep-index" to stash changes before you continue)
    `);
    return { exitCode: 255 };
  }

  // Make sure both the head and base branches are up-to-date with the remote.
  if (!(await isUpToDate())) {
    log.error(await getUpdateMessage());
    return { exitCode: 255 };
  }

  // Get the merge base commit hash.
  log.info(`Looking up the merge base for ${patchHeadRef} ${patchBaseRef}...`);
  const mergeBase = await findMergeBase(patchHeadRef, patchBaseRef);
  if (!mergeBase) {
    log.error(dedent`
      Failed to retrieve the merge base. You may have specified an invalid base branch.
      Are you sure the head branch is a descendant (i.e. fork) of the base branch?
        (try running this command yourself: "git merge-base --all ${patchHeadRef} ${patchBaseRef}")
    `);
    return { exitCode: 255 };
  }

  log.info(`Checking out merge base commit ${mergeBase}`);
  await checkout(mergeBase);

  try {
    log.info('Installing dependencies...');
    installDependencies(); // this might modify a lockfile

    log.info(`Starting patch build for ${patchBaseRef}...`);
    return await runTest(options); // await here is necessary
  } finally {
    log.info('Restoring workspace...');
    await discardChanges(); // we need a clean state before checkout
    await checkoutPrevious();
    installDependencies();
    await discardChanges(); // drop lockfile changes
  }
}
