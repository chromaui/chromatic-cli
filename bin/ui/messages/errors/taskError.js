import chalk from 'chalk';

import { error } from '../../components/icons';

const lcfirst = (str) => `${str.charAt(0).toLowerCase()}${str.substr(1)}`;

export default function taskError({ title }, err) {
  return [chalk`${error} {bold Failed to ${lcfirst(title)}}`, err.message].join('\n');
}
