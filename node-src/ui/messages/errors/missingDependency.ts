import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error, info } from '../../components/icons';

export default ({
  dependencyName,
  flag,
  workingDir,
}: {
  dependencyName: string;
  flag: string;
  workingDir?: string;
}) => {
  return dedent(chalk`
      ${error} Failed to import \`${dependencyName}\`, is it installed in \`package.json\`?

      ${info} To run \`chromatic --${flag}\` you must have \`${dependencyName}\` installed.
      ${
        workingDir
          ? `\n${info} Chromatic looked in \`${workingDir}\`. If that's not the right directory, you might need to set the \`workingDir\` option to the action.`
          : ''
      }
    `);
};
