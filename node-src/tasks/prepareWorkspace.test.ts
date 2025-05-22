import { describe, expect, it, vi } from 'vitest';

import * as git from '../git/git';
import installDeps from '../lib/installDependencies';
import { runPrepareWorkspace } from './prepareWorkspace';

vi.mock('../git/git');
vi.mock('../lib/installDependencies');
vi.mock('./restoreWorkspace');

const checkout = vi.mocked(git.checkout);
const isClean = vi.mocked(git.isClean);
const isUpToDate = vi.mocked(git.isUpToDate);
const findMergeBase = vi.mocked(git.findMergeBase);
const installDependencies = vi.mocked(installDeps);

const log = { error: vi.fn() };

describe('runPrepareWorkspace', () => {
  it('retrieves the merge base, does a git checkout and installs dependencies', async () => {
    isClean.mockResolvedValue(true);
    isUpToDate.mockResolvedValue(true);
    findMergeBase.mockResolvedValue('1234asd');
    const ctx = { log, options: { patchHeadRef: 'head', patchBaseRef: 'base' } } as any;

    await runPrepareWorkspace(ctx, {} as any);
    expect(ctx.mergeBase).toBe('1234asd');
    expect(checkout).toHaveBeenCalledWith(ctx, '1234asd');
    expect(installDependencies).toHaveBeenCalled();
  });

  it('fails when not clean', async () => {
    isClean.mockResolvedValue(false);
    const ctx = { log, options: { patchHeadRef: 'head', patchBaseRef: 'base' } } as any;

    await expect(runPrepareWorkspace(ctx, {} as any)).rejects.toThrow(
      'Working directory is not clean'
    );
    expect(ctx.mergeBase).toBe(undefined);
    expect(ctx.exitCode).toBe(101);
    expect(ctx.userError).toBe(true);
  });

  it('fails when not up-to-date', async () => {
    isClean.mockResolvedValue(true);
    isUpToDate.mockResolvedValue(false);
    const ctx = { log, options: { patchHeadRef: 'head', patchBaseRef: 'base' } } as any;

    await expect(runPrepareWorkspace(ctx, {} as any)).rejects.toThrow(
      'Workspace not up-to-date with remote'
    );
    expect(ctx.mergeBase).toBe(undefined);
    expect(ctx.exitCode).toBe(102);
    expect(ctx.userError).toBe(true);
  });

  it('fails when no merge base is found', async () => {
    isClean.mockResolvedValue(true);
    isUpToDate.mockResolvedValue(true);
    findMergeBase.mockResolvedValue(undefined);
    const ctx = { log, options: { patchHeadRef: 'head', patchBaseRef: 'base' } } as any;

    await expect(runPrepareWorkspace(ctx, {} as any)).rejects.toThrow(
      'Could not find a merge base'
    );
    expect(ctx.mergeBase).toBe(undefined);
    expect(ctx.exitCode).toBe(103);
    expect(ctx.userError).toBe(true);
  });

  it("fails when dependencies can't be installed", async () => {
    isClean.mockResolvedValue(true);
    isUpToDate.mockResolvedValue(true);
    findMergeBase.mockResolvedValue('1234asd');
    installDependencies.mockRejectedValue(new Error('some error'));
    const ctx = { log, options: { patchHeadRef: 'head', patchBaseRef: 'base' } } as any;

    await expect(runPrepareWorkspace(ctx, {} as any)).rejects.toThrow(
      'Failed to install dependencies'
    );
    expect(ctx.mergeBase).toBe(undefined);
    expect(ctx.exitCode).toBe(104);
  });
});
