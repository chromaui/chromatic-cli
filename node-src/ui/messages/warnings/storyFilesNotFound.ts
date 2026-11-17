import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { warning } from '../../components/icons';

export default (projectRoot: string) =>
  dedent(chalk`
    ${warning} {bold TurboSnap 2.0 could not find your story files}
    The stats file has a stories entry, but none of the modules it imports is a story file on disk under the Storybook project root {bold ${projectRoot}}.
    TurboSnap 2.0 skipped this build. When TurboSnap is enabled, the build uses TurboSnap 1.0, so your current TurboSnap behavior is unaffected.
    If Storybook was built in another directory, pass {bold --storybook-base-dir <dir>} pointing at it, relative to the repository root.
  `);
