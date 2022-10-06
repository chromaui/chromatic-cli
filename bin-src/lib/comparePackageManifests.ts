const arePackageDependenciesEqual = (packageObjA, packageObjB) => {
  const fields = ['dependencies', 'devDependencies', 'peerDependencies'];

  return fields
    .map((field) => compareObjectsShallowly(packageObjA[field], packageObjB[field]))
    .every((isEqual) => isEqual === true);
};

const compareObjectsShallowly = (objA = {}, objB = {}) => {
  if (typeof objA !== typeof objB) {
    return false;
  }

  if (typeof objA !== 'object' && typeof objB !== 'object') {
    return objA === objB;
  }

  const entriesA = Object.entries(objA).sort((a, b) => a[0].localeCompare(b[0]));
  const entriesB = Object.entries(objB).sort((a, b) => a[0].localeCompare(b[0]));

  if (entriesA.length !== entriesB.length) {
    return false;
  }

  // depends on always having consistent ordering of keys
  // eslint-disable-next-line no-plusplus
  for (let i = 0; i < entriesA.length; i++) {
    const entryA = entriesA[i];
    const entryB = entriesB[i];

    // do keys match?
    if (entryA[0] !== entryB[0]) {
      return false;
    }

    // do values match?
    if (entryA[1] !== entryB[1]) {
      return false;
    }
  }

  return true;
};

export default arePackageDependenciesEqual;
