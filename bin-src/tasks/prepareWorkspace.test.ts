import * as git from '../git/git';
import installDependencies from '../lib/installDependencies';
import { runPrepareWorkspace } from './prepareWorkspace';

jest.mock('../git/git');
jest.mock('../lib/installDependencies');
jest.mock('./restoreWorkspace');

const checkout = <jest.MockedFunction<typeof git.checkout>>git.checkout;
const isClean = <jest.MockedFunction<typeof git.isClean>>git.isClean;
const isUpToDate = <jest.MockedFunction<typeof git.isUpToDate>>git.isUpToDate;
const findMergeBase = <jest.MockedFunction<typeof git.findMergeBase>>git.findMergeBase;

const log = { error: jest.fn() };

describe('runPrepareWorkspace', () => {
  it('retrieves the merge base, does a git checkout and installs dependencies', async () => {
    isClean.mockResolvedValue(true);
    isUpToDate.mockResolvedValue(true);
    findMergeBase.mockResolvedValue('1234asd');
    const ctx = { log, options: { patchHeadRef: 'head', patchBaseRef: 'base' } } as any;

    await runPrepareWorkspace(ctx, {} as any);
    expect(ctx.mergeBase).toBe('1234asd');
    expect(checkout).toHaveBeenCalledWith('1234asd');
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
    installDependencies.mockRejectedValue();
    const ctx = { log, options: { patchHeadRef: 'head', patchBaseRef: 'base' } } as any;

    await expect(runPrepareWorkspace(ctx, {} as any)).rejects.toThrow(
      'Failed to install dependencies'
    );
    expect(ctx.mergeBase).toBe(undefined);
    expect(ctx.exitCode).toBe(104);
  });
});
