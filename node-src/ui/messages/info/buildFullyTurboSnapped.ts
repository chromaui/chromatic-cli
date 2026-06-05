import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { Context } from '../../../types';
import { info, success } from '../../components/icons';
import link from '../../components/link';

const ancestorStatusMessages: Record<string, string> = {
  PENDING:
    'The pending status will be carried over from the most recent ancestor build that has unreviewed changes.',
  PASSED: 'The passed status will be carried over from the most recent ancestor build.',
  ACCEPTED: 'The accepted status will be carried over from the most recent ancestor build.',
  DENIED: 'The denied status will be carried over from the most recent ancestor build.',
};

export default ({ ancestorBuild }: Pick<Context, 'ancestorBuild'>) => {
  const lines = [
    chalk`${success} {bold This build was skipped and will not be displayed in Chromatic.}`,
  ];

  const statusMessage = ancestorBuild && ancestorStatusMessages[ancestorBuild.status];
  if (ancestorBuild && statusMessage) {
    lines.push(
      statusMessage,
      `${info} View ancestor build details at ${link(ancestorBuild.webUrl)}`
    );
  }

  return `${dedent(chalk`${lines.join('\n')}`)}\n`;
};
