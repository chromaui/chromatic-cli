import { execa, Options, parseCommandString, type ResultPromise } from 'execa';
import { kill } from 'process';
import treeKill from 'tree-kill';

import { Context } from '../../types';

/**
 * Run a command in the shell. This is a wrapper around `execa` so .kill() and timeouts kill the
 * entire process tree instead of just the first child.
 *
 * The returned object can be used in two ways:
 * 1. Buffered mode: await the result to get stdout/stderr after completion
 * 2. Streaming mode: access .stdout/.stderr properties during execution (requires buffer: false)
 *
 * @param context Standard context object.
 * @param context.log Standard context logger.
 * @param command The command to run.
 * @param options Execa options. Note: `timeout` is handled internally.
 *
 * @returns An execa `ResultPromise` with .kill() and timeout overwritten.
 */
export function runCommand(
  { log }: Pick<Context, 'log'>,
  command: string,
  options: Options = {}
): ResultPromise {
  const { timeout, ...optionsWithoutTimeout } = options;
  const [cmd, ...args] = parseCommandString(command);
  const subprocess = execa(cmd, args, optionsWithoutTimeout);

  // Override subprocess.kill() because we want to kill the entire process tree on timeout instead
  // of just the child process created by `execa`
  subprocess.kill = () => {
    if (!subprocess.pid) {
      return false;
    }

    try {
      treeKill(subprocess.pid);
    } catch (err) {
      log.warn(`Failed to terminate process tree for ${subprocess.pid}: ${err}`);
      kill(subprocess.pid);
    }
    return true;
  };

  // If we don't have a timeout, save some time by not creating a timeout promise
  if (timeout === undefined) {
    return subprocess;
  }

  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      subprocess.kill();
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);
  });

  // Ensure we clear the timeout in either case
  const racedPromise = Promise.race([subprocess, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });

  return Object.assign(racedPromise, subprocess) as ResultPromise;
}
