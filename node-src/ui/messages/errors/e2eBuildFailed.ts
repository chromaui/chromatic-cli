import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export default ({ flag, errorMessage }: { flag: string; errorMessage: string }) => {
  return dedent(chalk`
      ${error} Failed to run \`chromatic --${flag}\`:
      
      ${errorMessage}
    `);
};
