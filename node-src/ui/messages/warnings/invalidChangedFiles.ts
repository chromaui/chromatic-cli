import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { RepositoryDiagnostics } from '../../../types';
import { info, warning } from '../../components/icons';
import link from '../../components/link';
import { getShallowRepositoryAdvice } from '../gitRepositoryAdvice';

const docsUrl = 'https://www.chromatic.com/docs/turbosnap#how-it-works';

export default (diagnostics?: RepositoryDiagnostics) => {
  const diagnosticAdvice = getShallowRepositoryAdvice(diagnostics);
  const diagnosticLine = diagnosticAdvice ? `\n    ${diagnosticAdvice}` : '';

  return dedent(chalk`
    ${warning} {bold TurboSnap disabled due to missing git history}
    Could not retrieve changed files since baseline commit(s).
    This typically happens after rebasing, force pushing, or when running against an ephemeral merge commit.
    ${info} Read more at ${link(docsUrl)}
    ${diagnosticLine}
  `);
};
