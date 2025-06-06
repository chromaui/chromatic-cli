import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { info, warning } from '../../components/icons';
import link from '../../components/link';

export default ({ build }) =>
  dedent(chalk`
    ${warning} {bold TurboSnap not available for your account}
    To ensure your project is fully setup and baselines are properly established,
    TurboSnap is not available until at least 10 builds are created from CI.

    ${info} Review your TurboSnap availability on the Manage screen:
    ${link(build.app.manageUrl)}
  `);
