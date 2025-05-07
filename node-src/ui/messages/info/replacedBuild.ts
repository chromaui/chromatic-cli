import chalk from 'chalk';
import tsDedent from 'ts-dedent';

import { Build } from '../../../git/mocks/mockIndex';
import { info } from '../../components/icons';

const commit = (build: Build) => chalk.cyan(build.commit);

/**
 * Formats a message indicating that a build was replaced by another build.
 *
 * @param root0 - The root object.
 * @param root0.replacedBuild - The build that was replaced.
 * @param root0.replacementBuild - The build that replaced the original build.
 *
 * @returns The formatted message.
 */
export default function replacedBuild({
  replacedBuild,
  replacementBuild,
}: {
  replacedBuild: Build;
  replacementBuild: Build;
}) {
  return tsDedent`
    ${info} {bold Missing commit detected}
    When detecting git changes for TurboSnap, we couldn't find the commit (${commit(replacedBuild)}) for the most recent build (#${replacedBuild.number}).
    To avoid re-snapshotting stories we know haven't changed, we copied from the most recent build (#${replacementBuild.number}) that did have a commit (${commit(replacementBuild)}).
  `;
}
