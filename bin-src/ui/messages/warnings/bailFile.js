import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { warning, info } from '../../components/icons';
import link from '../../components/link';

const docsUrl = 'https://www.chromatic.com/docs/turbosnap#how-it-works';

export default ({ turboSnap }) => {
  const { changedPackageFile, changedStaticFile, changedStorybookFile } = turboSnap.bailReason;
  const file = changedPackageFile || changedStorybookFile || changedStaticFile;
  let type = changedPackageFile ? 'package' : 'static';
  if (changedStorybookFile) type = 'Storybook config';
  return dedent(chalk`
    ${warning} {bold TurboSnap disabled}
    Found a ${type} file change in ${file}
    A full build is required because this file cannot be linked to any specific stories.
    ${info} Read more at ${link(docsUrl)}
  `);
};
