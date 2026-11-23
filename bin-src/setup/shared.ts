import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import * as clack from '@clack/prompts';
// jsonc-parser's main entry is a UMD build whose require calls the bundler can't follow.
import {
  applyEdits,
  findNodeAtLocation,
  modify,
  type Node as JsonNode,
  parse as parseJsonc,
  ParseError,
  parseTree,
} from 'jsonc-parser/lib/esm/main.js';
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
 * Writes JSON with a trailing newline. Short arrays of strings stay on one line, the way people
 * write `untraced` and `externals` by hand.
 *
 * @param value The value to write.
 * @param indent One level of indentation.
 *
 * @returns The text.
 */
function formatJson(value: unknown, indent = '  ') {
  const text = JSON.stringify(value, undefined, indent).replaceAll(
    /\[\s+((?:"[^"\n]*",\s+)*"[^"\n]*")\s+\]/g,
    (whole, items: string) => {
      const oneLine = `[${items.split(/,\s+/).join(', ')}]`;
      return oneLine.length <= 80 ? oneLine : whole;
    }
  );
  return `${text}\n`;
}

const JSONC_OPTIONS = { allowTrailingComma: true, disallowComments: false };

/**
 * Whether a config file's text can be edited in place: JSON, or JSON with comments and trailing
 * commas. JSON5's other syntax, such as unquoted keys, can't.
 *
 * @param text The file's text.
 *
 * @returns True when rewriteJson can edit it.
 */
export function isEditableJson(text: string) {
  const errors: ParseError[] = [];
  parseJsonc(text, errors, JSONC_OPTIONS);
  return errors.length === 0;
}

/**
 * The new text of a JSON file whose value changes. A new file is written like formatJson. An
 * existing one, with or without comments, is edited in place, one changed top-level key at a time,
 * so the rest of it keeps its layout, such as how its arrays are wrapped, and its comments.
 *
 * @param value The file's new value.
 * @param previousText The file's current text, if it exists; isEditableJson must accept it.
 *
 * @returns The file's new text.
 */
export function rewriteJson(value: Record<string, any>, previousText?: string) {
  if (previousText === undefined) return formatJson(value);
  const previous: Record<string, any> = parseJsonc(previousText, [], JSONC_OPTIONS) ?? {};
  const indent = previousText.match(/^[\t ]+(?=["/])/m)?.[0] ?? '  ';
  let text = previousText;
  for (const key of new Set([...Object.keys(previous), ...Object.keys(value)])) {
    if (JSON.stringify(previous[key]) === JSON.stringify(value[key])) continue;
    text = editJsonc(text, key, value[key], indent);
  }
  return text;
}

// The rest of a line after a property: an optional comma, then whitespace and an optional comment.
const LINE_END = /^(\s*?)(,?)([\t ]*(?:\/\/[^\r\n]*|\/\*.*?\*\/[\t ]*)?)(?=\r?\n|$)/;

/** One key edit in a file's text, with the file's line ending and indentation. */
class JsonEdit {
  readonly eol: string;

  constructor(
    readonly text: string,
    readonly key: string,
    readonly value: unknown,
    readonly indent: string
  ) {
    this.eol = text.includes('\r\n') ? '\r\n' : '\n';
  }

  fallback() {
    const { text, key, value, indent, eol } = this;
    const formattingOptions = {
      insertSpaces: !indent.startsWith('\t'),
      tabSize: indent.startsWith('\t') ? 1 : indent.length,
      eol,
    };
    return applyEdits(text, modify(text, [key], value, { formattingOptions }));
  }

  lineStart(offset: number) {
    return this.text.lastIndexOf('\n', offset - 1) + 1;
  }

  // The whitespace before offset, when nothing else comes before it on its line.
  ownLine(offset: number) {
    const before = this.text.slice(this.lineStart(offset), offset);
    return before.trim() ? undefined : before;
  }

  // The value as written on a line indented by lineIndent.
  render(lineIndent: string, wrapped = false) {
    const { value, indent } = this;
    const json = wrapped ? JSON.stringify(value, undefined, indent) : formatJson(value, indent);
    return json
      .trimEnd()
      .split('\n')
      .join(this.eol + lineIndent);
  }

  // Replaces only the value. An array keeps the wrapping it had.
  replace(node: JsonNode, property: JsonNode) {
    const { text } = this;
    const old = text.slice(node.offset, node.offset + node.length);
    const wrapped = Array.isArray(this.value) && old.includes('\n');
    const rendered = this.render(this.ownLine(property.offset) ?? '', wrapped);
    return text.slice(0, node.offset) + rendered + text.slice(node.offset + node.length);
  }

  // Removes the property's lines when it has them to itself.
  remove(property: JsonNode) {
    const { text } = this;
    const end = property.offset + property.length;
    const after = LINE_END.exec(text.slice(end));
    if (this.ownLine(property.offset) === undefined || !after) return this.fallback();
    const start = this.lineStart(property.offset);
    const rest = text.slice(end + after[0].length).replace(/^\r?\n/, '');
    const siblings = property.parent?.children ?? [];
    const index = siblings.indexOf(property);
    const before = index > 0 ? siblings.at(index - 1) : undefined;
    if (after[2] || !before) return text.slice(0, start) + rest;
    // It was the last key, so the one before it loses its comma.
    const beforeEnd = before.offset + before.length;
    const tail = LINE_END.exec(text.slice(beforeEnd));
    if (!tail?.[2]) return this.fallback();
    const comma = beforeEnd + tail[1].length;
    return text.slice(0, comma) + text.slice(comma + 1, start) + rest;
  }

  // Adds a line after the object's last property, keeping a trailing comment on that line.
  add(parent: JsonNode | undefined) {
    const { text } = this;
    const last = parent?.children?.at(-1);
    const lineIndent = last && this.ownLine(last.offset);
    if (!last || lineIndent === undefined) return this.fallback();
    const end = last.offset + last.length;
    const after = LINE_END.exec(text.slice(end));
    if (!after) return this.fallback();
    const [whole, space, comma, comment] = after;
    const line = `${this.eol}${lineIndent}${JSON.stringify(this.key)}: ${this.render(lineIndent)}${comma}`;
    return `${text.slice(0, end)}${space},${comment}${line}${text.slice(end + whole.length)}`;
  }
}

/**
 * Sets, adds or removes one top-level key in JSON or JSONC text. jsonc-parser's own edits drop the
 * comment on the line before a removed key and reformat the key before an added one, so whole lines
 * are added and removed here, and a changed value is replaced on its own. jsonc-parser is only the
 * fallback for layouts these don't handle, such as several keys on one line.
 *
 * @param text The file's text.
 * @param key The top-level key.
 * @param value The key's new value, or undefined to remove it.
 * @param indent The file's indentation.
 *
 * @returns The new text.
 */
function editJsonc(text: string, key: string, value: unknown, indent: string) {
  // Parsers keep a repeated key's last value, so its earlier copies go before the edit.
  const copies = parseTree(text, [], JSONC_OPTIONS)?.children?.filter(
    (property) => property.children?.[0].value === key
  );
  if (copies && copies.length > 1) {
    return editJsonc(
      new JsonEdit(text, key, undefined, indent).remove(copies[0]),
      key,
      value,
      indent
    );
  }
  const edit = new JsonEdit(text, key, value, indent);
  const root = parseTree(text, [], JSONC_OPTIONS);
  const node = root && findNodeAtLocation(root, [key]);
  if (node?.parent) {
    return value === undefined ? edit.remove(node.parent) : edit.replace(node, node.parent);
  }
  return value === undefined ? text : edit.add(root);
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
