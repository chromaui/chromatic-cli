import chalk from 'chalk';
import { dedent } from 'ts-dedent';
import { Flags } from '../../../types';

import { warning } from '../../components/icons';
import link from '../../components/link';

const changelogUrl = 'https://github.com/chromaui/chromatic-cli/blob/main/CHANGELOG.md';

export default ({ flag }: { flag: keyof Flags }) =>
  dedent(chalk`
    ${warning} {bold Using deprecated option: ${flag}}
    This option is deprecated and may be removed in a future release.
    Refer to the changelog for more information: ${link(changelogUrl)}
  `);
