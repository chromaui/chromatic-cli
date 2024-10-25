import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { warning } from '../../components/icons';

export default (outOfSyncDependency?: string) =>
  outOfSyncDependency
    ? dedent(chalk`
      ${warning} {bold TurboSnap disabled due to an out of sync error}
      It appears your package.json and lockfile is out of sync
      We found multiple versions of {bold ${outOfSyncDependency}} in your lockfile.
      This usually happens when you have different versions in "dependencies"
      and "devDependencies".

      To fix this, update {bold ${outOfSyncDependency}} in your package.json to have matching versions.
`)
    : dedent(chalk`
      ${warning} {bold TurboSnap disabled due to an out of sync error}
      It appears your package.json and lockfile is out of sync
      We found multiple versions of the same dependency in your lockfile.
      This usually happens when you have different versions in "dependencies"
      and "devDependencies".

      To fix this, ensure all dependencies have the same versions.
`);
