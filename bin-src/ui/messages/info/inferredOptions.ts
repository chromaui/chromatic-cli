import chalk from 'chalk';
import { dedent } from 'ts-dedent';
import { Context } from '../../../types';

import { info } from '../../components/icons';

export default ({ scriptName, port }: Pick<Context['options'], 'scriptName' | 'port'>) =>
  dedent(chalk`
    ${info} Detected {bold ${scriptName}} script, running with inferred options:
    {bold --script-name=${scriptName}}
    {bold --storybook-port=${port}}
    Override any of the above if they were inferred incorrectly.
  `);
