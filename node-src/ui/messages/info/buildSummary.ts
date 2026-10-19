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

export type SummaryLog = 'passed' | 'exitZeroOnChanges';

export default (ctx: Context, log: SummaryLog) => {
  const { build, isOnboarding } = ctx;
  const url = isOnboarding ? build.app.setupUrl : build.webUrl;
  const ignoredLine = ignoredTests({ ignoredCount: build.ignoredCount, url, isOnboarding });

  // The routing in tasks/snapshot decides why the command exits 0: `passed` for clean or
  // auto-accepted builds, `exitZeroOnChanges` when the flag forces a successful exit over
  // unreviewed changes. This is the one place that words that reason.
  const exitZeroLine =
    log === 'exitZeroOnChanges'
      ? `${info} Exit code is 0 because of --exit-zero-on-changes.`
      : undefined;

  if (isOnboarding) {
    const { snapshots, components, stories, e2eTests } = stats({ build });
    const foundString = isE2EBuild(ctx.options)
      ? `We found ${e2eTests} and captured ${snapshots}.`
      : `We found ${components} with ${stories} and captured ${snapshots}.`;
    const headline =
      log === 'exitZeroOnChanges'
        ? 'Build completed. Welcome to Chromatic!'
        : 'Build passed. Welcome to Chromatic!';

    return dedent(chalk`
      ${success} {bold ${headline}}
      ${[foundString, ignoredLine, exitZeroLine].filter(Boolean).join('\n')}
      ${info} Please continue setup at ${link(build.app.setupUrl)}
    `);
  }

  const headline =
    log === 'exitZeroOnChanges'
      ? `Build ${build.number} completed`
      : `Build ${build.number} passed!`;

  return dedent(chalk`
    ${success} {bold ${headline}}
    ${[changesLine(build), ignoredLine, exitZeroLine].filter(Boolean).join('\n')}
    ${info} View build details at ${link(build.webUrl)}
  `);
};
