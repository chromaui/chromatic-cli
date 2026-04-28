import { execa, parseCommandString } from 'execa';

import { treeKill } from '../shell/treeKill';
import { ProcessHandle, ProcessRunner, ProcessRunnerOptions } from './processRunner';

function attachTreeKill(subprocess: any) {
  if (!subprocess.kill) return;
  const originalKill = subprocess.kill.bind(subprocess);
  subprocess.kill = () => {
    const pid = subprocess.pid;
    if (!pid) return false;
    // Fire-and-forget tree kill so we don't leave orphaned grandchildren.
    treeKill(pid)
      .catch(() => {})
      .finally(() => {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          /* process may already be dead */
        }
      });
    return originalKill();
  };
}

function withTimeout(subprocess: any, timeout: number) {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      subprocess.kill?.();
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);
  });
  return Promise.race([subprocess, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

/**
 * Construct the production {@link ProcessRunner} backed by `execa`. Mirrors
 * the existing `runCommand` helper: tree-kills the entire process tree on
 * `kill` or on timeout, and races a timeout promise against the subprocess.
 *
 * @returns A ProcessRunner that spawns real subprocesses via execa.
 */
export function createExecaProcessRunner(): ProcessRunner {
  return {
    run(command: string, options: ProcessRunnerOptions = {}): ProcessHandle {
      const { timeout, signal, ...passthroughOptions } = options;
      const [cmd, ...args] = parseCommandString(command);
      const subprocess = execa(cmd, args, {
        ...(passthroughOptions as any),
        cancelSignal: signal,
      });

      attachTreeKill(subprocess);

      if (timeout === undefined) {
        return subprocess as unknown as ProcessHandle;
      }

      const racedPromise = withTimeout(subprocess, timeout);
      return Object.assign(racedPromise, subprocess) as unknown as ProcessHandle;
    },
  };
}
