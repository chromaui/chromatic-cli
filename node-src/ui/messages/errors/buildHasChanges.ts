import chalk from 'chalk';
import pluralize from 'pluralize';
import { dedent } from 'ts-dedent';

import { error, info } from '../../components/icons';
import link from '../../components/link';

export default ({ build, exitCode, isOnboarding }) => {
  const url = isOnboarding ? build.app.setupUrl : build.webUrl;

  const changes: any[] = [];
  if (build.changeCount > 0) {
    changes.push(
      chalk`${error} {bold Found ${pluralize('visual changes', build.changeCount, true)}}`
    );
  }
  if (build.accessibilityChangeCount > 0) {
    changes.push(
      chalk`${error} {bold Found ${pluralize('accessibility changes', build.accessibilityChangeCount, true)}}`
    );
  }

  return dedent(chalk`
    ${changes.join('\n')}

    Review the changes at ${link(url)}
    
    ${info} For CI/CD use cases, this command failed with exit code ${exitCode}
    Pass {bold --exit-zero-on-changes} to succeed this command regardless of changes.
    Pass {bold --auto-accept-changes} to succeed and automatically accept any changes.
  `);
};
