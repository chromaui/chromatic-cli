import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { warning } from '../../components/icons';

export default () =>
  dedent(chalk`
    ${warning} {bold Deduplication failed, falling back to uploading all files}
    An error occurred while waiting for the server to deduplicate files.
    Retrying the upload without deduplication.
  `);
