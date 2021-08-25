import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error } from '../../components/icons';
import link from '../../components/link';

export default ({ options, buildLogFile }) => {
  const { buildScriptName } = options;
  return dedent(chalk`
    ${error} {bold Cannot run a build with no stories}

    Your statically built Storybook exposes no stories. This indicates a problem with your Storybook. Here's what to do:

    - Check the build log at {bold ${buildLogFile}}
    - Run {bold npm run ${buildScriptName}} or {bold yarn ${buildScriptName}} yourself and make sure it outputs a valid Storybook by opening the generated {bold index.html} in your browser.
    - Make sure you haven't accidently ignored all stories. See ${link(
      'https://www.chromatic.com/docs/ignoring-elements#ignore-stories'
    )} for details.
  `);
};
