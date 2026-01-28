import chalk from 'chalk';
import pluralize from 'pluralize';
import { dedent } from 'ts-dedent';

import { error as errorIcon, info as infoIcon } from '../../components/icons';
import link from '../../components/link';

export default ({ build, exitCode, isOnboarding }) => {
  const { errorCount, interactionTestFailuresCount, webUrl } = build;
  const hasInteractionTestFailures = interactionTestFailuresCount > 0;
  const hasOtherErrors = errorCount - interactionTestFailuresCount > 0;
  const failedTests = pluralize('failed test', interactionTestFailuresCount, true);

  let errorMessage;

  if (hasInteractionTestFailures && hasOtherErrors) {
    const errors = pluralize('build error', errorCount - interactionTestFailuresCount, true);
    errorMessage = `Encountered ${errors} and ${failedTests}`;
  } else if (hasInteractionTestFailures) {
    errorMessage = `Encountered ${failedTests}`;
  } else {
    const errors = pluralize('build error', errorCount, true);
    errorMessage = `Encountered ${errors}`;
  }

  return dedent(chalk`
    ${errorIcon} {bold ${errorMessage}}: failing with exit code ${exitCode}
    ${infoIcon} Review the errors at ${link(isOnboarding ? build.app.setupUrl : webUrl)}
  `);
};
