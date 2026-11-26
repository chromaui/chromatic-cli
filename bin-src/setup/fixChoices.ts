import * as clack from '@clack/prompts';

import type { FixChoice } from './checks';
import { answered } from './shared';

/**
 * Shows the choices' warnings, such as release notes, and asks which one to apply.
 *
 * @param choices The fix's choices.
 * @param title The check's title, which says what the choice is about.
 *
 * @returns The chosen fix, or undefined for none.
 */
export async function pickChoice(choices: FixChoice[], title: string) {
  for (const { warning } of choices) if (warning) clack.log.warn(warning);
  const key = answered(
    await clack.select({
      message: `${title}. Which fix should doctor apply?`,
      // Start on the first choice without a warning, such as an update within the major version.
      initialValue: choices.find((choice) => !choice.warning)?.key ?? '',
      options: [
        ...choices.map((choice) => ({ value: choice.key, label: choice.label })),
        { value: '', label: 'Nothing' },
      ],
    })
  );
  return choices.find((choice) => choice.key === key)?.fix;
}
