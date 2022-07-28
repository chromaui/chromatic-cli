import { parseChunked } from '@discoveryjs/json-ext';
import { createReadStream, outputFile } from 'fs-extra';
import { Stats } from './types';

const dedupe = <T>(arr: T[]) => Array.from(new Set(arr));
const isUserCode = ({ name, moduleName = name }: { name?: string; moduleName?: string }) =>
  moduleName &&
  !moduleName.startsWith('(webpack)') &&
  !moduleName.match(/(node_modules|webpack\/runtime)\//);

export const readStatsFile = async (filePath: string): Promise<Stats> =>
  parseChunked(createReadStream(filePath));

/**
 * Utility to trim down a `preview-stats.json` file to the bare minimum, so that it can be used to
 * trace dependent story files while being (somewhat) human readable. By default it looks in the
 * `storybook-static` directory. It outputs a new file alongside the original stats file, with
 * `.trimmed.json` as file extension.
 *
 * Usage examples:
 *   yarn chromatic trim-stats-file
 *   yarn chromatic trim-stats-file ./path/to/preview-stats.json
 */

export async function main([statsFile = './storybook-static/preview-stats.json']) {
  try {
    const stats = await readStatsFile(statsFile);
    const trimmedModules = stats.modules
      .filter(isUserCode)
      .map(({ id, name, modules, reasons }) => {
        const trimmedReasons = dedupe(reasons.filter(isUserCode).map((r) => r.moduleName))
          .filter((n) => n !== name)
          .map((moduleName) => ({ moduleName }));
        return {
          id,
          name,
          modules: modules && modules.map((m) => ({ name: m.name })),
          reasons: trimmedReasons,
        };
      })
      .filter(Boolean);

    const targetFile = statsFile.replace('.json', '.trimmed.json');
    await outputFile(
      targetFile,
      JSON.stringify({ modules: trimmedModules }, null, 2)
        .replace(/{\n {10}/g, '{ ')
        .replace(/\n {8}}/g, ' }')
    );

    // eslint-disable-next-line no-console
    console.log(`Wrote ${targetFile}`);
  } catch (err) {
    console.error(err);
  }
}
