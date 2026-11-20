import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
export function answered<T>(value: T | symbol): T {
  if (clack.isCancel(value)) {
    clack.cancel('Setup cancelled. Nothing else was changed.');
    throw new SubcommandFailure('Cancelled', { exitCode: 130 });
  }
  return value;
}

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

export function relativeOrDot(from: string, to: string) {
  return path.relative(from, to).split(path.sep).join('/') || '.';
}

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

/** Collects file changes, and writes them unless this is a dry run. */
export class FileWriter {
  readonly changes: { file: string; kind: 'created' | 'updated'; content: string }[] = [];

  constructor(
    private readonly dryRun: boolean,
    private readonly displayRoot: string
  ) {}

  write(file: string, content: string) {
    const existed = existsSync(file);
    if (existed && readFileSync(file, 'utf8') === content) return false;
    this.changes.push({ file, kind: existed ? 'updated' : 'created', content });
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
  const content =
    missing.length === 0
      ? text
      : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${text ? '\n' : ''}# Chromatic\n${missing.join('\n')}\n`;
  return { file, missing, content };
}
