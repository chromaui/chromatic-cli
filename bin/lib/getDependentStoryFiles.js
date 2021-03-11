const isUserCode = (mod) => !mod.name.match(/(node_modules|webpack\/runtime)/);

const modToParts = (m) => [
  m.name,
  m.modules && m.modules.map(modToParts),
  [...new Set(m.reasons.map((r) => r.moduleName))],
];

// TODO -- obviously this can depend on (-C)
const STORYBOOK_DIR = './.storybook';
// NOTE: this only works with `main:stories` -- if stories are imported from files in `.storybook/preview.js`
// we'll need a different approach to figure out CSF files (maybe the user should pass a glob?).
const STORIES_ENTRY = `${STORYBOOK_DIR}/generated-stories-entry.js`;

export function statsToDependencies(stats) {
  const { modules } = stats;
  // console.dir(modules.filter(isUserCode).map(modToParts), { depth: null });

  const idsMap = {}; // Map module name to id
  const reasonsMap = {}; // A reason is a dependent ==> map id to reasons
  const isCsfGlob = {}; // Is a given module name a CSF glob specified in a `require.context()`

  modules.filter(isUserCode).forEach((mod) => {
    if (mod.id) {
      idsMap[mod.name] = mod.id;
      (mod.modules ? mod.modules.map((m) => m.name) : []).forEach((name) => {
        idsMap[name] = mod.id;
      });
    }

    reasonsMap[mod.id] = mod.reasons
      .map((r) => r.moduleName)
      .filter(Boolean)
      .filter((n) => n !== mod.name);

    if (reasonsMap[mod.id].includes(STORIES_ENTRY)) {
      isCsfGlob[mod.name] = true;
    }
  });

  return { idsMap, reasonsMap, isCsfGlob };
}

export function getDependentStoryFiles(changedFiles, stats) {
  const { idsMap, reasonsMap, isCsfGlob } = statsToDependencies(stats);
  const reverseIdsMap = Object.fromEntries(Object.entries(idsMap).map(([name, id]) => [id, name]));

  const checkedIds = {};
  const toCheck = [];
  const allChangedNames = new Set();
  let bailFile; // We need to bail out and check everything
  const changedCsfIds = new Set();

  function reachName(name) {
    // Don't look any further, we've reached the CSF glob.
    if (isCsfGlob[name]) {
      return;
    }

    allChangedNames.add(name);
    if (name.startsWith(STORYBOOK_DIR) && name !== STORIES_ENTRY) {
      bailFile = name;
    }

    const id = idsMap[name];
    if (!id) {
      return;
      // throw new Error(`Didn't find module ${name}`);
    }

    if (checkedIds[id]) {
      return;
    }

    // Schedule this module to be checked
    toCheck.push(id);

    const isCsf = !!reasonsMap[id].find((reasonName) => isCsfGlob[reasonName]);
    if (isCsf) {
      changedCsfIds.add(id);
    }
  }

  changedFiles.map(reachName);

  while (toCheck.length > 0) {
    const id = toCheck.pop();

    checkedIds[id] = true;
    reasonsMap[id].map(reachName);
  }

  return bailFile ? false : [...changedCsfIds].map((id) => [String(id), reverseIdsMap[id]]);
}
