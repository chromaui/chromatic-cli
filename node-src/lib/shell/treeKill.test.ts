import { type ChildProcess, spawn } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';

import { treeKill } from './treeKill';

function pidIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Spawns a Node parent process that itself spawns a `sleep 60` child.
 * Returns handles to both so we can assert on their lifecycle independently.
 *
 * @returns
 */
function spawnTree(): Promise<{ parent: ChildProcess; childPid: number }> {
  return new Promise((resolve, reject) => {
    const parent = spawn('node', [
      '-e',
      `
      const { spawn } = require('child_process');
      const child = spawn('sleep', ['60']);
      process.stdout.write('child:' + child.pid + '\\n');
      setInterval(() => {}, 60000);
      `,
    ]);

    parent.stdout?.on('data', (data) => {
      const match = data.toString().match(/child:(\d+)/);
      if (match) {
        resolve({ parent, childPid: Number(match[1]) });
      }
    });

    parent.on('error', reject);
  });
}

const processesToCleanup: ChildProcess[] = [];

afterEach(() => {
  for (const proc of processesToCleanup) {
    try {
      proc.kill('SIGKILL');
    } catch {
      // already dead
    }
  }
  processesToCleanup.length = 0;
});

describe('treeKill', () => {
  it('kills child processes but not the root pid', async () => {
    const { parent, childPid } = await spawnTree();
    processesToCleanup.push(parent);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const parentPid = parent.pid!;

    expect(pidIsAlive(parentPid)).toBe(true);
    expect(pidIsAlive(childPid)).toBe(true);

    await treeKill(parentPid);
    await new Promise((r) => setTimeout(r, 100));

    expect(pidIsAlive(childPid)).toBe(false);
    expect(pidIsAlive(parentPid)).toBe(true);
  });

  it('does not throw for a non-existent pid', async () => {
    await expect(treeKill(2_147_483_647)).resolves.toBeUndefined();
  });
});
