import chalk from 'chalk';
import pluralize from 'pluralize';
import { dedent } from 'ts-dedent';

import { Context } from '../../../types';
import { error, warning } from '../../components/icons';

/**
 * Generate a failure message for a runtime error during execution.
 *
 * @param details Information relating to a runtime error while running the CLI.
 * @param details.options Options specified when running the CLI.
 * @param details.runtimeErrors Any runtime errors encountered during execution.
 * @param details.runtimeWarnings Any runtime warnings encountered during execution.
 *
 * @returns A message about a runtime error during execution.
 */
// TODO: refactor this function
// eslint-disable-next-line complexity
export default function runtimeError({
  options,
  runtimeErrors = [],
  runtimeWarnings = [],
}: Pick<Context, 'options' | 'runtimeErrors' | 'runtimeWarnings'>) {
  const messages = [...runtimeErrors, ...runtimeWarnings].map(
    (err) => err.message || err.toString()
  );
  const stacktraces = [...runtimeErrors, ...runtimeWarnings]
    .map((err) => err.stack)
    .filter(Boolean);
  const viewStacktraces =
    stacktraces.length > 0
      ? chalk`\n{dim → View the full ${pluralize('stacktrace', stacktraces.length)} below}`
      : '';

  const errorCount = runtimeErrors.length;
  const warningCount = runtimeWarnings.length;
  const problems = [
    errorCount && pluralize('runtime error', errorCount, true),
    errorCount && warningCount && 'and',
    warningCount && pluralize('warning', warningCount, true),
  ]
    .filter(Boolean)
    .join(' ');

  const errorHint = options.allowConsoleErrors
    ? dedent(chalk`
      We'll ignore these errors because you passed the {bold --allow-console-errors} flag,
      but this is not recommended.`)
    : dedent(chalk`
      If you want to continue despite runtime errors, you can pass the
      {bold --allow-console-errors} flag, but this is not recommended.`);

  const warningHint = dedent(chalk`
    You should probably fix these warnings, but we'll continue anyway.`);

  return dedent(chalk`
    ${errorCount ? error : warning} {bold Detected ${problems} in your Storybook}
    ${messages.join('\n')}${viewStacktraces}

    This is usually a problem with your Storybook, not with Chromatic.
    Run your Storybook locally and check your browser console for errors.

    ${errorCount ? errorHint : warningHint}
    ${stacktraces.length > 0 ? chalk`\n{dim ${stacktraces.join('\n\n')}}` : ''}
  `);
}
