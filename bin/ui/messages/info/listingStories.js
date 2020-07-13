import chalk from 'chalk';
import dedent from 'ts-dedent';

import { info } from '../../components/icons';

const snapshotRow = ({ spec }) => chalk`{dim → }${spec.component.name}:${spec.name}`;

export default snapshots =>
  dedent(chalk`
    {bold Listing available stories:}
    ${snapshots.map(snapshotRow).join('\n')}

    ${info} Use {bold --only} to run a build for a specific component or story.
    Globs are supported, for example: {bold --only "${snapshots[0].spec.component.name}:*"}
  `);
