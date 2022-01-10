import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error, info } from '../../components/icons';
import link from '../../components/link';

export default ({ statsPath, storybookDir, entryFile, viewLayer = 'react' }) =>
  entryFile
    ? dedent(chalk`
      ${error} Did not find any CSF globs in {bold ${statsPath}}
      Found an entry file at {bold ${entryFile}} but expected it at {bold ${storybookDir}/generated-stories-entry.js}.
      Configure {bold --build-script-name} to point at the {bold build-storybook} script which has {bold --config-dir} or {bold -c} set.
      ${info} Read more at ${link('https://www.chromatic.com/docs/turbosnap')}
    `)
    : dedent(chalk`
      ${error} Did not find any CSF globs in {bold ${statsPath}}
      Check your stories configuration in {bold ${storybookDir}/main.js}
      ${info} Read more at ${link(`https://storybook.js.org/docs/${viewLayer}/configure/overview`)}
    `);
