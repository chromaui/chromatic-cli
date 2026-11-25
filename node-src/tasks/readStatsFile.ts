import { parseChunked } from '@discoveryjs/json-ext';
import { createReadStream } from 'fs';

import { Stats } from '../types';

/**
 * Reads a stats file such as `preview-stats.json`.
 *
 * @param filePath The path to the stats file.
 *
 * @returns The parsed stats.
 *
 * @throws {TypeError} When the parsed JSON has no top-level `modules` array, the shape Storybook's
 * `--stats-json` writes. Every reader indexes `modules`, so it would otherwise fail later with a
 * TypeError that doesn't name the file.
 */
export const readStatsFile = async (filePath: string): Promise<Stats> => {
  const stats: unknown = await parseChunked(createReadStream(filePath));
  if (!Array.isArray((stats as Partial<Stats> | null)?.modules)) {
    throw new TypeError(
      `${filePath} must contain a top-level modules array. Rebuild your Storybook with --stats-json to replace it.`
    );
  }
  return stats as Stats;
};
