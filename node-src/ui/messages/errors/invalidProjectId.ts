import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error, info } from '../../components/icons';
import link from '../../components/link';

export default ({ projectId }: { projectId: string }) =>
  dedent(chalk`
    ${error} Invalid project ID: ${projectId}
    You may not sufficient permissions to create builds on this project, or it may not exist.
    ${info} Read more at ${link('https://www.chromatic.com/docs/quickstart/')}
  `);
