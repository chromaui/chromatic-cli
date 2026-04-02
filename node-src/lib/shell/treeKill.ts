import { exec } from 'child_process';
import { readFileSync } from 'fs';
import { promisify } from 'util';

const pExec = promisify(exec);

/**
 * Best effort process tree killing from a pid.
 *
 * @param pid Root process ID
 * @param signal Signal to send to the processes, default is 'SIGKILL'
 */
export async function treeKill(pid: number, signal: NodeJS.Signals = 'SIGKILL') {
  if (process.platform === 'win32') {
    await pExec(`taskkill /pid ${pid} /T /F`);
  } else {
    let pids = [];
    pids = process.platform === 'darwin' ? await darwinGetChildPids(pid) : linuxGetChildPids(pid);
    for (const child_pid of pids) {
      process.kill(child_pid, signal);
    }
  }
}

function linuxGetChildPids(pid: number) {
  try {
    const children = readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8');
    const pids = children.split(' ').filter(Boolean).map(Number);
    return [pids, ...pids.map((child_pid) => linuxGetChildPids(child_pid))].flat();
  } catch {
    return [];
  }
}

async function darwinGetChildPids(pid: number) {
  try {
    const { stdout } = await pExec('pgrep -P ' + pid);
    const pids = stdout.split('\n').filter(Boolean).map(Number);
    for (const child_pid of pids) {
      pids.push(...(await darwinGetChildPids(child_pid)));
    }
    return pids;
  } catch {
    return [];
  }
}
