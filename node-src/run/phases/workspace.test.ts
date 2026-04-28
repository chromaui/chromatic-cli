import { afterEach, describe, expect, it, vi } from 'vitest';

import * as git from '../../git/git';
import { exitCodes } from '../../lib/setExitCode';
import TestLogger from '../../lib/testLogger';
import {
  runPrepareWorkspacePhase,
  runRestoreWorkspacePhase,
  WorkspacePhaseError,
} from './workspace';

vi.mock('../../git/git');

const isClean = vi.mocked(git.isClean);
const isUpToDate = vi.mocked(git.isUpToDate);
const findMergeBase = vi.mocked(git.findMergeBase);
const checkout = vi.mocked(git.checkout);
const checkoutPrevious = vi.mocked(git.checkoutPrevious);
const discardChanges = vi.mocked(git.discardChanges);

afterEach(() => {
  vi.clearAllMocks();
});

function makePorts(execImpl: (args: string[]) => Promise<unknown> = async () => undefined) {
  return { pkgMgr: { exec: vi.fn(execImpl) } } as any;
}

describe('runPrepareWorkspacePhase', () => {
  it('finds the merge base, checks it out, and installs deps', async () => {
    isClean.mockResolvedValue(true);
    isUpToDate.mockResolvedValue(true);
    findMergeBase.mockResolvedValue('abc123');
    const ports = makePorts();
    const stages: string[] = [];
    const result = await runPrepareWorkspacePhase({
      options: { patchHeadRef: 'head', patchBaseRef: 'base' },
      log: new TestLogger(),
      ports,
      onStage: (stage) => stages.push(stage),
    });
    expect(result.mergeBase).toBe('abc123');
    expect(stages).toEqual(['lookup-merge-base', 'checkout-merge-base', 'installing']);
    expect(checkout).toHaveBeenCalledWith(expect.any(Object), 'abc123');
    expect(ports.pkgMgr.exec).toHaveBeenCalledWith(['install']);
  });

  it('throws GIT_NOT_CLEAN when working directory is dirty', async () => {
    isClean.mockResolvedValue(false);
    await expect(
      runPrepareWorkspacePhase({
        options: { patchHeadRef: 'h', patchBaseRef: 'b' },
        log: new TestLogger(),
        ports: makePorts(),
      })
    ).rejects.toMatchObject({
      name: 'WorkspacePhaseError',
      exitCode: exitCodes.GIT_NOT_CLEAN,
    });
  });

  it('throws GIT_OUT_OF_DATE when the workspace lags the remote', async () => {
    isClean.mockResolvedValue(true);
    isUpToDate.mockResolvedValue(false);
    await expect(
      runPrepareWorkspacePhase({
        options: { patchHeadRef: 'h', patchBaseRef: 'b' },
        log: new TestLogger(),
        ports: makePorts(),
      })
    ).rejects.toMatchObject({
      name: 'WorkspacePhaseError',
      exitCode: exitCodes.GIT_OUT_OF_DATE,
    });
  });

  it('throws GIT_NO_MERGE_BASE when no merge base is found', async () => {
    isClean.mockResolvedValue(true);
    isUpToDate.mockResolvedValue(true);
    findMergeBase.mockResolvedValue(undefined);
    await expect(
      runPrepareWorkspacePhase({
        options: { patchHeadRef: 'h', patchBaseRef: 'b' },
        log: new TestLogger(),
        ports: makePorts(),
      })
    ).rejects.toMatchObject({
      name: 'WorkspacePhaseError',
      exitCode: exitCodes.GIT_NO_MERGE_BASE,
    });
  });

  it('throws NPM_INSTALL_FAILED on install failure and attempts restore', async () => {
    isClean.mockResolvedValue(true);
    isUpToDate.mockResolvedValue(true);
    findMergeBase.mockResolvedValue('abc123');
    const ports = makePorts(async () => {
      throw new Error('install boom');
    });
    await expect(
      runPrepareWorkspacePhase({
        options: { patchHeadRef: 'h', patchBaseRef: 'b' },
        log: new TestLogger(),
        ports,
      })
    ).rejects.toMatchObject({
      name: 'WorkspacePhaseError',
      exitCode: exitCodes.NPM_INSTALL_FAILED,
    });
  });
});

describe('runRestoreWorkspacePhase', () => {
  it('discards changes, checks out previous, reinstalls, and discards lockfile diff', async () => {
    const ports = makePorts();
    await runRestoreWorkspacePhase({ log: new TestLogger(), ports });
    expect(discardChanges).toHaveBeenCalledTimes(2);
    expect(checkoutPrevious).toHaveBeenCalled();
    expect(ports.pkgMgr.exec).toHaveBeenCalledWith(['install']);
  });
});

describe('WorkspacePhaseError', () => {
  it('carries exitCode and userError', () => {
    const error = new WorkspacePhaseError('boom', exitCodes.GIT_NOT_CLEAN, true);
    expect(error.exitCode).toBe(exitCodes.GIT_NOT_CLEAN);
    expect(error.userError).toBe(true);
  });
});
