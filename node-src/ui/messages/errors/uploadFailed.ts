import chalk from 'chalk';
import { dedent } from 'ts-dedent';

import { FileDesc, TargetInfo } from '../../../types';
import { error as icon } from '../../components/icons';

const encode = (path: string) => path.split('/').map(encodeURIComponent).join('/');

export function uploadFailed({ target }: { target: FileDesc & TargetInfo }, debug = false) {
  const diagnosis =
    encode(target.targetPath) !== target.targetPath
      ? 'It seems the file path may contain illegal characters.'
      : 'The file may have been modified during the upload process.';
  const message = dedent(chalk`
    ${icon} Failed to upload {bold ${target.localPath}} to {bold ${target.targetPath}}
    ${diagnosis}
    ${debug ? '' : chalk`Enable the {bold debug} option to get more information.`}
  `);
  return debug ? message + JSON.stringify(target, null, 2) : message;
}
