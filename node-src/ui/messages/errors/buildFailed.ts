import chalk from 'chalk';
import { EOL } from 'os';
import { dedent } from 'ts-dedent';

import { Context } from '../../../types';
import { info } from '../../components/icons';
import link from '../../components/link';

export default (
  { options, buildCommand, buildLogFile, runtimeMetadata }: Context,
  { message },
  buildLog?: string
) => {
  const { buildScriptName, buildCommand: buildCommandOption } = options;
  const lines = buildLog?.split(EOL).filter((line) => line && !line.startsWith('<s>')) || [];

  const commandToBuild = buildScriptName || buildCommandOption;
  const suggestedRunCommands = buildScriptName
    ? chalk`{bold npm run ${commandToBuild}} or {bold yarn ${commandToBuild}}`
    : chalk`{bold ${commandToBuild}}`;

  return [
    dedent(chalk`
      The CLI tried to run your {bold ${commandToBuild}} script, but the command failed. This indicates a problem with your Storybook. Here's what to do:

      - Check the Storybook build log printed below.
      - Run ${suggestedRunCommands} yourself and make sure it outputs a valid Storybook by opening the generated {bold index.html} in your browser.
      - Review the build-storybook CLI options at ${link(
        'https://storybook.js.org/docs/configurations/cli-options/#for-build-storybook'
      )}
    `),
    message,
    chalk`${info} Build command:\n{dim ${buildCommand}}`,
    chalk`${info} Runtime metadata:\n{dim ${JSON.stringify(runtimeMetadata, undefined, 2)}}`,
    chalk`${info} Storybook build output:\n{dim ${buildLogFile}}`,
    lines.join(`\n`),
  ].join('\n\n');
};
