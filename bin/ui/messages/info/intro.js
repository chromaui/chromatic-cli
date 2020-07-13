import chalk from 'chalk';
import dedent from 'ts-dedent';

export default ({ pkg }) =>
  dedent(chalk`
    {bold Chromatic CLI v${pkg.version}}
    {dim ${pkg.docs}}
  `);
