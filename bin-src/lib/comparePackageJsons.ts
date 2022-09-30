const comparePackageJsons = (packageFileA, packageFileB) => {
  const entriesA = Object.entries(packageFileA);
  const entriesB = Object.entries(packageFileB);

  if (entriesA.length !== entriesB.length) {
    return false;
  }

  // depends on always having consistent ordering of keys
  // eslint-disable-next-line consistent-return
  entriesA.forEach((entryA, index) => {
    const entryB = entriesB[index];

    if (entryA[0] !== entryB[0]) {
      return false;
    }
  });

  return true;
};

export default comparePackageJsons;
