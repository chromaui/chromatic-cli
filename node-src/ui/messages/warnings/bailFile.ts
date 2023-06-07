import chalk from 'chalk';
import { dedent } from 'ts-dedent';
import { Context } from '../../../types';
import { isPackageManifestFile } from '../../../lib/utils';

import { warning, info } from '../../components/icons';
import link from '../../components/link';

const docsUrl = 'https://www.chromatic.com/docs/turbosnap#how-it-works';

export default ({ turboSnap }: { turboSnap: Pick<Context['turboSnap'], 'bailReason'> }) => {
  const { changedPackageFiles, changedStaticFiles, changedStorybookFiles } = turboSnap.bailReason;
  const changedFiles = changedPackageFiles || changedStorybookFiles || changedStaticFiles;

  // if all changed files are package.json, message this as a dependency change.
  const allChangedFilesArePackageJson = changedFiles.every((changedFile) =>
    isPackageManifestFile(changedFile)
  );

  const [firstFile, ...files] = changedFiles;

  let type = changedPackageFiles ? 'package file' : 'static file';
  if (allChangedFilesArePackageJson) type = 'dependency';
  if (changedStorybookFiles) type = 'Storybook config';

  let siblings = '';
  if (files.length === 1) siblings = chalk` or its module sibling {bold ${files[0]}}`;
  if (files.length > 1)
    siblings = chalk` or one of its ${files.length} module siblings:\n{dim →} ${files
      .map((f) => chalk.bold(f))
      .join(chalk`\n{dim →} `)}`;

  return dedent(chalk`
    ${warning} {bold TurboSnap disabled due to file change}
    Found a ${type} change in {bold ${firstFile}}${siblings}
    A full build is required because this file cannot be linked to any specific stories.
    ${info} Read more at ${link(docsUrl)}
  `);
};
