const { readJson, outputFile } = require('fs-extra');

const statsFile = process.argv[2] || './storybook-static/preview-stats.json';
const targetFile = statsFile.replace('.json', '.trimmed.json');

const dedupe = (arr) => [...new Set(arr)];
const isUserCode = ({ name, moduleName = name }) =>
  !moduleName.startsWith('(webpack)') && !moduleName.match(/\/(node_modules|webpack\/runtime)\//);

const main = async () => {
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

  await outputFile(
    targetFile,
    JSON.stringify({ modules: trimmedModules }, null, 2)
      .replace(/{\n {10}/g, '{ ')
      .replace(/\n {8}}/g, ' }')
  );

  // eslint-disable-next-line no-console
  console.log(`Wrote ${targetFile}`);
};

main();
