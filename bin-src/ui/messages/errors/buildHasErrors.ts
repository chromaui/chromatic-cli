import chalk from 'chalk';
import pluralize from 'pluralize';
import { dedent } from 'ts-dedent';

import { error as errorIcon, info as infoIcon } from '../../components/icons';
import link from '../../components/link';

export default ({ build, exitCode }) => {
  const { errorCount, interactionTestFailuresCount, webUrl } = build;
  const hasInteractionTestFailures = interactionTestFailuresCount > 0;
  const hasOtherErrors = errorCount - interactionTestFailuresCount > 0;

  let errorMessage;

  if (hasInteractionTestFailures && hasOtherErrors) {
    const errors = pluralize('build error', errorCount - interactionTestFailuresCount, true);

    errorMessage = `Encountered ${errors} and ${pluralize(
      'failed test',
      interactionTestFailuresCount,
      true
    )}`;
  } else if (hasInteractionTestFailures) {
    errorMessage = `Encountered ${pluralize('failed test', interactionTestFailuresCount, true)}`;
  } else {
    const errors = pluralize('build error', errorCount, true);
    errorMessage = `Encountered ${errors}`;
  }

  return dedent(chalk`
    ${errorIcon} {bold ${errorMessage}}: failing with exit code ${exitCode}
    Pass {bold --allow-console-errors} to succeed this command regardless of runtime build errors.
    ${infoIcon} Review the errors at ${link(webUrl)}
  `);
};
