import chalk from 'chalk';
import dedent from 'ts-dedent';

import {
  arrowDown,
  arrowRight,
  chevronRight,
  error,
  info,
  spinner,
  success,
  warning,
} from './icons';

const icons = {
  initial: chalk.gray(chevronRight),
  pending: chalk.yellow(spinner),
  skipped: chalk.magenta(arrowDown),
  success,
  warning,
  error,
  info,
};

export default ({ status, title, output = [] }) => {
  const lines = Array.isArray(output) ? output : dedent(output).split('\n');
  const icon = icons[status] ? `${icons[status]} ` : '';
  return [
    `${icon}${status === 'initial' ? title : chalk.bold(title)}`,
    ...lines.map((line) => chalk.dim(`  ${arrowRight} ${line}`)),
  ].join('\n');
};
