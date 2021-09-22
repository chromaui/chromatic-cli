import { checkout, findMergeBase, isClean, isUpToDate } from '../git/git';
import installDependencies from '../lib/installDependencies';
import { runPrepareWorkspace } from './prepareWorkspace';

jest.mock('../git/git');
jest.mock('../lib/installDependencies');
jest.mock('./restoreWorkspace');

const log = { error: jest.fn() };

describe('runPrepareWorkspace', () => {
  it('retrieves the merge base, does a git checkout and installs dependencies', async () => {
    isClean.mockReturnValue(true);
    isUpToDate.mockReturnValue(true);
    findMergeBase.mockReturnValue('1234asd');
    const ctx = { log, options: { patchHeadRef: 'head', patchBaseRef: 'base' } };

    await runPrepareWorkspace(ctx, {});
    expect(ctx.mergeBase).toBe('1234asd');
    expect(checkout).toHaveBeenCalledWith('1234asd');
    expect(installDependencies).toHaveBeenCalled();
  });

  it('fails when not clean', async () => {
    isClean.mockReturnValue(false);
    const ctx = { log, options: { patchHeadRef: 'head', patchBaseRef: 'base' } };

    await expect(runPrepareWorkspace(ctx, {})).rejects.toThrow('Working directory is not clean');
    expect(ctx.mergeBase).toBe(undefined);
    expect(ctx.exitCode).toBe(101);
    expect(ctx.userError).toBe(true);
  });

  it('fails when not up-to-date', async () => {
    isClean.mockReturnValue(true);
    isUpToDate.mockReturnValue(false);
    const ctx = { log, options: { patchHeadRef: 'head', patchBaseRef: 'base' } };

    await expect(runPrepareWorkspace(ctx, {})).rejects.toThrow(
      'Workspace not up-to-date with remote'
    );
    expect(ctx.mergeBase).toBe(undefined);
    expect(ctx.exitCode).toBe(102);
    expect(ctx.userError).toBe(true);
  });

  it('fails when no merge base is found', async () => {
    isClean.mockReturnValue(true);
    isUpToDate.mockReturnValue(true);
    findMergeBase.mockReturnValue(undefined);
    const ctx = { log, options: { patchHeadRef: 'head', patchBaseRef: 'base' } };

    await expect(runPrepareWorkspace(ctx, {})).rejects.toThrow('Could not find a merge base');
    expect(ctx.mergeBase).toBe(undefined);
    expect(ctx.exitCode).toBe(103);
    expect(ctx.userError).toBe(true);
  });

  it("fails when dependencies can't be installed", async () => {
    isClean.mockReturnValue(true);
    isUpToDate.mockReturnValue(true);
    findMergeBase.mockReturnValue('1234asd');
    installDependencies.mockRejectedValue();
    const ctx = { log, options: { patchHeadRef: 'head', patchBaseRef: 'base' } };

    await expect(runPrepareWorkspace(ctx, {})).rejects.toThrow('Failed to install dependencies');
    expect(ctx.mergeBase).toBe(undefined);
    expect(ctx.exitCode).toBe(104);
  });
});
