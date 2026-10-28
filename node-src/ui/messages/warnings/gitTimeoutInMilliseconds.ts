import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { warning } from '../../components/icons';

export default ({ gitTimeout }: { gitTimeout: number }) => {
  const seconds = gitTimeout / 1000;
  return dedent(chalk`
    ${warning} {bold Reading gitTimeout as milliseconds}
    gitTimeout in your configuration file is in seconds, but ${gitTimeout} looks like milliseconds.
    Using a timeout of ${seconds} seconds. Set gitTimeout to ${seconds} to keep it and remove this warning.
  `);
};
