import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error } from '../../components/icons';

export default ({ patchHeadRef, patchBaseRef }) =>
  dedent(chalk`
    ${error} {bold Failed to retrieve the merge base}
    Are you sure the head branch is a descendant (i.e. fork) of the base branch?
    Try running this command yourself: {bold git merge-base ${patchHeadRef} ${patchBaseRef}}
  `);
