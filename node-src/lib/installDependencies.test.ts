import { getCliCommand as unmockedGetCliCommand } from '@antfu/ni';
import { describe, expect, it, vi } from 'vitest';

import { installDependencies } from './installDependencies';
import { runCommand as unmockedRunCommand } from './shell/shell';

vi.mock('@antfu/ni');
vi.mock('./shell/shell');

const getCliCommand = vi.mocked(unmockedGetCliCommand);
const runCommand = vi.mocked(unmockedRunCommand);

describe('installDependencies', () => {
  it('runs the install command detected for the project, without streaming its output', async () => {
    getCliCommand.mockResolvedValue('yarn install');

    await installDependencies();

    expect(getCliCommand).toHaveBeenCalledWith(expect.any(Function), [], { programmatic: true });
    // An exact match keeps `stdio` out of the options, so output stays buffered.
    expect(runCommand).toHaveBeenCalledWith('yarn install', { timeout: expect.any(Number) });
  });

  it('fails when the install command fails', async () => {
    const failure = new Error('yarn install exited with code 1');
    getCliCommand.mockResolvedValue('yarn install');
    runCommand.mockRejectedValue(failure);

    let err;
    try {
      await installDependencies();
    } catch (error) {
      err = error;
    }

    expect(err).toBe(failure);
  });

  it('fails when no install command is detected', async () => {
    getCliCommand.mockResolvedValue(undefined);

    let err;
    try {
      await installDependencies();
    } catch (error) {
      err = error;
    }

    expect(err).toEqual(new Error('Unable to determine the package manager install command'));
    expect(runCommand).not.toHaveBeenCalled();
  });
});
