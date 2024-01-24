import chalk from 'chalk';
import { dedent } from 'ts-dedent';
import { error, info } from '../../components/icons';

export default ({ dependencyName, flag }: { dependencyName: string; flag: string }) => {
  return dedent(chalk`
      ${error} Failed to import \`${dependencyName}\`, is it installed in \`package.json\`?

      ${info} To run \`chromatic --${flag}\` you must have \`${dependencyName}\` installed.
    `);
};
