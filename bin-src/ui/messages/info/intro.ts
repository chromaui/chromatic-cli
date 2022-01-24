import chalk from 'chalk';
import { dedent } from 'ts-dedent';
import { Context } from '../../../types';

export default ({ pkg }: Pick<Context, 'pkg'>) =>
  dedent(chalk`
    {bold Chromatic CLI v${pkg.version}}
    {dim ${pkg.docs}}
  `);
