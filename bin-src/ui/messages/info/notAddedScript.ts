import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { info } from '../../components/icons';

export default (scriptName: string, scriptCommand: string) => {
  const script = dedent`
    "scripts": {
      "${scriptName}": "${scriptCommand}"
    }
  `;
  return dedent(chalk`
    ${info} No problem. You can add it to your package.json yourself like so:
    {dim ${script}}
  `);
};
