import pluralize from 'pluralize';
import chalk from 'chalk';
import dedent from 'ts-dedent';
import stripAnsi from 'strip-ansi';

import link from '../../components/link';

export default function fatalError({ sessionId, git = {}, pkg, flags, exitCode }, error) {
  const errors = [].concat(error);
  const email = link(pkg.bugs.email);
  const website = link(pkg.docs);
  const debugInfo = {
    timestamp: new Date().toISOString(),
    sessionId,
    gitVersion: git.version,
    nodePlatform: process.platform,
    nodeVersion: process.versions.node,
    packageName: pkg.name,
    packageVersion: pkg.version,
    flags,
    exitCode,
    errorMessage: stripAnsi(errors.map(err => err.message).join('\n')),
  };
  const stacktraces = errors.map(err => err.stack).filter(Boolean);
  const viewStacktraces = stacktraces.length
    ? chalk`\n{dim → View the full ${pluralize('stacktrace', stacktraces.length)} below}`
    : '';

  return dedent(chalk`
    ${errors.map(err => err.message).join('\n')}${viewStacktraces}

    If you need help, please contact ${email} or chat with us at ${website}
    Please provide us with the following info:
    {bold ${JSON.stringify(debugInfo, null, 2)}}
    ${stacktraces.length ? chalk`\n{dim ${stacktraces.join('\n\n')}}` : ''}
  `);
}
