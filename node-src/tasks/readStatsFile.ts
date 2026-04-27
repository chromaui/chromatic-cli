import { parseChunked } from '@discoveryjs/json-ext';
// eslint-disable-next-line no-restricted-imports
import { createReadStream } from 'fs';

import { Stats } from '../types';

export const readStatsFile = async (filePath: string): Promise<Stats> => {
  return parseChunked(createReadStream(filePath));
};
