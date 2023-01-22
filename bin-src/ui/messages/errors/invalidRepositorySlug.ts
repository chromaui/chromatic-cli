import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export default () =>
  dedent(chalk`
    ${error} Invalid value for {bold --repository-slug}
    The value must be in the format {bold <ownerName>/<repositoryName>}
    You can typically find this in the URL of your repository.
  `);
