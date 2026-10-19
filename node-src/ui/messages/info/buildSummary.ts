import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { isE2EBuild } from '../../../lib/e2eUtils';
import { Context } from '../../../types';
import { autoAcceptedChanges, changeStatus } from '../../components/changeStatus';
import { info, success } from '../../components/icons';
import ignoredTests from '../../components/ignoredTests';
import link from '../../components/link';
import { stats } from '../../tasks/snapshot';

const changesLine = (build: Context['build']) => {
  const summary = build.autoAcceptChanges ? autoAcceptedChanges(build) : changeStatus(build);
  return summary ? `${summary}.` : 'No changes were found in this build.';
};

export default (ctx: Context) => {
  const { build, isOnboarding } = ctx;
  const url = isOnboarding ? build.app.setupUrl : build.webUrl;
  const ignoredLine = ignoredTests({ ignoredCount: build.ignoredCount, url, isOnboarding });

  // Only clean, auto-accepted, accepted, and --exit-zero-on-changes builds reach this message, so
  // a build that did not pass is here because of the flag. Accepted changes count as passing:
  // they were reviewed, and the build exits 0 for them.
  const passed =
    build.status === 'PASSED' || build.status === 'ACCEPTED' || build.autoAcceptChanges;

  if (isOnboarding) {
    const { snapshots, components, stories, e2eTests } = stats({ build });
    const foundString = isE2EBuild(ctx.options)
      ? `We found ${e2eTests} and captured ${snapshots}.`
      : `We found ${components} with ${stories} and captured ${snapshots}.`;
    const headline = passed
      ? 'Build passed. Welcome to Chromatic!'
      : 'Build completed. Welcome to Chromatic!';

    return dedent(chalk`
      ${success} {bold ${headline}}
      ${[foundString, ignoredLine].filter(Boolean).join('\n')}
      ${info} Please continue setup at ${link(build.app.setupUrl)}
    `);
  }

  const headline = passed ? `Build ${build.number} passed!` : `Build ${build.number} completed`;

  return dedent(chalk`
    ${success} {bold ${headline}}
    ${[changesLine(build), ignoredLine].filter(Boolean).join('\n')}
    ${info} View build details at ${link(build.webUrl)}
  `);
};
