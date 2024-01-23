import chalk from 'chalk';
import pluralize from 'pluralize';
import stripAnsi from 'strip-ansi';
import { dedent } from 'ts-dedent';

import { Context, InitialContext } from '../../..';
import link from '../../components/link';
import { redact } from '../../../lib/utils';

const buildFields = ({ id, number, storybookUrl = undefined, webUrl = undefined }) => ({
  id,
  number,
  ...(storybookUrl && { storybookUrl }),
  ...(webUrl && { webUrl }),
});

export default function fatalError(
  ctx: Context | InitialContext,
  error: Error | Error[],
  timestamp = new Date().toISOString()
) {
  const { flags, extraOptions, configuration, sessionId, pkg, packageJson } = ctx;
  const { scripts = {} } = packageJson;
  const email = link(pkg.bugs.email);
  const website = link(pkg.docs);
  const errors = [].concat(error);

  const {
    git,
    storybook,
    runtimeMetadata,
    exitCode,
    exitCodeKey,
    announcedBuild,
    build = announcedBuild,
    buildCommand,
  } = ctx;

  const debugInfo = redact(
    {
      timestamp,
      sessionId,
      gitVersion: git && git.version,
      nodePlatform: process.platform,
      nodeVersion: process.versions.node,
      ...runtimeMetadata,
      packageName: pkg.name,
      packageVersion: pkg.version,
      ...(storybook ? { storybook } : {}),
      flags,
      ...(extraOptions && { extraOptions }),
      ...(configuration && { configuration }),
      ...('options' in ctx && ctx.options?.buildScriptName
        ? { buildScript: scripts[ctx.options.buildScriptName] }
        : {}),
      ...(buildCommand && { buildCommand }),
      exitCode,
      exitCodeKey,
      errorType: errors.map((err) => err.name).join('\n'),
      errorMessage: stripAnsi(errors[0].message.split('\n')[0].trim()),
      ...(build && { build: buildFields(build) }),
    },
    'projectToken',
    'reportToken',
    'userToken'
  );

  const stacktraces = errors.map((err) => err.stack).filter(Boolean);
  return [
    errors.map((err) => err.message).join('\n'),
    stacktraces.length
      ? chalk`{dim → View the full ${pluralize('stacktrace', stacktraces.length)} below}\n`
      : '',
    dedent(chalk`
      If you need help, please chat with us at ${website} for the fastest response.
      You can also email the team at ${email} if chat is not an option.

      Please provide us with the above CLI output and the following info:
    `),
    chalk`{bold ${JSON.stringify(debugInfo, null, 2)}}`,
    stacktraces.length ? chalk`\n{dim ${stacktraces.join('\n\n')}}` : '',
  ].join('\n');
}
