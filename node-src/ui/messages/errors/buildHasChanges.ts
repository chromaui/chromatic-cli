import chalk from 'chalk';
import pluralize from 'pluralize';
import { dedent } from 'ts-dedent';

import { error, info } from '../../components/icons';
import link from '../../components/link';

export default ({ build, exitCode, isOnboarding }) => {
  const url = isOnboarding ? build.app.setupUrl : build.webUrl;
  const unstableUrl = `${url}#unstable`;

  const changes: any[] = [];
  if (build.changeCount > 0) {
    changes.push(
      chalk`${error} {bold ${pluralize('visual changes', build.changeCount, true)} must be accepted as baseline.} Review at ${link(url)}`
    );
  }
  if (build.accessibilityChangeCount > 0) {
    changes.push(
      chalk`${error} {bold ${pluralize('accessibility changes', build.accessibilityChangeCount, true)} must be accepted as baseline.} Review at ${link(url)}`
    );
  }
  if (build.ignoredCount > 0) {
    changes.push(
      chalk`{bold ${pluralize('test', build.ignoredCount, true)} ${build.ignoredCount > 1 ? 'were' : 'was'} ignored in this build.} Review at ${link(unstableUrl)}`
    );
  }

  return dedent(chalk`
    ${changes.join('\n')}
    
    ${info} For CI/CD use cases, this command failed with exit code ${exitCode}
    Pass {bold --exit-zero-on-changes} to succeed this command regardless of changes.
    Pass {bold --auto-accept-changes} to succeed and automatically accept any changes.
  `);
};
