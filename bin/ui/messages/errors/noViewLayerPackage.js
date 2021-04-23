import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error } from '../../components/icons';

export default () =>
  dedent(chalk`
    ${error} {bold Storybook package not found}
    Could not find a supported Storybook viewlayer package in {bold node_modules}.
    Most likely you forgot to run {bold npm install} or {bold yarn} before running Chromatic.
  `);
