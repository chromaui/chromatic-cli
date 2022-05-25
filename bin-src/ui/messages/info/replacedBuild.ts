import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { info } from '../../components/icons';

function commit(build) {
  return build.commit.substring(0, 6);
}

export default ({ replacedBuild, replacementBuild }) =>
  dedent(chalk`
    ${info} {bold Missing commit detected:}
    When detecting git changes for TurboSnap, we couldn't find the commit (${commit(
      replacedBuild
    )}) for the most recent build (#${replacedBuild.number}).
    To avoid re-snapshotting stories we know haven't changed, we copied from the most recent build (#${
      replacementBuild.number
    }) that did have a commit (${commit(replacementBuild)}) instead.
  `);
