import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import * as clack from '@clack/prompts';
import picocolors from 'picocolors';
import picomatch from 'picomatch';

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
 * Files in the repository that git doesn't ignore, tracked or not, relative to the root.
 *
 * @param gitRoot
 *
 * @returns
 */
export function listRepoFiles(gitRoot: string) {
  const output = git(['ls-files', '--cached', '--others', '--exclude-standard'], gitRoot);
  return output ? output.split('\n').filter(Boolean) : [];
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

/** Writes files unless this is a dry run, and words what it did either way. */
export class FileWriter {
  constructor(
    private readonly dryRun: boolean,
    private readonly displayRoot: string
  ) {}

  write(file: string, content: string) {
    if (existsSync(file) && readFileSync(file, 'utf8') === content) return false;
    if (!this.dryRun) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
    return true;
  }

  display(file: string) {
    return relativeOrDot(this.displayRoot, file);
  }

  /**
   * Wording for log lines, so a dry run reads "Would write" instead of "Wrote".
   *
   * @param done
   * @param wouldDo
   *
   * @returns
   */
  say(done: string, wouldDo: string) {
    return this.dryRun ? `Would ${wouldDo}` : done;
  }
}

/**
 * Adds lines to the repository's .gitignore that aren't already in it.
 *
 * @param gitRoot
 * @param wanted
 *
 * @returns
 */
export function gitignoreAdditions(gitRoot: string, wanted: string[]) {
  const file = path.join(gitRoot, '.gitignore');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const present = new Set(text.split('\n').map((line) => line.trim()));
  // Skip entries an existing pattern already covers, like chromatic.log under *.log.
  const patterns = [...present].filter(
    (line) => line && !line.startsWith('#') && !line.startsWith('!')
  );
  const covered = (entry: string) =>
    patterns.some(
      (p) => p === entry || picomatch(p.replace(/^\//, ''), { dot: true })(entry.replace(/^\//, ''))
    );
  const missing = wanted.filter((entry) => !covered(entry));
  return { file, missing, content: missing.length === 0 ? text : withSection(text, missing) };
}

/**
 * Appends a "# Chromatic" section to a .gitignore, after a blank line.
 *
 * @param text The file's text.
 * @param lines The lines to add.
 *
 * @returns The new text.
 */
function withSection(text: string, lines: string[]) {
  const separator = text ? `${text.endsWith('\n') ? '' : '\n'}\n` : '';
  return `${text}${separator}# Chromatic\n${lines.join('\n')}\n`;
}
