import chalk from 'chalk';
import pluralize from 'pluralize';
import { dedent } from 'ts-dedent';

import { info } from '../../components/icons';

export default ({ globs, modules }) => {
  const globCount = pluralize('CSF glob', globs.length, true);
  const moduleCount = pluralize('user module', modules.length, true);
  return dedent(chalk`
    ${info} {bold TurboSnap enabled}
    Traced ${moduleCount} from ${globCount}:
    {dim - ${globs.join('\n- ')}}
  `);
};
