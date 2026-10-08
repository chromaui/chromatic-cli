import { createInterface } from 'node:readline';

import type { Options } from 'execa';

import { runCommand } from '../lib/shell/shell';
import { Deps } from '../types';
import gitNoCommits from '../ui/messages/errors/gitNoCommits';
import gitNotInitialized from '../ui/messages/errors/gitNotInitialized';
import gitNotInstalled from '../ui/messages/errors/gitNotInstalled';
import { DEFAULT_GIT_TIMEOUT_SECONDS } from './constants';

export type GitDeps = Pick<Deps, 'log'> & { options?: { gitTimeout?: number } };

/**
 * Execa options plus `logResult`, which is on by default. Turn it off for a command whose output is
 * unbounded, such as a full file listing, so the debug log is not flooded with it.
 */
type ExecGitOptions = Options & { logResult?: boolean };

const defaultOptions: Options = {
  env: { LANG: 'C', LC_ALL: 'C' }, // make sure we're speaking English
  all: true, // interleave stdout and stderr
  shell: true, // we'll deal with escaping ourselves (for now)
};

const NULL_BYTE = '\0';

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
 * @param options Execa options, plus `logResult`; see {@link ExecGitOptions}.
 * @param options.logResult Whether to write the command's output to the debug log.
 *
 * @returns The result of the command from the terminal.
 */
export async function execGitCommand(
  { log, options: depOptions }: GitDeps,
  command: string,
  { logResult = true, ...options }: ExecGitOptions = {}
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
    if (logResult) {
      log.debug(`execGitCommand result: '${result}'`);
    }
    return result;
  } catch (error) {
    throw translateGitError(log, command, error);
  }
}

/**
 * Execute a Git command whose NUL-separated output may be too large to hold at once, such as a
 * listing of every file in a monorepo, yielding each entry as it arrives. Only stdout is read, so a
 * stderr warning can't masquerade as an entry, and nothing is written to the debug log.
 *
 * @param deps Standard context object.
 * @param deps.log Standard context logger.
 * @param deps.options Options object for the Git command.
 * @param command The command to execute, which must separate its output with NUL (`-z`).
 * @param options Execa options
 *
 * @yields {string} Each NUL-terminated entry of the command's stdout, without the terminator.
 */
export async function* execGitCommandEntries(
  { log, options: depOptions }: GitDeps,
  command: string,
  options?: Options
): AsyncGenerator<string> {
  log.debug(`execGitCommandEntries: ${command}`);
  const timeout = getGitTimeout(depOptions);
  const process = runCommand(command, {
    timeout,
    ...defaultOptions,
    buffer: false,
    all: false,
    ...options,
  });
  if (!process.stdout) {
    throw new Error('Unexpected missing stdout');
  }

  // Noting the exit here also marks a rejection as handled, so a consumer that stops early and never
  // awaits the process doesn't surface its exit as an unhandled rejection.
  let running = true;
  const onExit = () => {
    running = false;
  };
  process.then(onExit, onExit);

  try {
    // Decoding on the stream keeps a multi-byte character whole across a chunk boundary.
    process.stdout.setEncoding('utf8');
    let partial = '';
    for await (const chunk of process.stdout) {
      const entries = (partial + chunk).split(NULL_BYTE);
      partial = entries.pop() ?? '';
      yield* entries;
    }
    if (partial) {
      yield partial;
    }

    // If the process errors, this will throw
    await process;
  } catch (error) {
    throw translateGitError(log, command, error);
  } finally {
    // A consumer that stops early must not leave git running.
    if (running) {
      process.kill();
    }
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

/**
 * Turns a failure of a git command into the user-facing error for it, where there is one.
 *
 * @param log Standard context logger.
 * @param command The command that failed.
 * @param error The failure.
 *
 * @returns The error to throw.
 */
function translateGitError(log: GitDeps['log'], command: string, error: any): Error {
  const { message } = error;

  log.debug(`execGitCommand error: ${message}`);

  if (message.includes('not a git repository')) {
    return new Error(gitNotInitialized({ command }));
  }

  if (message.includes('git not found')) {
    return new Error(gitNotInstalled({ command }));
  }

  if (message.includes('does not have any commits yet')) {
    return new Error(gitNoCommits({ command }));
  }

  return error;
}
