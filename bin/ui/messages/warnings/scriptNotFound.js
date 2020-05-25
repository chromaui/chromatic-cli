import chalk from 'chalk';
import dedent from 'ts-dedent';

import { warning } from '../../components/icons';

export default scriptName =>
  dedent(chalk`
    ${warning} {bold No '${scriptName}' script found in your package.json}
    Would you like me to add it for you? [y/N] 
  `);
