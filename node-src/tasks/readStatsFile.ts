import { createReadStream } from 'fs';

import { parseChunked } from '@discoveryjs/json-ext';

import { Stats } from '../types';

export const readStatsFile = async (filePath: string): Promise<Stats> => {
  return parseChunked(createReadStream(filePath));
};
