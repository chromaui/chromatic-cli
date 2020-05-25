import chalk from 'chalk';
import dedent from 'ts-dedent';

import { warning } from '../../components/icons';

export default (ctx, latestVersion, hasYarn = false) => {
  const installScript = hasYarn
    ? `yarn upgrade chromatic --latest`
    : `npm install chromatic@latest --save-dev`;

  return dedent(chalk`
    ${warning} {bold Using outdated package}
    You are using an outdated version of the Chromatic CLI (v${ctx.pkg.version}).
    A new major version is available (v${latestVersion}).
    Run {bold ${installScript}} to upgrade.
  `);
};
