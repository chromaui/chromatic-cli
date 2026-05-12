import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { Context } from '../../../types';
import { info, warning } from '../../components/icons';
import link from '../../components/link';
import { getShallowRepositoryAdvice } from '../gitRepositoryAdvice';

const docsUrl =
  'https://www.chromatic.com/docs/quickstart/#why-do-i-see-build-x-is-based-on-a-commit-without-ancestor-builds';

export default ({
  announcedBuild,
  git,
  repositoryDiagnostics,
  turboSnap,
}: Pick<Context, 'announcedBuild' | 'git' | 'repositoryDiagnostics' | 'turboSnap'>) => {
  const diagnostics = git?.diagnostics || repositoryDiagnostics;
  const diagnosticAdvice = getShallowRepositoryAdvice(diagnostics);
  const diagnosticLine = diagnosticAdvice ? `\n      ${diagnosticAdvice}` : '';

  return turboSnap
    ? dedent(chalk`
      ${warning} {bold TurboSnap disabled due to missing ancestor build}
      An ancestor is required to determine which files have changed since the last Chromatic build.
      This usually happens when rebasing, force-pushing, squash-merging or running against an ephemeral merge commit.
      ${info} Read more at ${link(docsUrl)}
      ${diagnosticLine}
    `)
    : dedent(chalk`
      ${warning} {bold No ancestor build found}
      Build ${announcedBuild.number} is based on a commit without ancestor builds, which is unusual.
      This usually happens when rebasing, force-pushing, squash-merging or running against an ephemeral merge commit.
      ${info} Read more at ${link(docsUrl)}
      ${diagnosticLine}
    `);
};
