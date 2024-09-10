import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { info, warning } from '../../components/icons';
import link from '../../components/link';

const docsUrl = 'https://www.chromatic.com/docs/turbosnap#how-it-works';

export default (files: string[]) => {
  const count = files.length === 1 ? 'file' : `${files.length} files`;
  const names = files.map((f) => chalk.bold(f));
  const listing = files.length === 1 ? names[0] : chalk`\n{dim →} ${names.join(chalk`\n{dim →} `)}`;
  return dedent(chalk`
    ${warning} {bold TurboSnap disabled due to matching --externals}
    Found ${count} with changes: ${listing}
    ${info} Read more at ${link(docsUrl)}
  `);
};
