import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { info } from '../../components/icons';

interface Spec {
  name: string;
  component: { name: string };
}

const snapshotRow = ({ spec }: { spec: Spec }) =>
  chalk`{dim → }${spec.component.name}/${spec.name}`;

export default (snapshots: { spec: Spec }[]) =>
  dedent(chalk`
    {bold Listing available stories:}
    ${snapshots.map(snapshotRow).join('\n')}

    ${info} Use {bold --only-story-names} to run a build for a specific component or story.
    Globs are supported, for example: {bold --only-story-names "${
      snapshots[0].spec.component.name
    }/**"}
  `);
