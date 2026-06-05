import { createInterface } from 'node:readline';

import type { Options } from 'execa';

import { runCommand } from '../lib/shell/shell';
import { Deps } from '../types';
import gitNoCommits from '../ui/messages/errors/gitNoCommits';
import gitNotInitialized from '../ui/messages/errors/gitNotInitialized';
import gitNotInstalled from '../ui/messages/errors/gitNotInstalled';
import { DEFAULT_GIT_TIMEOUT_SECONDS } from './constants';

export type GitDeps = Pick<Deps, 'log'> & { options?: { gitTimeout?: number } };

const defaultOptions: Options = {
  env: { LANG: 'C', LC_ALL: 'C' }, // make sure we're speaking English
  all: true, // interleave stdout and stderr
  shell: true, // we'll deal with escaping ourselves (for now)
};

/**
 * Retrieve the git timeout in milliseconds.
 *
 * @param depOptions The options object for the Git command (this contains the `gitTimeout` property if it's set).
 *
 @returns the git timeout in milliseconds, defaulting to `DEFAULT_GIT_TIMEOUT_SECONDS` if not set.
 */
function getGitTimeout(depOptions: GitDeps['options']): number {
  return depOptions?.gitTimeout ?? DEFAULT_GIT_TIMEOUT_SECONDS * 1000;
}

/**
 * Execute a Git command in the local terminal.
 *
 * @param deps Standard context object.
 * @param deps.log Standard context logger.
 * @param deps.options Options object for the Git command.
 * @param command The command to execute.
 * @param options Execa options
 *
 * @returns The result of the command from the terminal.
 */
export async function execGitCommand(
  { log, options: depOptions }: GitDeps,
  command: string,
  options?: Options
) {
  try {
    log.debug(`execGitCommand: ${command}`);
    const timeout = getGitTimeout(depOptions);
    const { all, stdout } = await runCommand(command, { timeout, ...defaultOptions, ...options });
    // If the caller sets `all: false`, then `stdout` will be the output. Otherwise, `all` will
    // contain interleaved stdout and stderr.
    const output = all ?? stdout;

    if (output === undefined) {
      throw new Error(`Unexpected missing git command output for command: '${command}'`);
    }

    const result = output.toString();
    log.debug(`execGitCommand result: '${result}'`);
    return result;
  } catch (error) {
    const { message } = error;

    log.debug(`execGitCommand error: ${message}`);

    if (message.includes('not a git repository')) {
      throw new Error(gitNotInitialized({ command }));
    }

    if (message.includes('git not found')) {
      throw new Error(gitNotInstalled({ command }));
    }

    if (message.includes('does not have any commits yet')) {
      throw new Error(gitNoCommits({ command }));
    }

    throw error;
  }
}

/**
 * Execute a Git command in the local terminal and just get the first line.
 *
 * @param deps Standard context object.
 * @param deps.log Standard context logger.
 * @param deps.options Options object for the Git command.
 * @param command The command to execute.
 * @param options Execa options
 *
 * @returns The first line of the command from the terminal.
 */
export async function execGitCommandOneLine(
  { log, options: depOptions }: GitDeps,
  command: string,
  options?: Options
) {
  log.debug(`execGitCommandOneLine: ${command}`);
  const timeout = getGitTimeout(depOptions);
  const process = runCommand(command, {
    timeout,
    ...defaultOptions,
    buffer: false,
    ...options,
  });

  return Promise.race([
    // This promise will resolve only if there is an error or it times out
    (async () => {
      await process;

      throw new Error(`Unexpected missing git command output for command: '${command}'`);
    })(),
    // We expect this promise to resolve first
    new Promise<string>((resolve, reject) => {
      if (!process.stdout) {
        return reject(new Error('Unexpected missing stdout'));
      }

      const rl = createInterface(process.stdout);
      rl.once('line', (line) => {
        rl.close();
        process.kill();

        resolve(line);
      });
    }),
  ]);
}

/**
 * Execute a Git command in the local terminal and count the lines in the result
 *
 * @param deps Standard context object.
 * @param deps.log Standard context logger.
 * @param deps.options Options object for the Git command.
 * @param command The command to execute.
 * @param options Execa options
 *
 * @returns The number of lines the command returned
 */
export async function execGitCommandCountLines(
  { log, options: depOptions }: GitDeps,
  command: string,
  options?: Options
) {
  log.debug(`execGitCommandCountLines: ${command}`);
  const timeout = getGitTimeout(depOptions);
  const process = runCommand(command, {
    timeout,
    ...defaultOptions,
    buffer: false,
    ...options,
  });
  if (!process.stdout) {
    throw new Error('Unexpected missing stdout');
  }

  let lineCount = 0;
  const rl = createInterface(process.stdout);
  rl.on('line', () => {
    lineCount += 1;
  });

  // If the process errors, this will throw
  await process;

  return lineCount;
}
