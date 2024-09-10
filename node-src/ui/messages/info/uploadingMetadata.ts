import chalk from 'chalk';
import pluralize from 'pluralize';

import { FileDesc } from '../../../types';
import { info } from '../../components/icons';
import link from '../../components/link';

export default (directoryUrl: string, files: FileDesc[]) => {
  const count = pluralize('metadata file', files.length, true);
  const list = `- ${files.map((f) => f.targetPath.replace(/^\.chromatic\//, '')).join('\n- ')}`;
  return chalk`${info} Uploading {bold ${count}} to ${link(directoryUrl)}\n${list}`;
};
