import chalk from 'chalk';
import dedent from 'ts-dedent';

import link from '../link';
import { error } from '../icons';

const lcfirst = str => `${str.charAt(0).toLowerCase()}${str.substr(1)}`;

export default function fatalError(
  { sessionId, git = {}, pkg, flags, title },
  { name, message, stack }
) {
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
    exitCode: process.exitCode,
    errorMessage: message,
  };

  return dedent(chalk`
  ${error} {bold Failed to ${lcfirst(title)}}
  ${name}: ${message}
  {dim → View the full stacktrace below}

  If you need help, please contact ${email} or chat with us at ${website}
  Please provide us with the following info:
  {bold ${JSON.stringify(debugInfo, null, 2)}}

  {dim ${stack}}
  `);
}
