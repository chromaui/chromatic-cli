const comparePackageJsons = (packageObjA, packageObjB) => {
  return compareObjectsShallowly(packageObjA.dependencies, packageObjB.dependencies);
};

const compareObjectsShallowly = (objA, objB) => {
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

export default comparePackageJsons;
