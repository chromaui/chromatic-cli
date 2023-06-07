import chalk from 'chalk';
import { dedent } from 'ts-dedent';
import { Flags } from '../../../types';

import { warning } from '../../components/icons';
import link from '../../components/link';

const changelogUrl = 'https://github.com/chromaui/chromatic-cli/blob/main/CHANGELOG.md';

const snakify = (option: string) => `--${option.replace(/[A-Z]/g, '-$&').toLowerCase()}`;

export default ({ flag, replacement }: { flag: keyof Flags; replacement?: keyof Flags }) =>
  dedent(chalk`
    ${warning} {bold Using deprecated option: ${snakify(flag)}}
    This option is ${
      replacement ? chalk`superceded by {bold ${snakify(replacement)}}` : 'deprecated'
    } and may be removed in a future release.
    Refer to the changelog for more information: ${link(changelogUrl)}
  `);
