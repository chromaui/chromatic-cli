import chalk from 'chalk';
import pluralize from 'pluralize';
import { dedent } from 'ts-dedent';

import { error, info } from '../../components/icons';
import link from '../../components/link';

const ignoredTestsUrl = (displayUrl: string, isOnboarding: boolean) => {
  if (isOnboarding) {
    return displayUrl;
  }

  try {
    const url = new URL(displayUrl);
    url.searchParams.set('expandIgnored', 'true');
    return url.toString();
  } catch {
    return displayUrl;
  }
};

export default ({ build, exitCode, isOnboarding }) => {
  const url = isOnboarding ? build.app.setupUrl : build.webUrl;
  const ignoredUrl = ignoredTestsUrl(url, isOnboarding);

  const changeKinds = [
    build.changeCount > 0 && 'visual',
    build.accessibilityChangeCount > 0 && 'accessibility',
  ].filter(Boolean);
  const changeTotal = (build.changeCount || 0) + (build.accessibilityChangeCount || 0);

  const changesLine =
    changeTotal > 0 &&
    chalk`${error} {bold ${pluralize(`${changeKinds.join(' and ')} changes`, changeTotal, true)} must be accepted as ${pluralize('baseline', changeTotal)}.} Review at ${link(url)}`;

  const ignoredLine =
    build.ignoredCount > 0 &&
    chalk`{bold ${pluralize('test', build.ignoredCount, true)} ${pluralize('was', build.ignoredCount)} ignored in this build.} Review at ${link(ignoredUrl)}`;

  return dedent(chalk`
    ${[changesLine, ignoredLine].filter(Boolean).join('\n\n')}

    ${info} For CI/CD use cases, this command failed with exit code ${exitCode}
    Pass {bold --exit-zero-on-changes} to succeed this command regardless of changes.
    Pass {bold --auto-accept-changes} to succeed and automatically accept any changes.
  `);
};
