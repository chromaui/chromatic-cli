const { readJson, writeJson } = require('fs-extra');

const isUserCode = (mod) => !mod.name.match(/(node_modules|webpack\/runtime)/);
const dedupe = (arr) => [...new Set(arr)];

const main = async () => {
  const stats = await readJson('./storybook-static/preview-stats.json');
  await writeJson(
    './storybook-static/preview-stats-trimmed.json',
    {
      modules: stats.modules.filter(isUserCode).map(({ id, name, modules, reasons }) => ({
        id,
        name,
        modules: modules && modules.map((m) => ({ name: m.name })),
        reasons: dedupe(reasons.map((r) => r.moduleName))
          .filter((n) => {
            if (n === name) console.log(n);
            return n !== name;
          })
          .map((moduleName) => ({ moduleName })),
      })),
    },
    { spaces: 2 }
  );
};

main();
