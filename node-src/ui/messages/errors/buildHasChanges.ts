import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { buildResults } from '../../components/buildResults';
import { error, info } from '../../components/icons';

export default ({ build, exitCode, isOnboarding }) => {
  // --auto-accept-changes is left out on purpose: a coding agent reading the log would pass it
  // and accept the changes without the person who must review them.
  const exitZeroHint =
    build.status === 'PENDING' &&
    dedent(chalk`
      ${info} This command exits ${exitCode} while a build has unreviewed changes. To let CI pass and leave the review
        to the UI Tests status, run with {bold --exit-zero-on-changes}.
    `);

  return [buildResults(build, isOnboarding, error), exitZeroHint].filter(Boolean).join('\n\n');
};
