import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { info, success } from '../../components/icons';

function formatBuild(build: { number: number; commit: string }) {
  return `#${build.number}(${build.commit.substring(0, 6)})`;
}

export default ({ replacedBuild, replacementBuild }) =>
  dedent(chalk`
    ${info} As the parent build ${formatBuild(replacedBuild)} did not exist in the git repository,
    we've replaced it (for TurboSnap calculations) with the nearest ancestor
    which does exist in the git history: ${formatBuild(replacementBuild)}.
  `);
