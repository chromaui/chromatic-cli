import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { stripVTControlCharacters } from 'node:util';

import * as clack from '@clack/prompts';

import type { Check, Fix, Group } from './checks';
import { installDependencies } from './install';
import { answered, color, relativeOrDot } from './shared';

const GROUP_TITLES: Record<Group, string> = {
  Loading: 'Project',
  Values: 'Configuration',
  Environment: 'Git and token',
};

const MARKS: Record<Check['status'], string> = {
  pass: color.success('✔'),
  warn: color.warning('▲'),
  fail: color.error('✖'),
};

/**
 * Wraps text to a width, so long details stay inside their section's box.
 *
 * @param text The text to wrap.
 * @param width The widest a line may be.
 *
 * @returns The wrapped lines.
 */
function wrap(text: string, width: number) {
  return text.split('\n').flatMap((line) => {
    const lines: string[] = [];
    let current = '';
    for (const word of line.split(' ')) {
      if (current && current.length + word.length + 1 > width) {
        lines.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    return [...lines, current];
  });
}

/**
 * Length as shown in the terminal, without color codes.
 *
 * @param text Text that may hold color codes.
 *
 * @returns The number of visible characters.
 */
const visible = (text: string) => stripVTControlCharacters(text).length;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Prints each section as its own titled box, with one line per check and its details indented
 * below, so it's clear which section a check belongs to.
 *
 * @param checks Results from runChecks.
 */
export function printChecks(checks: Check[]) {
  // Room for the frame, the box borders and the indent.
  // Clack wraps notes at 80 columns without a terminal, so wrap to the same width here.
  const width = Math.max(40, Math.min(100, (process.stdout.columns || 80) - 14));
  const sections = (Object.keys(GROUP_TITLES) as Group[]).flatMap((group) => {
    const inGroup = checks.filter((c) => c.group === group);
    if (inGroup.length === 0) return [];
    const lines = inGroup.flatMap((check) => {
      const fixable = check.fix ? color.cta(' (fixable)') : '';
      const details = check.detail
        ? wrap(check.detail, width - 2).map((line) => `  ${color.muted(line)}`)
        : [];
      return [`${MARKS[check.status]} ${check.title}${fixable}`, ...details];
    });
    return [{ title: `${color.bold(GROUP_TITLES[group])}  ${summarize(inGroup)}`, lines }];
  });

  // Pad every box to the widest one, so the sections line up.
  const widest = Math.max(
    ...sections.flatMap(({ title, lines }) => [
      visible(title) + 2,
      ...lines.map((line) => visible(line)),
    ])
  );
  for (const { title, lines } of sections) {
    const padded = [...lines];
    padded[0] += ' '.repeat(Math.max(0, widest - visible(padded[0])));
    // Details carry their own colors, so don't let Clack dim the whole box.
    clack.note(padded.join('\n'), title, { format: (line) => line });
  }
}

/**
 * One line of counts, such as "4 passed · 2 warnings", leaving out zeros.
 *
 * @param checks The checks to count.
 *
 * @returns The colored summary.
 */
export function summarize(checks: Check[]) {
  const count = (status: Check['status']) => checks.filter((c) => c.status === status).length;
  const parts = [
    count('pass') > 0 && color.success(`${count('pass')} passed`),
    count('warn') > 0 && color.warning(plural(count('warn'), 'warning')),
    count('fail') > 0 && color.error(`${count('fail')} failed`),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(color.muted(' · ')) : color.muted('nothing to check');
}

// In JSON, a line that only gains or loses a trailing comma, before a key added after it, isn't a
// change. In other files, such as .env, a comma is part of the value.
const withoutComma = (line: string) => line.replace(/,\s*$/, '');
// A line that is just a key opening an object or array, such as `"scripts": {`, so it holds no value.
const HEADING = /^\s+"[^"]*"\s*:\s*[[{]\s*$/;

// A line that closes an object or array, such as `},`.
const CLOSING = /^\s*[\]}],?\s*$/;

/**
 * The line that opens the object or array a line sits in, such as `"scripts": {`, so a diff can
 * say where a change goes. The file's outermost brace doesn't count, nor does a line that holds
 * values as well as opening one.
 *
 * @param lines The file's lines.
 * @param at The changed line.
 *
 * @returns The opening line's index, if there is one.
 */
function parentLine(lines: string[], at: number) {
  const indent = lines[at].search(/\S/);
  for (let index = at - 1; index >= 0; index--) {
    const depth = lines[index].search(/\S/);
    if (depth !== -1 && depth < indent) return HEADING.test(lines[index]) ? index : undefined;
  }
  return undefined;
}

interface Op {
  kind: 'same' | 'del' | 'add';
  a: number;
  b: number;
}

/**
 * Lines kept, removed and added, by longest common subsequence, so an added line that repeats an
 * existing one, such as a second "with:", still shows.
 *
 * @param a The lines before.
 * @param b The lines after.
 * @param same Whether two lines count as the same.
 *
 * @returns One step per line, with its index in each.
 */
function diffOps(a: string[], b: string[], same: (x: string, y: string) => boolean) {
  const lcs = commonLengths(a, b, same);
  const ops: Op[] = [];
  let index = 0;
  let index_ = 0;
  while (index < a.length || index_ < b.length) {
    if (index < a.length && index_ < b.length && same(a[index], b[index_])) {
      ops.push({ kind: 'same', a: index++, b: index_++ });
    } else if (
      index < a.length &&
      (index_ === b.length || lcs[index + 1][index_] >= lcs[index][index_ + 1])
    ) {
      ops.push({ kind: 'del', a: index++, b: index_ });
    } else {
      ops.push({ kind: 'add', a: index, b: index_++ });
    }
  }
  return ops;
}

/**
 * The longest common subsequence's length from each pair of positions onward.
 *
 * @param a The lines before.
 * @param b The lines after.
 * @param same Whether two lines count as the same.
 *
 * @returns The table, one row per line before and one column per line after.
 */
function commonLengths(a: string[], b: string[], same: (x: string, y: string) => boolean) {
  const lcs = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0)
  );
  for (let index = a.length - 1; index >= 0; index--) {
    for (let index_ = b.length - 1; index_ >= 0; index_--) {
      lcs[index][index_] = same(a[index], b[index_])
        ? lcs[index + 1][index_ + 1] + 1
        : Math.max(lcs[index + 1][index_], lcs[index][index_ + 1]);
    }
  }
  return lcs;
}

/**
 * The context above a group of changes to a JSON file: the key that opens its object, a `...` for
 * the lines in between, and the line just before the group if it sits beside it, so the reader
 * sees where the change goes. A line that holds values as well as opening an object never shows.
 *
 * @param a The lines before.
 * @param b The lines after.
 * @param first The group's first change.
 * @param previous The unchanged line just before the group, if there is one.
 *
 * @returns The lines to show, uncolored.
 */
function contextAbove(a: string[], b: string[], first: Op, previous: Op | undefined) {
  const side = first.kind === 'add' ? 'b' : 'a';
  const lines = { a, b }[side];
  const at = first[side];
  const heading = parentLine(lines, at);
  if (!previous) return heading === undefined ? [] : [lines[heading]];
  const before = previous[side];
  const shown = heading === undefined || heading === before ? [] : [lines[heading]];
  if (before > (heading ?? 0) + 1) shown.push(gap(lines[at]));
  const sibling = lines[before].search(/\S/) === lines[at].search(/\S/);
  // Its new form, such as a script that gained a comma before the one added after it.
  if (sibling || before === heading) shown.push(b[previous.b]);
  return shown;
}

/**
 * Runs of changed lines, as start and end indexes into the steps.
 *
 * @param ops The diff's steps.
 *
 * @returns Each run's first step and the step after its last.
 */
function changeGroups(ops: Op[]) {
  const groups: [number, number][] = [];
  for (const [index, op] of ops.entries()) {
    if (op.kind === 'same') continue;
    const last = groups.at(-1);
    if (last?.[1] === index) last[1] = index + 1;
    else groups.push([index, index + 1]);
  }
  return groups;
}

/**
 * A short line diff: lines removed in red, lines added in green. In JSON, each group of changes
 * also shows, dimmed, the key that opens its object, the line before it and the line that closes
 * it, with `...` for the lines it leaves out.
 *
 * @param before The file's text now.
 * @param after The file's text after the fix.
 * @param json Whether the file is JSON, where a line that only gains a comma isn't a change.
 *
 * @returns The changed lines, colored.
 */
function lineDiff(before: string, after: string, json: boolean) {
  const a = before.split('\n');
  const b = after.split('\n');
  const ops = diffOps(a, b, (x, y) => (json ? withoutComma(x) === withoutComma(y) : x === y));
  const changed = (op: Op) => {
    const line = op.kind === 'del' ? a[op.a] : b[op.b];
    if (!line.trim()) return [];
    return [op.kind === 'del' ? color.error(`- ${line}`) : color.success(`+ ${line}`)];
  };
  const below = (next: Op | undefined) =>
    next ? [CLOSING.test(b[next.b]) ? b[next.b] : gap(b[next.b])] : [];
  return changeGroups(ops)
    .flatMap(([start, end]) => [
      ...(json ? contextAbove(a, b, ops[start], ops[start - 1]) : []).map((line) => muted(line)),
      ...ops.slice(start, end).flatMap((op) => changed(op)),
      ...(json ? below(ops[end]) : []).map((line) => muted(line)),
    ])
    .join('\n');
}

// A `...` for lines left out, indented like the line it stands next to.
const gap = (line: string) => `${line.slice(0, line.search(/\S|$/))}...`;

const muted = (line: string) => color.muted(`  ${line}`);

/**
 * Hides all but the last 4 characters of project tokens, so fix previews are safe in CI logs: the
 * fix's known secrets and the token in the environment wherever they appear, and any other value
 * of CHROMATIC_PROJECT_TOKEN or projectToken.
 *
 * @param text Preview text.
 * @param secrets Values to hide wherever they appear.
 *
 * @returns The text with tokens masked.
 */
function maskTokens(text: string, secrets: string[]) {
  let masked = text;
  for (const secret of [...secrets, process.env.CHROMATIC_PROJECT_TOKEN]) {
    if (secret && secret.length > 4) masked = masked.replaceAll(secret, `…${secret.slice(-4)}`);
  }
  // Also a token in a package script, such as chromatic --project-token=<token>.
  return masked
    .replaceAll(
      /(CHROMATIC_PROJECT_TOKEN\s*=\s*|"projectToken"\s*:\s*"|--project-token[=\s]+|\s-t\s+)([^"'\s…]+)/g,
      (_, key: string, token: string) => `${key}…${token.slice(-4)}`
    )
    .replaceAll(/chpt_[\dA-Za-z]+/g, (token) => `…${token.slice(-4)}`);
}

/**
 * Shows changes to files as line diffs in a titled box, with tokens masked.
 *
 * @param title What the change does.
 * @param edits The files and their new content.
 * @param cwd Directory paths are shown relative to.
 * @param secrets Values to hide wherever they appear.
 */
export function showEdits(
  title: string,
  edits: { file: string; content: string }[],
  cwd: string,
  secrets: string[] = []
) {
  const preview = edits
    .map(({ file, content }) => {
      const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
      return `${color.bold(relativeOrDot(cwd, file))}\n${maskTokens(lineDiff(before, content, /\.json[5c]?$/.test(file)), secrets)}`;
    })
    .join('\n\n');
  clack.note(preview, title);
}

/**
 * Offers each fix in turn and applies the ones accepted.
 *
 * @param recheck Runs the checks against the files as they are now.
 * @param options How to apply.
 * @param options.cwd Directory paths are shown relative to.
 * @param options.yes Apply every fix without asking, except those with a question.
 *
 * @returns The checks after the last fix, and the fixes applied.
 */
async function offerFixes(
  recheck: () => Promise<Check[]>,
  { cwd, yes }: { cwd: string; yes: boolean }
) {
  const skipped = new Set<string>();
  const applied: Fix[] = [];
  for (;;) {
    const checks = await recheck();
    const next = checks.find((c) => c.fix && !skipped.has(c.fix.summary));
    if (!next?.fix) return { checks, applied };
    const { fix } = next;
    skipped.add(fix.summary);
    if (fix.question && yes) {
      clack.log.warn(
        `Skipped: ${fix.summary}. Run ${color.cta('npx chromatic doctor --fix')} in a terminal to answer: ${fix.question}`
      );
      continue;
    }
    showEdits(fix.summary, fix.edits, cwd, fix.secrets);
    const ok = yes || answered(await clack.confirm({ message: fix.question ?? 'Apply this fix?' }));
    if (!ok) continue;
    for (const { file, content } of fix.edits) writeFileSync(file, content);
    applied.push(fix);
    clack.log.success(`Applied: ${fix.summary}`);
  }
}

/**
 * Offers fixes one at a time like storybook automigrate: show the change, ask, write, then check
 * again, so fixes to the same file build on each other. When a fix changes dependencies, the
 * project's install runs once at the end.
 *
 * @param recheck Runs the checks against the files as they are now.
 * @param options How to apply.
 * @param options.cwd Directory paths are shown relative to, and the install runs in.
 * @param options.yes Apply every fix without asking, except those with a question.
 *
 * @returns The checks after the last fix, and the install's failure when there is one.
 */
export async function applyFixes(
  recheck: () => Promise<Check[]>,
  options: { cwd: string; yes: boolean }
) {
  const { checks, applied } = await offerFixes(recheck, options);
  if (!applied.some((fix) => fix.install)) return checks;
  // One install for every fix that changed dependencies, then check what it installed.
  const failed = await installDependencies(options.cwd);
  return [...(await recheck()), ...(failed ? [failed] : [])];
}

// Quotes an argument for a POSIX shell when it needs it.
const shellQuote = (argument: string) =>
  /^[\w@%+=:,./-]+$/.test(argument) ? argument : `'${argument.replaceAll("'", String.raw`'\''`)}'`;

// Doctor's own flags, which the rerun command sets itself, with dashes dropped: the parser also
// takes camelCase, such as --projectToken.
const RERUN_DROPPED = new Set(['fix', 'nofix', 'yes', 'noyes']);
// The project token's long flag; its value is a secret, kept out of printed commands.
const SECRET_FLAG = 'projecttoken';

/**
 * The command to run doctor again with the same arguments, such as --config-file, plus more, so a
 * copied hint checks and fixes the same files. A project token is left out, since the hint is
 * printed.
 *
 * @param argv The arguments doctor ran with.
 * @param extra Arguments to add, such as --fix.
 *
 * @returns The command, quoted for a POSIX shell.
 */
export function doctorCommand(argv: string[], extra: string[]) {
  const kept: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const [name] = argument.split('=');
    if (name.startsWith('--')) {
      const flag = name.replaceAll('-', '').toLowerCase();
      if (RERUN_DROPPED.has(flag)) continue;
      if (flag === SECRET_FLAG) {
        // The value is the next argument unless it's attached with =.
        if (!argument.includes('=')) index += 1;
        continue;
      }
    } else if (/^-[a-z]/i.test(argument)) {
      // Short flags can be grouped, as in -yt <token>. Everything after -t is its value, else the
      // next argument is. A group with -t is left out whole.
      const letters = argument.slice(1);
      if (letters.includes('t')) {
        if (letters.indexOf('t') === letters.length - 1) index += 1;
        continue;
      }
      // -y goes, even grouped as in -yc, since the rerun adds what it needs.
      const rest = letters.replaceAll('y', '');
      if (!rest) continue;
      kept.push(`-${rest}`);
      continue;
    }
    kept.push(argument);
  }
  return [
    'npx chromatic doctor',
    ...[...kept, ...extra].map((argument) => shellQuote(argument)),
  ].join(' ');
}

/**
 * The closing pointer to Chromatic's agent skills, for a run with nothing failed. Left out in CI,
 * where the output is read for failures, and on failing runs, where it would crowd out the fix.
 *
 * @param failed Whether a check failed.
 *
 * @returns The line, or undefined when it shouldn't show.
 */
export function skillsHint(failed: boolean) {
  if (failed || process.env.CI) return undefined;
  return `Using an AI agent? Give it Chromatic's skills: ${color.cta('https://www.chromatic.com/docs/skills/')}`;
}
