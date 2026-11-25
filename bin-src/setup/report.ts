import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { stripVTControlCharacters } from 'node:util';

import * as clack from '@clack/prompts';

import { type Check, type Fix, fixIds, type Group } from './checks';
import { pickChoice } from './fixChoices';
import { installDependencies } from './install';
import { lineDiff } from './lineDiff';
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
  info: color.cta('●'),
};

/**
 * Wraps text to a width, so long titles and details stay inside their section's box. A list item's
 * wrapped lines line up under its text. Color codes don't count toward the width.
 *
 * @param text The text to wrap.
 * @param width The widest a line may be.
 *
 * @returns The wrapped lines.
 */
function wrap(text: string, width: number) {
  return text.split('\n').flatMap((line) => {
    const indent = line.startsWith('- ') ? '  ' : '';
    const lines: string[] = [];
    let current = '';
    for (const word of line.split(' ')) {
      if (current && visible(current) + visible(word) + 1 > width) {
        lines.push(current);
        current = `${indent}${word}`;
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
      // A no-break space keeps the ID on the same line as "fixable:" when the title wraps.
      const fixable = check.fix
        ? ` ${color.cta(`(fixable:\u00A0${fixIds(check.fix).join(', ')})`)}`
        : '';
      const [first, ...rest] = wrap(`${check.title}${fixable}`, width - 2);
      const details = check.detail
        ? wrap(check.detail, width - 2).map((line) => `  ${color.muted(line)}`)
        : [];
      return [`${MARKS[check.status]} ${first}`, ...rest.map((line) => `  ${line}`), ...details];
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
 * Shows a fix's change and asks whether to apply it. For a fix with choices, it shows their
 * warnings and asks which one to apply, or none, then shows that one's change.
 *
 * @param fix The fix.
 * @param options How to apply.
 * @param options.cwd Directory paths are shown relative to.
 * @param options.yes Apply the fix itself without asking.
 * @param options.title The check's title.
 * @param options.skipped IDs of fixes not to offer again, which gets the choices' too.
 *
 * @returns The fix to apply, or undefined.
 */
async function chooseFix(
  fix: Fix,
  options: { cwd: string; yes: boolean; title: string; skipped: Set<string> }
) {
  const { cwd, yes, title, skipped } = options;
  if (yes || !fix.choices) {
    showEdits(fix.summary, fix.edits, cwd, fix.secrets);
    const ok = yes || answered(await clack.confirm({ message: fix.question ?? 'Apply this fix?' }));
    return ok ? fix : undefined;
  }
  // A choice turned down isn't offered again when a recheck makes it the fix.
  for (const choice of fix.choices) skipped.add(choice.fix.id);
  const chosen = await pickChoice(fix.choices, title);
  if (chosen) showEdits(chosen.summary, chosen.edits, cwd, chosen.secrets);
  return chosen;
}

// The warning of the choice a fix applies, such as a major update's release notes, on its own lines.
const choiceWarning = (fix: Fix) => {
  const warning = fix.choices?.find((choice) => choice.fix.id === fix.id)?.warning;
  return warning ? `${warning}\n` : '';
};

/**
 * Shows the fix --apply named, or the choice of it that it named, and returns it to apply.
 *
 * @param fix The fix.
 * @param apply The IDs named with --apply.
 * @param cwd Directory paths are shown relative to.
 *
 * @returns The fix to apply.
 */
function pickNamed(fix: Fix, apply: Set<string>, cwd: string) {
  const chosen = fix.choices?.find((choice) => apply.has(choice.fix.id))?.fix ?? fix;
  showEdits(chosen.summary, chosen.edits, cwd, chosen.secrets);
  return chosen;
}

/**
 * Offers each fix in turn and applies the ones accepted.
 *
 * @param recheck Runs the checks against the files as they are now.
 * @param options How to apply.
 * @param options.cwd Directory paths are shown relative to.
 * @param options.yes Apply every fix without asking, except those with a question.
 * @param options.apply IDs of fixes to apply without asking, as if their question was answered
 * yes. When there are any, other fixes are only applied with yes.
 * @param options.applyCommand The command that applies one fix by its ID, shown for a fix that yes
 * skips because it asks a question.
 *
 * @returns The checks after the last fix, and the fixes applied.
 */
// eslint-disable-next-line complexity -- one branch per way a fix is answered: --apply, --yes or a prompt
async function offerFixes(
  recheck: () => Promise<Check[]>,
  {
    cwd,
    yes,
    apply = new Set(),
    applyCommand,
  }: { cwd: string; yes: boolean; apply?: Set<string>; applyCommand: (id: string) => string }
) {
  const offered = new Set<string>();
  const applied: Fix[] = [];
  for (;;) {
    const checks = await recheck();
    const next = checks.find((c) => c.fix && !offered.has(c.fix.id));
    if (!next?.fix) return { checks, applied };
    const { fix } = next;
    offered.add(fix.id);
    // Naming a fix answers its question. With names, only --yes applies the other fixes.
    const named = fixIds(fix).some((id) => apply.has(id));
    if (!named && apply.size > 0 && !yes) continue;
    if (!named && fix.question && yes) {
      clack.log.warn(
        `Skipped: ${fix.summary}. It asks: ${fix.question}\n${choiceWarning(fix)}If the answer is yes, run ${color.cta(applyCommand(fix.id))}`
      );
      continue;
    }
    // A named choice, such as chromatic.update:major, is applied in place of the fix it belongs to.
    const chosen = named
      ? pickNamed(fix, apply, cwd)
      : await chooseFix(fix, { cwd, yes, title: next.title, skipped: offered });
    if (!chosen) continue;
    for (const { file, content } of chosen.edits) writeFileSync(file, content);
    applied.push(chosen);
    clack.log.success(`Applied: ${chosen.summary}`);
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
 * @param options.apply IDs of fixes to apply without asking, as in offerFixes.
 * @param options.applyCommand The command that applies one fix by its ID, as in offerFixes.
 *
 * @returns The checks after the last fix, and the install's failure when there is one.
 */
export async function applyFixes(
  recheck: () => Promise<Check[]>,
  options: Parameters<typeof offerFixes>[1]
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

// Long flags the rerun command leaves out, with dashes dropped (the parser also takes camelCase,
// such as --projectToken), and whether each takes a value: doctor's own flags, which the command
// sets itself, and the project token, a secret kept out of printed commands.
const RERUN_DROPPED = new Map([
  ['fix', false],
  ['nofix', false],
  ['yes', false],
  ['noyes', false],
  ['projecttoken', true],
]);

// A long flag's name without dashes or case, as the parser matches it.
const flagName = (argument: string) => argument.split('=')[0].replaceAll('-', '').toLowerCase();

/**
 * The command to run doctor again with the same arguments, such as --config-file, plus more, so a
 * copied hint checks and fixes the same files. A project token is left out, since the hint is
 * printed.
 *
 * @param argv The arguments doctor ran with.
 * @param extra Arguments to add, such as --fix. A flag here replaces the same flag in argv, with its
 * value, such as --project or --apply.
 *
 * @returns The command, quoted for a POSIX shell.
 */
export function doctorCommand(argv: string[], extra: string[]) {
  const dropped = new Map([
    ...RERUN_DROPPED,
    ...extra.flatMap((argument, index) =>
      argument.startsWith('--')
        ? [[flagName(argument), !(extra[index + 1] ?? '-').startsWith('-')] as const]
        : []
    ),
  ]);
  const kept: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument.startsWith('--')) {
      const takesValue = dropped.get(flagName(argument));
      if (takesValue !== undefined) {
        // The value is the next argument unless it's attached with =.
        if (takesValue && !argument.includes('=')) index += 1;
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
