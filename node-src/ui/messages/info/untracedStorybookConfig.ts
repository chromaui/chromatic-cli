import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { UntracedFile } from '../../../types';
import { info } from '../../components/icons';
import link from '../../components/link';

const docsUrl = 'https://www.chromatic.com/docs/turbosnap';

const describeMatch = ({ filepath, glob }: UntracedFile) =>
  chalk`{bold ${filepath}} (via {bold ${glob}})`;

/**
 * Explains that `--untraced` doesn't apply to the Storybook config files TurboSnap always traces.
 *
 * @param input The config files an `--untraced` glob matches.
 * @param input.matches Each matched config file, repository-relative, with the glob that matched it.
 *
 * @returns The message.
 */
export default ({ matches }: { matches: UntracedFile[] }) => {
  const matched =
    matches.length === 1
      ? chalk`{bold --untraced} matches ${describeMatch(matches[0])}.`
      : [
          chalk`{bold --untraced} matches these files:`,
          ...matches.map((match) => chalk`{dim →} ${describeMatch(match)}`),
        ].join('\n');

  return dedent(chalk`
    ${info} {bold Some untraced files are always traced}
    ${matched}
    TurboSnap always traces your Storybook's {bold main}, {bold preview}, {bold preview-head.html}, and {bold preview-body.html} files, even when an {bold --untraced} glob matches them, because changing them can affect every story.
    Read more at ${link(docsUrl)}
  `);
};
