import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error, info } from '../../components/icons';
import link from '../../components/link';

export default ({ statsPath, storybookDir, storybookBuildDir, entryFile, viewLayer = 'react' }) => {
  if (entryFile) {
    const hint = storybookBuildDir
      ? `Configure {bold --storybook-config-dir} with the value for {bold --config-dir} or {bold -c} from your build-storybook script.`
      : `Configure {bold --build-script-name} to point at the {bold build-storybook} script which has {bold --config-dir} or {bold -c} set.`;
    return dedent(chalk`
      ${error} Did not find any CSF globs in {bold ${statsPath}}
      Found an entry file at {bold ${entryFile}} but expected it at {bold ${storybookDir}/generated-stories-entry.js}.
      ${hint}
      ${info} Read more at ${link('https://www.chromatic.com/docs/turbosnap')}
    `);
  }
  return dedent(chalk`
    ${error} Did not find any CSF globs in {bold ${statsPath}}
    Check your stories configuration in {bold ${storybookDir}/main.js}
    ${info} Read more at ${link(`https://storybook.js.org/docs/${viewLayer}/configure/overview`)}
  `);
};
