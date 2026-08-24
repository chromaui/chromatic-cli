import { getCliCommand as unmockedGetCliCommand } from '@antfu/ni';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installDependencies } from './installDependencies';

vi.mock('@antfu/ni');

const getCliCommand = vi.mocked(unmockedGetCliCommand);

afterEach(() => vi.restoreAllMocks());

describe('installDependencies', () => {
  it('runs the detected install command and returns the result without buffering stdout/stderr', async () => {
    const stdout = vi.spyOn(process.stdout, 'write');
    const stderr = vi.spyOn(process.stderr, 'write');
    getCliCommand.mockResolvedValue('node --version');

    const result = await installDependencies();

    expect(getCliCommand).toHaveBeenCalledWith(expect.any(Function), [], { programmatic: true });
    expect(result?.stdout).toMatch(/^v\d+/);
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it('captures failure output instead of writing it to the parent process', async () => {
    const stdout = vi.spyOn(process.stdout, 'write');
    const stderr = vi.spyOn(process.stderr, 'write');
    getCliCommand.mockResolvedValue('node --invalid-install-test-option');

    await expect(installDependencies()).rejects.toMatchObject({
      stderr: expect.stringContaining('--invalid-install-test-option'),
    });

    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it('fails when no install command is resolved', async () => {
    getCliCommand.mockResolvedValue(undefined);

    await expect(installDependencies()).rejects.toThrow();
  });
});
