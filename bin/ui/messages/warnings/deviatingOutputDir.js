import chalk from 'chalk';
import dedent from 'ts-dedent';

import { warning } from '../../components/icons';

export default ({ sourceDir, options }, outputDir) =>
  dedent(chalk`
    ${warning} {bold Deviating build directory}
    The CLI instructed your Storybook to be built at {bold ${sourceDir}}
    but instead it was built at {bold ${outputDir}}
    This is likely caused by some script in between your build script {bold "${options.buildScriptName}"}
    and the actual build-storybook script it invokes. Make sure it propagates the {bold --output-dir (-o)} flag.
  `);
