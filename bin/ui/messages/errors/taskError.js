import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error } from '../../components/icons';

const lcfirst = str => `${str.charAt(0).toLowerCase()}${str.substr(1)}`;

export default function taskError({ title }, e) {
  return dedent(chalk`
    ${error} {bold Failed to ${lcfirst(title)}}
    ${e.message}
  `);
}
