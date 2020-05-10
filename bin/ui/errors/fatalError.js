import pluralize from 'pluralize';
import chalk from 'chalk';
import dedent from 'ts-dedent';

import link from '../link';
import { error } from '../icons';

const lcfirst = str => `${str.charAt(0).toLowerCase()}${str.substr(1)}`;

export default function fatalError({ sessionId, git = {}, pkg, flags, title, exitCode }, errors) {
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
    errorMessage: errors.map(err => err.message).join('\n'),
  };
  const stacktraces = errors.map(err => err.stack).filter(Boolean);

  return dedent(chalk`
    ${error} {bold Failed to ${lcfirst(title)}}
    ${errors.map(err => `${err.name}: ${err.message}`).join('\n')}
    {dim → ${
      stacktraces.length
        ? `View the full ${pluralize('stacktrace', stacktraces.length)} below`
        : 'No stacktrace available'
    }}

    If you need help, please contact ${email} or chat with us at ${website}
    Please provide us with the following info:
    {bold ${JSON.stringify(debugInfo, null, 2)}}

    {dim ${stacktraces.length ? stacktraces.join('\n\n') : 'No stacktrace available'}}
  `);
}
