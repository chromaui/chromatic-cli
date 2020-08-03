import chalk from 'chalk';
import pluralize from 'pluralize';
import stripAnsi from 'strip-ansi';
import dedent from 'ts-dedent';

import link from '../../components/link';

const buildFields = ({ id, number, webUrl }) => ({ id, number, webUrl });

export default function fatalError(ctx, error, timestamp = new Date().toISOString()) {
  const { flags, options, sessionId, pkg, packageJson } = ctx;
  const { scripts = {} } = packageJson;
  const errors = [].concat(error);
  const email = link(pkg.bugs.email);
  const website = link(pkg.docs);

  const { git = {}, storybook, exitCode, isolatorUrl, cachedUrl, build } = ctx;
  const debugInfo = {
    timestamp,
    sessionId,
    gitVersion: git.version,
    nodePlatform: process.platform,
    nodeVersion: process.versions.node,
    packageName: pkg.name,
    packageVersion: pkg.version,
    ...(storybook ? { storybook } : {}),
    flags,
    ...(options.buildScriptName ? { buildScript: scripts[options.buildScriptName] } : {}),
    ...(options.scriptName ? { storybookScript: scripts[options.scriptName] } : {}),
    exitCode,
    errorType: errors.map(err => err.name).join('\n'),
    errorMessage: stripAnsi(errors.map(err => err.message).join('\n')),
    ...(isolatorUrl ? { isolatorUrl } : {}),
    ...(cachedUrl ? { cachedUrl } : {}),
    ...(build && { build: buildFields(build) }),
  };

  const stacktraces = errors.map(err => err.stack).filter(Boolean);
  const viewStacktraces = stacktraces.length
    ? chalk`\n{dim → View the full ${pluralize('stacktrace', stacktraces.length)} below}`
    : '';

  return dedent(chalk`
    ${errors.map(err => err.message).join('\n')}${viewStacktraces}

    If you need help, please chat with us at ${website} for the fastest response.
    You can also email the team at ${email} if chat is not an option.

    Please provide us with the above CLI output and the following info:
    {bold ${JSON.stringify(debugInfo, null, 2)}}
    ${stacktraces.length ? chalk`\n{dim ${stacktraces.join('\n\n')}}` : ''}
  `);
}
