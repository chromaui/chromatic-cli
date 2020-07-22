import chalk from 'chalk';
import dedent from 'ts-dedent';

import { warning } from '../../components/icons';

export default ({ sourceDir, options, packageJson }, outputDir) => {
  const { buildScriptName } = options;
  const buildScript = packageJson.scripts && packageJson.scripts[buildScriptName];
  const npmRunWarning = dedent(chalk`
    It appears you're using {bold "npm run"} which is known to cause this problem. You can fix this by invoking {bold build-storybook} from your {bold "${buildScriptName}"} script directly.
  `);

  return dedent(chalk`
    ${warning} {bold Unexpected build directory}
    The CLI tried to build your Storybook at {bold ${sourceDir}} but instead it was built at {bold ${outputDir}}.
    Make sure your {bold "${buildScriptName}"} script forwards the {bold --output-dir (-o)} flag to the {bold build-storybook} CLI.
    ${buildScript && buildScript.includes('npm run') ? npmRunWarning : ''}
  `);
};
