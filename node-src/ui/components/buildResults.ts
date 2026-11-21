import chalk from 'chalk';
import pluralize from 'pluralize';

import { BuildTest, Context } from '../../types';
import link from './link';
import { testLabel } from './testLabel';

// The result block that every completed build which didn't pass prints: a headline counting what
// was found, a link to the build, and the tests in each category. It hands people and coding
// agents the data and leaves the next step to them.

export const MAX_LISTED_TESTS = 50;

type ResultsBuild = Partial<
  Pick<
    Context['build'],
    | 'status'
    | 'errorCount'
    | 'interactionTestFailuresCount'
    | 'deniedCount'
    | 'pendingCount'
    | 'acceptedCount'
    | 'ignoredCount'
    | 'erroredTests'
    | 'deniedTests'
    | 'pendingTests'
    | 'ignoredTests'
  >
> &
  Pick<Context['build'], 'number' | 'webUrl' | 'app'>;

const listFormat = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });

const changes = (count: number) => pluralize('change', count, true);

// Describes `count` with `describe`, or nothing when it is zero or missing.
const finding = (count: number | undefined, describe: (count: number) => string) =>
  count ? describe(count) : undefined;

const headline = (build: ResultsBuild) => {
  const findings = [
    finding(build.errorCount, (count) => pluralize('error', count, true)),
    finding(build.deniedCount, (count) => `${changes(count)} denied`),
    finding(
      build.pendingCount,
      (count) => `${changes(count)} ${count === 1 ? 'needs' : 'need'} review`
    ),
    // A reviewer accepted the changes while the CLI waited for the build.
    build.status === 'ACCEPTED'
      ? finding(build.acceptedCount, (count) => `${changes(count)} accepted`)
      : undefined,
  ].filter((description) => description !== undefined);
  return findings.length > 0 ? listFormat.format(findings) : 'This build has changes';
};

// Lists up to MAX_LISTED_TESTS of `tests`, then how many of `total` it left out.
const testSection = (heading: string, tests: BuildTest[] = [], total = 0) => {
  if (tests.length === 0) {
    return;
  }
  const listed = tests.slice(0, MAX_LISTED_TESTS);
  const unlisted = total - listed.length;
  return [
    heading,
    ...listed.map((test) => `  ${testLabel(test)}`),
    ...(unlisted > 0 ? [`  …and ${unlisted} more`] : []),
  ].join('\n');
};

// `icon` marks whether the job failed (✖) or passed (✔), which only the caller knows.
export const buildResults = (build: ResultsBuild, isOnboarding: boolean, icon: string) => {
  const { errorCount = 0, interactionTestFailuresCount = 0, erroredTests = [] } = build;
  const linkLine = isOnboarding
    ? chalk`Continue setup at ${link(build.app.setupUrl)}`
    : chalk`View Build ${build.number}: ${link(build.webUrl)}`;

  return [
    [`${icon} ${chalk.bold(headline(build))}`, linkLine].join('\n'),
    testSection(
      'Failed to render:',
      erroredTests.filter((test) => !test.hasInteractionFailure),
      errorCount - interactionTestFailuresCount
    ),
    testSection(
      'Failed interaction tests:',
      erroredTests.filter((test) => test.hasInteractionFailure),
      interactionTestFailuresCount
    ),
    testSection('Denied:', build.deniedTests, build.deniedCount),
    testSection('Need review:', build.pendingTests, build.pendingCount),
    testSection('Ignored:', build.ignoredTests, build.ignoredCount),
  ]
    .filter(Boolean)
    .join('\n\n');
};
