import chalk from 'chalk';

import { error } from '../../components/icons';

const lcfirst = (str: string) => `${str.charAt(0).toLowerCase()}${str.slice(1)}`;

export default function taskError({ title }: { title: string }, err: Error) {
  return [chalk`${error} {bold Failed to ${lcfirst(title)}}`, err.message].join('\n');
}
