import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { stripVTControlCharacters } from 'node:util';

import * as clack from '@clack/prompts';

import type { Check, Group } from './checks';
import { answered, color, relativeOrDot } from './shared';

const GROUP_TITLES: Record<Group, string> = {
  Loading: 'Project',
  Values: 'Configuration',
  Environment: 'Git, token and CI',
};

const MARKS: Record<Check['status'], string> = {
  pass: color.success('✔'),
  warn: color.warning('▲'),
  fail: color.error('✖'),
};

/**
 * Wraps text to a width, so long details stay inside their section's box.
 *
 * @param text
 * @param width
 *
 * @returns
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
 * @param text
 *
 * @returns
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

/**
 * A short line diff: lines removed in red, lines added in green.
 *
 * @param before
 * @param after
 *
 * @returns
 */
// eslint-disable-next-line complexity -- prototype; split into smaller steps if this ships
function lineDiff(before: string, after: string) {
  const a = before.split('\n');
  const b = after.split('\n');
  // Longest common subsequence, so an added line that repeats an existing one, such as a second
  // "with:", still shows.
  const lcs = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0)
  );
  for (let index = a.length - 1; index >= 0; index--) {
    for (let index_ = b.length - 1; index_ >= 0; index_--) {
      lcs[index][index_] =
        a[index] === b[index_]
          ? lcs[index + 1][index_ + 1] + 1
          : Math.max(lcs[index + 1][index_], lcs[index][index_ + 1]);
    }
  }
  const out: string[] = [];
  let index = 0;
  let index_ = 0;
  while (index < a.length || index_ < b.length) {
    if (index < a.length && index_ < b.length && a[index] === b[index_]) {
      index++;
      index_++;
    } else if (
      index < a.length &&
      (index_ === b.length || lcs[index + 1][index_] >= lcs[index][index_ + 1])
    ) {
      if (a[index].trim()) out.push(color.error(`- ${a[index]}`));
      index++;
    } else {
      if (b[index_].trim()) out.push(color.success(`+ ${b[index_]}`));
      index_++;
    }
  }
  return out.join('\n');
}

/**
 * Hides all but the last 4 characters of project tokens, so fix previews are safe in CI logs.
 *
 * @param text Preview text.
 *
 * @returns The text with tokens masked.
 */
function maskTokens(text: string) {
  return text.replaceAll(
    /(CHROMATIC_PROJECT_TOKEN=|"projectToken":\s*")([^"\s]+)/g,
    (_, key: string, token: string) => `${key}…${token.slice(-4)}`
  );
}

/**
 * Offers fixes one at a time like storybook automigrate: show the change, ask, write, then check
 * again, so fixes to the same file build on each other.
 *
 * @param recheck Runs the checks against the files as they are now.
 * @param options How to apply.
 * @param options.cwd Directory paths are shown relative to.
 * @param options.yes Apply every fix without asking.
 *
 * @returns The checks after the last fix.
 */
export async function applyFixes(
  recheck: () => Promise<Check[]>,
  { cwd, yes }: { cwd: string; yes: boolean }
) {
  const skipped = new Set<string>();
  for (;;) {
    const checks = await recheck();
    const next = checks.find((c) => c.fix && !skipped.has(c.fix.summary));
    if (!next?.fix) return checks;
    const { fix } = next;
    const preview = fix.edits
      .map(({ file, content }) => {
        const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
        return `${color.bold(relativeOrDot(cwd, file))}\n${maskTokens(lineDiff(before, content))}`;
      })
      .join('\n\n');
    clack.note(preview, fix.summary);
    const ok = yes || answered(await clack.confirm({ message: 'Apply this fix?' }));
    skipped.add(fix.summary);
    if (!ok) continue;
    for (const { file, content } of fix.edits) writeFileSync(file, content);
    clack.log.success(`Applied: ${fix.summary}`);
  }
}
