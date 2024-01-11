import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export const maxFileCountExceeded = ({
  fileCount,
  maxFileCount,
}: {
  fileCount: number;
  maxFileCount: number;
}) =>
  dedent(chalk`
    ${error} {bold Attempted to upload too many files}
    You're not allowed to upload more than ${maxFileCount} files per build.
    Your Storybook contains ${fileCount} files. This is a very high number.
    Do you have files in a static/public directory that shouldn't be there?
    Contact customer support if you need to increase this limit.
  `);
