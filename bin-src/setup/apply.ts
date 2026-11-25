import { SubcommandFailure } from '../subcommandFailure';
import { type Check, fixIds } from './checks';
import { color } from './shared';

/**
 * The failure for fixes named with --apply that a project doesn't offer. Doctor then applies none
 * of the named fixes, so a run never applies only some of them. A fix can appear only once another
 * is applied, such as TurboSnap once storybookConfigDir finds the Storybook, so when other named
 * fixes are offered, it says to apply those first and run doctor again.
 *
 * @param checks The project's checks before any fix.
 * @param apply The IDs named with --apply.
 * @param project The project, as shown to the user.
 * @param applyCommand The command that applies fixes by their IDs.
 *
 * @returns The failure to throw, or undefined when the project offers every named fix.
 */
export function notOfferedFailure(
  checks: Check[],
  apply: string[],
  project: string,
  applyCommand: (...ids: string[]) => string
) {
  const offered = checks.flatMap((c) => (c.fix ? fixIds(c.fix) : []));
  const missing = apply.filter((id) => !offered.includes(id));
  if (missing.length === 0) return undefined;
  const first = apply.filter((id) => offered.includes(id));
  return new SubcommandFailure(
    [
      `Didn't apply any fixes: ${project} doesn't offer ${missing.join(', ')}${first.length > 0 ? ' yet' : ''}.`,
      offered.length > 0 ? `It offers ${offered.join(', ')}.` : 'It offers no fixes.',
      ...(first.length > 0
        ? [
            `Some fixes appear only after another is applied. Apply ${first.join(', ')} first with ${applyCommand(...first)}, then run doctor again to see whether it offers ${missing.join(', ')}.`,
          ]
        : []),
    ].join(' '),
    { exitCode: 2 }
  );
}

/**
 * What to print after --apply when the applied fixes made other fixes available, such as TurboSnap
 * once storybookConfigDir finds the Storybook: each new fix with the command that applies it.
 *
 * @param before The project's checks before the fixes.
 * @param after The project's checks after them.
 * @param applyCommand The command that applies one fix by its ID.
 *
 * @returns The message, or undefined when no fix became available.
 */
export function unlockedFixesMessage(
  before: Check[],
  after: Check[],
  applyCommand: (id: string) => string
) {
  const offered = new Set(before.flatMap((c) => (c.fix ? fixIds(c.fix) : [])));
  const unlocked = after.flatMap(({ fix }) =>
    fix && !offered.has(fix.id)
      ? [
          `- ${fix.summary}${fix.question ? `. It asks: ${fix.question}` : ''}\n  ${color.cta(applyCommand(fix.id))}`,
        ]
      : []
  );
  if (unlocked.length === 0) return undefined;
  return [
    'The fixes you applied made these available. To apply one, run the command below it:',
    ...unlocked,
  ].join('\n');
}

/**
 * What to print when there's no terminal to confirm fixes: the command that applies the ones that
 * ask no question, and each question, or choice --yes never picks, with the command that applies it.
 *
 * @param checks The project's checks.
 * @param rerun The command that applies every fix that asks no question.
 * @param applyCommand The command that applies one fix by its ID.
 *
 * @returns The message.
 */
export function skippedFixesMessage(
  checks: Check[],
  rerun: string,
  applyCommand: (id: string) => string
) {
  const item = (question: string, id: string, warning?: string) =>
    [`- ${question}`, ...(warning?.split('\n') ?? []), color.cta(applyCommand(id))].join('\n  ');
  // Fixes that ask a question, and choices --yes never picks, such as a major update.
  const asked = checks.flatMap(({ fix }) => [
    ...(fix?.question
      ? [item(fix.question, fix.id, fix.choices?.find((c) => c.fix.id === fix.id)?.warning)]
      : []),
    ...(fix?.choices ?? [])
      .filter((choice) => choice.warning && choice.fix.id !== fix?.id)
      .map((choice) => item(`${choice.label}?`, choice.fix.id, choice.warning)),
  ]);
  return [
    "Didn't apply fixes: there's no terminal to confirm them (CI or piped input).",
    ...(checks.some((c) => c.fix && !c.fix.question)
      ? [`Run ${color.cta(rerun)} to apply the ones that ask no question.`]
      : []),
    ...(asked.length > 0
      ? ['Each of these asks a question. If the answer is yes, run the command below it:']
      : []),
    ...asked,
  ].join('\n');
}
