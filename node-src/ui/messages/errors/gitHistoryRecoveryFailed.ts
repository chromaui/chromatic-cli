import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error, info } from '../../components/icons';

export default (reason: string) =>
  dedent(chalk`
    ${error} {bold Failed to recover missing Git history}
    Chromatic tried to deepen the current checkout after failing to find an ancestor build, but Git history recovery failed:
    ${reason}

    ${info} Ensure this CI checkout can fetch from its configured remote, or disable {bold --fetch-missing-history}.
  `);
