// TODO -- obviously this can depend on (-C)
const STORYBOOK_DIR = './.storybook';
// NOTE: this only works with `main:stories` -- if stories are imported from files in `.storybook/preview.js`
// we'll need a different approach to figure out CSF files (maybe the user should pass a glob?).
const STORIES_ENTRY = `${STORYBOOK_DIR}/generated-stories-entry.js`;

const isUserCode = ({ name, moduleName = name }) =>
  !moduleName.startsWith('(webpack)') && !moduleName.match(/\/(node_modules|webpack\/runtime)\//);

export function statsToDependencies({ modules }) {
  const idsByName = {};
  const reasonsById = {};
  const isCsfGlob = {};

  modules.filter(isUserCode).forEach((mod) => {
    if (mod.id) {
      idsByName[mod.name] = mod.id;
      (mod.modules ? mod.modules.map((m) => m.name) : []).forEach((name) => {
        idsByName[name] = mod.id;
      });
    }

    reasonsById[mod.id] = mod.reasons
      .map((r) => r.moduleName)
      .filter(Boolean)
      .filter((n) => n !== mod.name);

    if (reasonsById[mod.id].includes(STORIES_ENTRY)) {
      isCsfGlob[mod.name] = true;
    }
  });

  return { idsByName, reasonsById, isCsfGlob };
}

export function getDependentStoryFiles(changedFiles, { idsByName, reasonsById, isCsfGlob }) {
  const changedCsfIds = new Set();
  const checkedIds = {};
  const toCheck = [];

  function traceName(name) {
    if (isCsfGlob[name]) return;
    if (name.startsWith(STORYBOOK_DIR) && name !== STORIES_ENTRY) throw name;

    const id = idsByName[name];
    if (!id || !reasonsById[id] || checkedIds[id]) return;
    toCheck.push(id);

    if (reasonsById[id].some((reasonName) => isCsfGlob[reasonName])) {
      changedCsfIds.add(id);
    }
  }

  try {
    changedFiles.forEach(traceName);
    while (toCheck.length > 0) {
      const id = toCheck.pop();
      checkedIds[id] = true;
      reasonsById[id].forEach(traceName);
    }
  } catch (e) {
    if (typeof e === 'string') return false; // bail
    throw e;
  }

  return Array.from(changedCsfIds).map(String);
}
