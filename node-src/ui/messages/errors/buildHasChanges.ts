import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { changeStatus } from '../../components/changeStatus';
import { error, info } from '../../components/icons';
import ignoredTests from '../../components/ignoredTests';
import link from '../../components/link';

export default ({ build, exitCode, isOnboarding }) => {
  const url = isOnboarding ? build.app.setupUrl : build.webUrl;
  // Only PENDING, ACCEPTED and DENIED builds reach this message, so the fallback is defensive.
  const summary = changeStatus(build) ?? 'This build has changes';
  const changesLine = chalk`${error} {bold ${summary}.} Review at ${link(url)}`;
  const ignoredLine = ignoredTests({ ignoredCount: build.ignoredCount, url, isOnboarding });

  return dedent(chalk`
    ${[changesLine, ignoredLine].filter(Boolean).join('\n\n')}

    ${info} For CI/CD use cases, this command failed with exit code ${exitCode}
    Pass {bold --exit-zero-on-changes} to succeed this command regardless of changes.
    Pass {bold --auto-accept-changes} to succeed and automatically accept any changes.
  `);
};
