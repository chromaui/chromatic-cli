import chalk from 'chalk';
import { filesize } from 'filesize';
import { dedent } from 'ts-dedent';

import { error } from '../../components/icons';

export const maxFileSizeExceeded = ({
  filePaths,
  maxFileSize,
}: {
  filePaths: string[];
  maxFileSize: number;
}) =>
  dedent(chalk`
    ${error} {bold Attempted to exceed maximum file size}
    You're attempting to upload files that exceed the maximum file size of ${filesize(maxFileSize)}.
    Contact customer support if you need to increase this limit.
    - ${filePaths.map((path) => path).join('\n- ')}
  `);
