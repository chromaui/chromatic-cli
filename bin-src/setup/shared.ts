import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import * as clack from '@clack/prompts';
import picocolors from 'picocolors';

import { SubcommandFailure } from '../subcommandFailure';

export const color = {
  cta: picocolors.cyan,
  muted: picocolors.dim,
  bold: picocolors.bold,
  success: picocolors.green,
  warning: picocolors.yellow,
  error: picocolors.red,
};

/**
 * Stops the command when the user cancels a prompt (Ctrl+C or Escape).
 *
 * @param value The prompt's answer.
 *
 * @returns The answer, when the prompt was not cancelled.
 */
export function answered<T>(value: T): Exclude<T, symbol> {
  if (clack.isCancel(value)) {
    clack.cancel('Setup cancelled. Nothing else was changed.');
    throw new SubcommandFailure('Cancelled', { exitCode: 130 });
  }
  // Prompts only return a symbol to cancel, which isCancel caught above.
  return value as Exclude<T, symbol>;
}

/**
 * Runs git and returns its trimmed output.
 *
 * @param args Git arguments.
 * @param cwd Where to run it.
 *
 * @returns The output, or undefined when git fails.
 */
export function git(args: string[], cwd: string) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

/**
 * Calls visit with each file in the repository that git doesn't ignore, tracked or not, relative
 * to the root. Reads git's output as it streams, so a large repository's file list never sits in
 * memory at once.
 *
 * @param gitRoot Absolute repository root.
 * @param visit Called once per file.
 *
 * @returns A promise that settles when git has listed every file, and rejects when git fails.
 */
export function forEachRepoFile(gitRoot: string, visit: (file: string) => void) {
  return new Promise<void>((resolve, reject) => {
    // -z ends each path with a NUL and leaves non-ASCII paths unquoted.
    const child = spawn('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: gitRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let partial = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      const paths = (partial + chunk).split('\0');
      partial = paths.pop() ?? '';
      for (const file of paths) visit(file);
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`git ls-files failed in ${gitRoot}`))
    );
  });
}

/**
 * The edits that save a project token in a .env and keep git from committing it, or why that isn't
 * safe: git tracks the file, or the user's .gitignore deliberately un-ignores it.
 *
 * @param gitRoot Absolute repository root.
 * @param directory Absolute directory the .env goes in, where Chromatic runs.
 * @param token The project token.
 *
 * @returns The edits, or the reason not to write the token.
 */
export function tokenEnvironmentEdits(gitRoot: string, directory: string, token: string) {
  const file = path.join(directory, '.env');
  if (isTracked(file)) {
    return {
      reason: `git tracks ${relativeOrDot(gitRoot, file)}, so the token would be committed`,
    };
  }
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const line = `CHROMATIC_PROJECT_TOKEN=${token}`;
  const edits = [
    {
      file,
      content: /^CHROMATIC_PROJECT_TOKEN=/m.test(text)
        ? text.replace(/^CHROMATIC_PROJECT_TOKEN=.*$/m, line)
        : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`,
    },
  ];
  // Ask git rather than reading .gitignore: it knows about negations, nested files and excludes.
  if (ignoredWith(gitRoot, file)) return { edits };
  const relative = relativeOrDot(gitRoot, file);
  const pattern = relative === '.env' ? '.env' : `/${relative}`;
  // Ask again with the pattern init would add. An excludes file ranks below every .gitignore, so a
  // rule like !.env, in a .gitignore or .git/info/exclude, still wins and the token isn't written.
  if (!ignoredWith(gitRoot, file, pattern)) {
    return {
      reason: `an ignore rule un-ignores ${relative}, so the token would be committed`,
    };
  }
  // Always add the pattern: git just said no existing line ignores the file, even one that looks
  // like it should, such as ./.env.
  const gitignore = path.join(gitRoot, '.gitignore');
  const ignoreText = existsSync(gitignore) ? readFileSync(gitignore, 'utf8') : '';
  return { edits: [...edits, { file: gitignore, content: withSection(ignoreText, [pattern]) }] };
}

/**
 * Whether git ignores a file, optionally with one more pattern in an excludes file.
 *
 * @param gitRoot Absolute repository root.
 * @param file Absolute path.
 * @param pattern A pattern to add, relative to the repository root.
 *
 * @returns True when git would ignore the file.
 */
function ignoredWith(gitRoot: string, file: string, pattern?: string) {
  const args = ['check-ignore', '-q', '--no-index', '--', file];
  if (!pattern) return git(args, gitRoot) !== undefined;
  const directory = mkdtempSync(path.join(tmpdir(), 'chromatic-exclude-'));
  try {
    const excludes = path.join(directory, 'exclude');
    writeFileSync(excludes, `${pattern}\n`);
    return git(['-c', `core.excludesFile=${excludes}`, ...args], gitRoot) !== undefined;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/**
 * Whether git tracks a file, so writing a secret to it would get committed.
 *
 * @param file Absolute path.
 *
 * @returns True when the file is in the index.
 */
function isTracked(file: string) {
  return (
    git(['ls-files', '--error-unmatch', '--', path.basename(file)], path.dirname(file)) !==
    undefined
  );
}

/**
 * A relative path, or "." when the two are the same.
 *
 * @param from The base path.
 * @param to The target path.
 *
 * @returns The relative path.
 */
export function relativeOrDot(from: string, to: string) {
  return path.relative(from, to).split(path.sep).join('/') || '.';
}

/**
 * Reads a JSON file, or returns undefined when it's missing or invalid.
 *
 * @param filePath The file to read.
 *
 * @returns The parsed JSON.
 */
export function readJson(filePath: string): Record<string, any> | undefined {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Writes JSON with the file's existing indentation and a trailing newline. Short arrays of strings
 * stay on one line, the way people write `untraced` and `externals` by hand.
 *
 * @param value The value to write.
 * @param previousText The file's current text, to keep its indentation.
 *
 * @returns The file's new text.
 */
export function formatJson(value: unknown, previousText?: string) {
  const indent = previousText?.match(/^[\t ]+(?=")/m)?.[0] ?? '  ';
  const text = JSON.stringify(value, undefined, indent).replaceAll(
    /\[\s+((?:"[^"\n]*",\s+)*"[^"\n]*")\s+\]/g,
    (whole, items: string) => {
      const oneLine = `[${items.split(/,\s+/).join(', ')}]`;
      return oneLine.length <= 80 ? oneLine : whole;
    }
  );
  return `${text}\n`;
}

/**
 * Appends lines to a .gitignore under a "# Chromatic" heading, or after the heading init added
 * earlier when it's the file's last section.
 *
 * @param text The file's text.
 * @param lines The lines to add.
 *
 * @returns The new text.
 */
function withSection(text: string, lines: string[]) {
  const ended = text && !text.endsWith('\n') ? `${text}\n` : text;
  const lastSection = ended.split(/\n\s*\n/).at(-1) ?? '';
  if (lastSection.startsWith('# Chromatic\n')) return `${ended}${lines.join('\n')}\n`;
  return `${ended}${ended ? '\n' : ''}# Chromatic\n${lines.join('\n')}\n`;
}
