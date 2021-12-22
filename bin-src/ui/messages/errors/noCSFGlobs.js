import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error, info } from '../../components/icons';
import link from '../../components/link';

export default ({ statsPath, storybookDir, viewLayer = 'react' }) => {
  const docsUrl = `https://storybook.js.org/docs/${viewLayer}/configure/overview`;
  return dedent(chalk`
    ${error} Did not find any CSF globs in {bold ${statsPath}}
    Check your stories configuration in {bold ${storybookDir}/main.js}
    ${info} Read more at ${link(docsUrl)}
  `);
};
