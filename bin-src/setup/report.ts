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

/**
 * A short line diff: lines removed in red, lines added in green.
 *
 * @param before The file's text now.
 * @param after The file's text after the fix.
 *
 * @returns The changed lines, colored.
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
  return masked.replaceAll(
    /(CHROMATIC_PROJECT_TOKEN\s*=\s*|"projectToken"\s*:\s*")([^"\s…]+)/g,
    (_, key: string, token: string) => `${key}…${token.slice(-4)}`
  );
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
    const preview = fix.edits
      .map(({ file, content }) => {
        const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
        return `${color.bold(relativeOrDot(cwd, file))}\n${maskTokens(lineDiff(before, content), fix.secrets ?? [])}`;
      })
      .join('\n\n');
    clack.note(preview, fix.summary);
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
