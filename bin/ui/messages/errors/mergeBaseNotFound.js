import chalk from 'chalk';
import dedent from 'ts-dedent';

import { error, info } from '../../components/icons';
import link from '../../components/link';

const docsUrl =
  'https://www.chromatic.com/docs/branching-and-baselines#how-the-merge-base-is-calculated';

export default ({ patchHeadRef, patchBaseRef }) =>
  dedent(chalk`
    ${error} {bold Failed to retrieve the merge base}
    Are you sure the head branch is a descendant (i.e. fork) of the base branch?
    Try running this command yourself: {bold git merge-base ${patchHeadRef} ${patchBaseRef}}
    ${info} Read more at ${link(docsUrl)}
  `);
