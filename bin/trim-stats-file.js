import { readJson, outputFile } from 'fs-extra';

const dedupe = (arr) => [...new Set(arr)];
const isUserCode = ({ name, moduleName = name }) =>
  !moduleName.startsWith('(webpack)') && !moduleName.match(/\/(node_modules|webpack\/runtime)\//);

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
  const stats = await readJson(statsFile);
  const trimmedModules = stats.modules
    .filter(isUserCode)
    .map(({ id, name, modules, reasons }) => {
      const trimmedReasons = dedupe(reasons.filter(isUserCode).map((r) => r.moduleName))
        .filter((n) => n !== name)
        .map((moduleName) => ({ moduleName }));
      if (!trimmedReasons.length) return null;
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
}
