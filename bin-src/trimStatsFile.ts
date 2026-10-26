import { outputFile } from 'fs-extra';
import meow from 'meow';

import { readStatsFile } from '../node-src/tasks/readStatsFile';

const dedupe = <T>(array: T[]) => [...new Set(array)];
const isUserCode = ({ name, moduleName = name }: { name?: string; moduleName?: string | null }) =>
  moduleName &&
  !moduleName.startsWith('(webpack)') &&
  !/(node_modules|webpack\/runtime)\//.test(moduleName);

/**
 * Trim a `preview-stats.json` file down to the bare minimum, so that it can be used to trace
 * dependent story files while being (somewhat) human readable. It outputs a new file alongside the
 * original stats file, with `.trimmed.json` as file extension.
 *
 * @param statsFile The stats file location.
 *
 * @returns The file path to the trimmed stats file.
 */
export async function trimStatsFile(statsFile: string) {
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

  const targetFile = statsFile.replace(/(\.json)?$/, '.trimmed.json');
  await outputFile(
    targetFile,
    JSON.stringify({ modules: trimmedModules }, undefined, 2)
      .replaceAll(/{\n {10}/g, '{ ')
      .replaceAll(/\n {8}}/g, ' }')
  );

  console.log(`Wrote ${targetFile}`);
  return targetFile;
}

/**
 * The main entrypoint for `chromatic trim-stats-file`.
 *
 * Usage examples:
 * yarn chromatic trim-stats-file
 * yarn chromatic trim-stats-file ./path/to/preview-stats.json
 *
 * @param argv A list of arguments passed.
 */
export async function main(argv: string[]) {
  const { input } = meow(
    `
    Usage
      $ chromatic trim-stats-file [<stats file>]

    Options
      <stats file>  Path to preview-stats.json. (default: './storybook-static/preview-stats.json')

    Writes <stats file> with a .trimmed.json extension next to the input.
    `,
    {
      argv,
      allowUnknownFlags: false,
      description: 'Trim a stats file down to user code, for debugging TurboSnap',
      flags: { help: { type: 'boolean' } },
    }
  );

  try {
    await trimStatsFile(input[0] ?? './storybook-static/preview-stats.json');
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}
