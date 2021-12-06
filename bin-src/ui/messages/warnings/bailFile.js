import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { warning, info } from '../../components/icons';
import link from '../../components/link';

const docsUrl = 'https://www.chromatic.com/docs/turbosnap#how-it-works';

export default ({ changedPackageFile, changedStaticFile, changedStorybookFile }) => {
  let type = changedPackageFile ? 'package' : 'static';
  if (changedStorybookFile) type = 'Storybook config';
  return dedent(chalk`
    ${warning} {bold Ignoring --only-changed}
    Found a ${type} file change in ${
    changedPackageFile || changedStorybookFile || changedStaticFile
  }
    A full build is required because this file cannot be linked to any specific stories.
    ${info} Read more at ${link(docsUrl)}
  `);
};
