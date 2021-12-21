import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { warning, info } from '../../components/icons';
import link from '../../components/link';

const docsUrl = 'https://www.chromatic.com/docs/turbosnap#how-it-works';

export default (file) =>
  dedent(chalk`
    ${warning} {bold TurboSnap disabled due to matching --externals}
    Found file with changes: {bold ${file}}
    ${info} Read more at ${link(docsUrl)}
  `);
