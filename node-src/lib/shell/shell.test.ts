import { describe, expect, it } from 'vitest';

import { runCommand } from './shell';

describe('runCommand', () => {
  it('returns stdout on success', async () => {
    const result = await runCommand('echo hello');
    expect(result.stdout).toBe('hello');
  });

  it('kill() terminates the process', async () => {
    const proc = runCommand('sleep 60');
    await new Promise((r) => setTimeout(r, 200));

    expect(proc.pid).toBeDefined();
    proc.kill();

    const error: any = await proc.catch((error) => error);
    expect(error.signal).toBe('SIGKILL');
    expect(error.isTerminated).toBe(true);
  });

  it('times out and kills the process', async () => {
    await expect(runCommand('sleep 60', { timeout: 200 })).rejects.toThrow(/timed out/);
  });
});
