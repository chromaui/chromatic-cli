import {
  checkout,
  checkoutPrevious,
  discardChanges,
  findMergeBase,
  getUpdateMessage,
  isClean,
  isUpToDate,
} from '../../git/git';
import { Logger } from '../../lib/log';
import { Ports } from '../../lib/ports';
import { exitCodes } from '../../lib/setExitCode';
import type { Context, Options } from '../../types';
import mergeBaseNotFound from '../../ui/messages/errors/mergeBaseNotFound';
import workspaceNotClean from '../../ui/messages/errors/workspaceNotClean';
import workspaceNotUpToDate from '../../ui/messages/errors/workspaceNotUpToDate';

/**
 * Stage emitted by {@link runPrepareWorkspacePhase} as it progresses. The
 * wrapper maps each stage to the matching Listr UI transition.
 */
export type PrepareWorkspaceStage = 'lookup-merge-base' | 'checkout-merge-base' | 'installing';

/**
 * Error thrown by the workspace phases on a known failure mode. The wrapper
 * applies `exitCode` via `setExitCode` and rethrows.
 */
export class WorkspacePhaseError extends Error {
  readonly exitCode: number;
  readonly userError: boolean;
  constructor(message: string, exitCode: number, userError = false) {
    super(message);
    this.name = 'WorkspacePhaseError';
    this.exitCode = exitCode;
    this.userError = userError;
  }
}

export type WorkspacePhasePorts = Pick<Ports, 'pkgMgr'>;

export interface PrepareWorkspacePhaseInput {
  options: Pick<Options, 'patchHeadRef' | 'patchBaseRef'>;
  log: Logger;
  ports: WorkspacePhasePorts;
  onStage?: (stage: PrepareWorkspaceStage) => void;
}

export interface PrepareWorkspacePhaseOutput {
  /** Merge-base commit checked out for the patch build. */
  mergeBase: string;
}

/**
 * Pure orchestration of the `prepareWorkspace` phase. Verifies the working
 * tree is clean and up-to-date, locates the merge base between
 * `patchHeadRef` and `patchBaseRef`, checks it out, and installs
 * dependencies. Throws {@link WorkspacePhaseError} for known failure modes.
 *
 * @param input Phase inputs.
 *
 * @returns The merge-base commit hash that was checked out.
 */
export async function runPrepareWorkspacePhase(
  input: PrepareWorkspacePhaseInput
): Promise<PrepareWorkspacePhaseOutput> {
  const helperContext = makeLegacyContext(input);

  if (!(await isClean(helperContext))) {
    input.log.error(workspaceNotClean());
    throw new WorkspacePhaseError('Working directory is not clean', exitCodes.GIT_NOT_CLEAN, true);
  }

  if (!(await isUpToDate(helperContext))) {
    input.log.error(workspaceNotUpToDate(await getUpdateMessage(helperContext)));
    throw new WorkspacePhaseError(
      'Workspace not up-to-date with remote',
      exitCodes.GIT_OUT_OF_DATE,
      true
    );
  }

  input.onStage?.('lookup-merge-base');
  const mergeBase = await findMergeBase(
    helperContext,
    input.options.patchHeadRef,
    input.options.patchBaseRef
  );
  if (!mergeBase) {
    input.log.error(mergeBaseNotFound(input.options));
    throw new WorkspacePhaseError('Could not find a merge base', exitCodes.GIT_NO_MERGE_BASE, true);
  }

  input.onStage?.('checkout-merge-base');
  await checkout(helperContext, mergeBase);

  try {
    input.onStage?.('installing');
    await input.ports.pkgMgr.exec(['install']); // this might modify a lockfile
  } catch (error) {
    input.log.error(error as Error);
    // Best-effort cleanup so the working tree is left as the user found it.
    await runRestoreWorkspacePhase({ log: input.log, ports: input.ports }).catch(() => undefined);
    throw new WorkspacePhaseError('Failed to install dependencies', exitCodes.NPM_INSTALL_FAILED);
  }

  return { mergeBase };
}

export interface RestoreWorkspacePhaseInput {
  log: Logger;
  ports: WorkspacePhasePorts;
}

/**
 * Pure orchestration of the `restoreWorkspace` phase. Discards local
 * changes, checks out the previous ref, reinstalls dependencies, and
 * discards the lockfile diff that `npm install` may have produced.
 *
 * @param input Phase inputs.
 */
export async function runRestoreWorkspacePhase(input: RestoreWorkspacePhaseInput): Promise<void> {
  const helperContext = { log: input.log, ports: input.ports } as unknown as Context;
  await discardChanges(helperContext); // we need a clean state before checkout
  await checkoutPrevious(helperContext);
  await input.ports.pkgMgr.exec(['install']);
  await discardChanges(helperContext); // drop lockfile changes
}

/**
 * Synthesize a Context-shaped argument for the legacy git/* helpers, which
 * still expect `ctx.log` and `ctx.ports`.
 *
 * @param input Phase inputs.
 *
 * @returns A Context-shaped value with the fields the helpers read.
 */
function makeLegacyContext(input: PrepareWorkspacePhaseInput): Context {
  return { log: input.log, ports: input.ports, options: input.options } as unknown as Context;
}
