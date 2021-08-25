import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error } from '../../components/icons';

export default () =>
  dedent(chalk`
    ${error} Missing {bold --storybook-port}
    You must pass a port number when using {bold --exec}.
  `);
