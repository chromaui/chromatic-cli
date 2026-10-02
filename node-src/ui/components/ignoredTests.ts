import chalk from 'chalk';
import pluralize from 'pluralize';

import link from './link';

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

interface IgnoredTestsParameters {
  ignoredCount?: number;
  url: string;
  isOnboarding: boolean;
}

// The line the passed and has-changes messages use to report ignored tests, so the wording and the
// `expandIgnored` link have a single home. Errored builds leave it out on purpose. Returns nothing
// when no tests were ignored.
export default ({ ignoredCount = 0, url, isOnboarding }: IgnoredTestsParameters) => {
  if (ignoredCount < 1) {
    return;
  }

  return chalk`{bold ${pluralize('test', ignoredCount, true)} ${pluralize('was', ignoredCount)} ignored in this build.} Review at ${link(ignoredTestsUrl(url, isOnboarding))}`;
};
