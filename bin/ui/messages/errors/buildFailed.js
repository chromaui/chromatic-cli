import chalk from 'chalk';
import dedent from 'ts-dedent';

import link from '../../components/link';

export default ({ options, buildLogFile }, { message }) => {
  const { buildScriptName } = options;
  return dedent(chalk`
    The CLI tried to run your {bold ${buildScriptName}} script, but the command failed. This indicates a problem with your Storybook. Here's what to do:

    - Check the build log at {bold ${buildLogFile}}
    - Run {bold npm run ${buildScriptName}} or {bold yarn ${buildScriptName}} yourself and make sure it outputs a valid Storybook by opening the generated {bold index.html} in your browser.
    - Review the build-storybook CLI options at ${link(
      'https://storybook.js.org/docs/configurations/cli-options/#for-build-storybook'
    )}

    ${message}
  `);
};
