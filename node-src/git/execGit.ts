import { createInterface } from 'node:readline';

import type { Options } from 'execa';

import { runCommand } from '../lib/shell/shell';
import { NULL_BYTE } from '../lib/utilities';
import { Deps } from '../types';
import gitNoCommits from '../ui/messages/errors/gitNoCommits';
import gitNotInitialized from '../ui/messages/errors/gitNotInitialized';
import gitNotInstalled from '../ui/messages/errors/gitNotInstalled';
import { DEFAULT_GIT_TIMEOUT_SECONDS } from './constants';

/**
 * What every git call needs. `options` is required so a caller can't drop the user's configured
 * `gitTimeout` (milliseconds) by passing only `{ log }`; pass `options: {}` where there is none.
 */
export type GitDeps = Pick<Deps, 'log'> & { options: { gitTimeout?: number } };

/**
 * Execa options plus `logResult`, which is on by default. Turn it off for a command whose output is
 * unbounded, such as a full file listing, so the debug log is not flooded with it. `all` isn't
 * accepted, because the result is always stdout alone.
 */
type ExecGitOptions = Options & { all?: never; logResult?: boolean };

const defaultOptions = {
  env: { LANG: 'C', LC_ALL: 'C' }, // make sure we're speaking English
  // Only stdout is the result: git writes warnings to stderr even when it succeeds.
  // `execGitCommand` still puts a failure's stderr in its error message.
  all: false,
  shell: true, // we'll deal with escaping ourselves (for now)
} satisfies Options;

/**
 * Describe a command for logs and error messages. An argv array is shell-quoted where needed, so
 * argument boundaries stay visible and the line can be pasted into a terminal.
 *
 * @param command The command, as a string or an argv array.
 *
 * @returns The command as one line.
 */
function describeCommand(command: string | [string, ...string[]]) {
  if (typeof command === 'string') return command;
  return command
    .map((argument) =>
      /^[\w@%+=:,./-]+$/.test(argument) ? argument : `'${argument.replaceAll("'", `'\\''`)}'`
    )
    .join(' ');
}

/**
 * Retrieve the git timeout in milliseconds.
 *
 * @param depOptions The options object for the Git command (this contains the `gitTimeout` property if it's set).
 *
 @returns the git timeout in milliseconds, defaulting to `DEFAULT_GIT_TIMEOUT_SECONDS` if not set.
 */
export function getGitTimeout(depOptions: GitDeps['options']): number {
  return depOptions.gitTimeout ?? DEFAULT_GIT_TIMEOUT_SECONDS * 1000;
}

/**
 * Execute a Git command in the local terminal.
 *
 * @param deps Standard context object.
 * @param deps.log Standard context logger.
 * @param deps.options Options object for the Git command.
 * @param command The command to execute. Pass an argv array, which runs without a shell, when it
 * includes a value from outside the CLI, such as a branch name.
 * @param options Execa options, plus `logResult`; see `ExecGitOptions`.
 * @param options.logResult Whether to write the command's output to the debug log.
 *
 * @returns The result of the command from the terminal.
 */
export async function execGitCommand(
  { log, options: depOptions }: GitDeps,
  command: string | [string, ...string[]],
  { logResult = true, ...options }: ExecGitOptions = {}
) {
  const description = describeCommand(command);
  try {
    log.debug(`execGitCommand: ${description}`);
    const timeout = getGitTimeout(depOptions);
    const { stdout, stderr } = await runCommand(command, {
      timeout,
      ...defaultOptions,
      ...options,
    });

    if (stdout === undefined) {
      throw new Error(`Unexpected missing git command output for command: '${description}'`);
    }

    const result = stdout.toString();
    if (logResult) {
      log.debug(`execGitCommand result: '${result}'`);
      if (stderr) {
        log.debug(`execGitCommand stderr: '${stderr.toString()}'`);
      }
    }
    return result;
  } catch (error) {
    throw translateGitError(log, description, error);
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
  command: string | [string, ...string[]],
  options?: Options
): AsyncGenerator<string> {
  const description = describeCommand(command);
  log.debug(`execGitCommandEntries: ${description}`);
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
    throw translateGitError(log, description, error);
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
