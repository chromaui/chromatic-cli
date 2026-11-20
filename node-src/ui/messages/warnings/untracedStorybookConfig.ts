import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { UntracedFile } from '../../../types';
import { info, warning } from '../../components/icons';
import link from '../../components/link';

const docsUrl = 'https://www.chromatic.com/docs/turbosnap';

const describeMatch = ({ filepath, glob }: UntracedFile) =>
  chalk`{bold ${filepath}} (via {bold ${glob}})`;

/**
 * Warns that `--untraced` matches Storybook config files whose changes can affect every story, so
 * TurboSnap can miss stories that changed.
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
    ${warning} {bold TurboSnap can miss changes to untraced Storybook config files}
    ${matched}
    Changing your Storybook's {bold main}, {bold preview}, {bold preview-head.html}, or {bold preview-body.html} file can affect every story. TurboSnap ignores changes to untraced files and to files only they import, so it may not retest the stories those changes affect.
    ${info} Read more at ${link(docsUrl)}
  `);
};
