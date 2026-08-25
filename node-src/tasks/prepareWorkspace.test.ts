import { describe, expect, it, vi } from 'vitest';

import * as git from '../git/git';
import { installDependencies as unmockedInstallDependencies } from '../lib/installDependencies';
import { TaskFailure } from '../lib/setExitCode';
import TestLogger from '../lib/testLogger';
import { runPrepareWorkspace } from './prepareWorkspace';

vi.mock('../git/git');
vi.mock('../lib/installDependencies');

const checkout = vi.mocked(git.checkout);
const isClean = vi.mocked(git.isClean);
const isUpToDate = vi.mocked(git.isUpToDate);
const findMergeBase = vi.mocked(git.findMergeBase);
const installDependencies = vi.mocked(unmockedInstallDependencies);

const log = new TestLogger();
const input = { patchHeadRef: 'head', patchBaseRef: 'base' };
const makeDeps = () => ({ log, options: input, report: vi.fn() }) as any;

const catchError = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error('Expected runPrepareWorkspace to reject');
    },
    (error) => error
  );

describe('runPrepareWorkspace', () => {
  it('retrieves the merge base, does a git checkout and installs dependencies', async () => {
    isClean.mockResolvedValue(true);
    isUpToDate.mockResolvedValue(true);
    findMergeBase.mockResolvedValue('1234asd');
    const deps = makeDeps();

    const result = await runPrepareWorkspace(deps, input);

    expect(result).toEqual({ kind: 'continue', output: { mergeBase: '1234asd' } });
    expect(checkout).toHaveBeenCalledWith(deps, '1234asd');
    expect(installDependencies).toHaveBeenCalled();
  });

  it('fails when not clean', async () => {
    isClean.mockResolvedValue(false);
    const deps = makeDeps();

    const error = await catchError(runPrepareWorkspace(deps, input));

    expect(error).toBeInstanceOf(TaskFailure);
    expect(error.message).toBe('Working directory is not clean');
    expect(error.exitCode).toBe(101);
    expect(error.userError).toBe(true);
  });

  it('fails when not up-to-date', async () => {
    isClean.mockResolvedValue(true);
    isUpToDate.mockResolvedValue(false);
    const deps = makeDeps();

    const error = await catchError(runPrepareWorkspace(deps, input));

    expect(error).toBeInstanceOf(TaskFailure);
    expect(error.message).toBe('Workspace not up-to-date with remote');
    expect(error.exitCode).toBe(102);
    expect(error.userError).toBe(true);
  });

  it('fails when no merge base is found', async () => {
    isClean.mockResolvedValue(true);
    isUpToDate.mockResolvedValue(true);
    findMergeBase.mockResolvedValue(undefined);
    const deps = makeDeps();

    const error = await catchError(runPrepareWorkspace(deps, input));

    expect(error).toBeInstanceOf(TaskFailure);
    expect(error.message).toBe('Could not find a merge base');
    expect(error.exitCode).toBe(103);
    expect(error.userError).toBe(true);
  });

  it("fails when dependencies can't be installed", async () => {
    isClean.mockResolvedValue(true);
    isUpToDate.mockResolvedValue(true);
    findMergeBase.mockResolvedValue('1234asd');
    installDependencies.mockRejectedValueOnce(new Error('some error'));
    const deps = makeDeps();

    const error = await catchError(runPrepareWorkspace(deps, input));

    expect(error).toBeInstanceOf(TaskFailure);
    expect(error.message).toBe('Failed to install dependencies');
    expect(error.exitCode).toBe(104);
    expect(error.userError).toBe(false);
  });
});
