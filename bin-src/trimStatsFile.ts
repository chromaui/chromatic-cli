import { outputFile } from 'fs-extra';

import { readStatsFile } from '../node-src/tasks/readStatsFile';

type FilePath = string;
type NormalizedName = string;

// Convert a "webpack path" (relative to storybookBaseDir) to a "git path" (relative to repository root)
// e.g. `./src/file.js` => `path/to/storybook/src/file.js`
const normalize = (path: FilePath): NormalizedName => {
  const URL_PARAM_REGEX = /(\?.*)/g;
  // Trim query params such as `?ngResource` which are sometimes present
  return URL_PARAM_REGEX.test(path) ? path.replaceAll(URL_PARAM_REGEX, '') : path;
};

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
    const uniqueModules = new Set<string>();
    const stats = await readStatsFile(statsFile);
    const trimmedModules = stats.modules
      .filter((module) => isUserCode(module))
      .map(({ id, name, modules, reasons }) => {
        const trimmedReasons = dedupe(
          reasons?.filter((reason) => isUserCode(reason)).map((r) => normalize(r.moduleName)) || []
        )
          .filter((n) => n !== name)
          .map((moduleName) => ({ moduleName }));
        const normalizedName = normalize(name);
        const cleanName = normalizedName.replace(/\s\+\s\d+\smodules$/, '');
        if (uniqueModules.has(cleanName)) {
          return;
        } else {
          uniqueModules.add(cleanName);
        }
        return {
          id,
          name: normalizedName,
          modules: modules && modules.map((m) => ({ name: normalize(m.name) })),
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
