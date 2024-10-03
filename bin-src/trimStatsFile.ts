import { outputFile } from 'fs-extra';

import { readStatsFile } from '../node-src/tasks/readStatsFile';

const dedupe = <T>(array: T[]) => [...new Set(array)];
const isUserCode = ({ name, moduleName = name }: { name?: string; moduleName?: string }) =>
  moduleName &&
  !moduleName.startsWith('(webpack)') &&
  !/(node_modules|webpack\/runtime)\//.test(moduleName);

/**
 * Utility to trim down a `preview-stats.json` file to the bare minimum, so that it can be used to
 * trace dependent story files while being (somewhat) human readable. By default it looks in the
 * `storybook-static` directory. It outputs a new file alongside the original stats file, with
 * `.trimmed.json` as file extension.
 *
 * Usage examples:
 * yarn chromatic trim-stats-file
 * yarn chromatic trim-stats-file ./path/to/preview-stats.json
 *
 * @param argv A list of arguments passed.
 * @param argv."0" The stats file location passed in as a positional argument.
 *
 * @returns The file path to the trimmed stats file.
 */
export async function main([statsFile = './storybook-static/preview-stats.json']) {
  try {
    const stats = await readStatsFile(statsFile);
    const trimmedModules = stats.modules
      .filter((module) => isUserCode(module))
      .map(({ id, name, modules, reasons }) => {
        const trimmedReasons = dedupe(
          reasons?.filter((reason) => isUserCode(reason)).map((r) => r.moduleName) || []
        )
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
      JSON.stringify({ modules: trimmedModules }, undefined, 2)
        .replaceAll(/{\n {10}/g, '{ ')
        .replaceAll(/\n {8}}/g, ' }')
    );

    console.log(`Wrote ${targetFile}`);
    return targetFile;
  } catch (err) {
    console.error(err);
  }
}
