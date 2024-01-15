import chalk from 'chalk';
import pluralize from 'pluralize';
import { dedent } from 'ts-dedent';

import { warning } from '../../components/icons';
import { FileDesc } from '../../../types';

export default ({ emptyFiles }: { emptyFiles: FileDesc[] }) => {
  const listing = chalk`\n{dim →} ${emptyFiles.map((f) => f.targetPath).join(chalk`\n{dim →} `)}`;
  return dedent(chalk`
    ${warning} {bold Not uploading empty files}
    Found ${pluralize('empty files', emptyFiles.length, true)} in your built Storybook:${listing}
    Uploading empty files is not supported except when using a zip file.
    You can ignore this warning if your Storybook doesn't need these files.
    Otherwise, configure Chromatic with the {bold zip} option.
  `);
};
