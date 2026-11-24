import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { isE2EBuild } from '../../../lib/e2eUtils';
import { Context } from '../../../types';
import { buildResults } from '../../components/buildResults';
import { autoAcceptedChanges, changeStatus } from '../../components/changeStatus';
import { info, success } from '../../components/icons';
import ignoredTests from '../../components/ignoredTests';
import link from '../../components/link';
import { stats } from '../../tasks/snapshot';

const changesLine = (build: Context['build']) => {
  const summary = build.autoAcceptChanges ? autoAcceptedChanges(build) : changeStatus(build);
  return summary ? `${summary}.` : 'No changes were found in this build.';
};

// Only clean, auto-accepted, accepted, and --exit-zero-on-changes builds reach this message, so
// a build that did not pass is here because of the flag. Accepted changes count as passing:
// they were reviewed, and the build exits 0 for them.
const hasPassed = (build: Context['build']) =>
  build.status === 'PASSED' || build.status === 'ACCEPTED' || build.autoAcceptChanges;

// Whether this message is the result block, which lists tests, rather than a pass or welcome.
export const summaryListsTests = (build: Context['build']) => !hasPassed(build);

export default (ctx: Context) => {
  const { build, isOnboarding } = ctx;
  const url = isOnboarding ? build.app.setupUrl : build.webUrl;
  const ignoredLine = ignoredTests({ ignoredCount: build.ignoredCount, url, isOnboarding });

  if (summaryListsTests(build)) {
    return buildResults(build, isOnboarding, success);
  }

  if (isOnboarding) {
    const { snapshots, components, stories, e2eTests } = stats({ build });
    const foundString = isE2EBuild(ctx.options)
      ? `We found ${e2eTests} and captured ${snapshots}.`
      : `We found ${components} with ${stories} and captured ${snapshots}.`;
    return dedent(chalk`
      ${success} {bold Build passed. Welcome to Chromatic!}
      ${[foundString, ignoredLine].filter(Boolean).join('\n')}
      ${info} Please continue setup at ${link(build.app.setupUrl)}
    `);
  }

  return dedent(chalk`
    ${success} {bold Build ${build.number} passed!}
    ${[changesLine(build), ignoredLine].filter(Boolean).join('\n')}
    ${info} View build details at ${link(build.webUrl)}
  `);
};
