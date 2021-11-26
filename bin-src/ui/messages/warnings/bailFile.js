import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { warning, info } from '../../components/icons';
import link from '../../components/link';

const docsUrl = 'https://www.chromatic.com/docs/turbosnap#how-it-works';

export default (file) =>
  dedent(chalk`
    ${warning} {bold Ignoring --only-changed}
    Found a change in ${file}
    A full build is required because this file cannot be linked to any specific stories.
    ${info} Read more at ${link(docsUrl)}
  `);
