import { checkout, findMergeBase, getUpdateMessage, isClean, isUpToDate } from '../git/git';
import { installDependencies } from '../lib/installDependencies';
import { exitCodes, TaskFailure } from '../lib/setExitCode';
import { Context, Deps, TaskFunction } from '../types';
import mergeBaseNotFound from '../ui/messages/errors/mergeBaseNotFound';
import workspaceNotClean from '../ui/messages/errors/workspaceNotClean';
import workspaceNotUpToDate from '../ui/messages/errors/workspaceNotUpToDate';
import { runRestoreWorkspace } from './restoreWorkspace';

export type PrepareWorkspaceDeps = Pick<Deps, 'log' | 'options' | 'report'>;

export interface PrepareWorkspaceInput {
  patchHeadRef: string;
  patchBaseRef: string;
}

export interface PrepareWorkspaceOutput {
  mergeBase: string;
}

export const extractPrepareWorkspaceInput = (ctx: Context): PrepareWorkspaceInput => ({
  patchHeadRef: ctx.options.patchHeadRef,
  patchBaseRef: ctx.options.patchBaseRef,
});

export const runPrepareWorkspace: TaskFunction<
  PrepareWorkspaceInput,
  PrepareWorkspaceOutput,
  PrepareWorkspaceDeps
> = async (deps, input) => {
  const { patchHeadRef, patchBaseRef } = input;

  // Make sure the git repo is in a clean state (no changes / untracked files).
  if (!(await isClean(deps))) {
    deps.log.error(workspaceNotClean());
    throw new TaskFailure('Working directory is not clean', {
      exitCode: exitCodes.GIT_NOT_CLEAN,
      userError: true,
    });
  }

  // Make sure both the head and base branches are up-to-date with the remote.
  if (!(await isUpToDate(deps))) {
    deps.log.error(workspaceNotUpToDate(await getUpdateMessage(deps)));
    throw new TaskFailure('Workspace not up-to-date with remote', {
      exitCode: exitCodes.GIT_OUT_OF_DATE,
      userError: true,
    });
  }

  deps.report({
    output: `Looking up the git merge base for '${patchHeadRef}' on '${patchBaseRef}'`,
  });

  // Get the merge base commit hash.
  const mergeBase = await findMergeBase(deps, patchHeadRef, patchBaseRef);
  if (!mergeBase) {
    deps.log.error(mergeBaseNotFound(deps.options));
    throw new TaskFailure('Could not find a merge base', {
      exitCode: exitCodes.GIT_NO_MERGE_BASE,
      userError: true,
    });
  }

  deps.report({ output: `Checking out merge base commit '${mergeBase.slice(0, 7)}'` });
  await checkout(deps, mergeBase);

  deps.report({ output: 'Installing dependencies' });
  try {
    await installDependencies(); // this might modify a lockfile
  } catch (err) {
    deps.log.error(err);
    await runRestoreWorkspace(deps); // checkout already happened; don't strand the user
    throw new TaskFailure('Failed to install dependencies', {
      exitCode: exitCodes.NPM_INSTALL_FAILED,
    });
  }

  return { kind: 'continue', output: { mergeBase } };
};

export const applyPrepareWorkspaceOutput = (ctx: Context, output: PrepareWorkspaceOutput) => {
  ctx.mergeBase = output.mergeBase;
};
