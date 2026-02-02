#!/usr/bin/env node

import pkgUp from 'pkg-up';
import { readFile, writeFile } from 'jsonfile';

const packageJson = {
  async read() {
    return pkgUp(__dirname).then((l) => readFile(l));
  },
  async write(json) {
    return pkgUp(__dirname).then((l) => writeFile(l, json, { spaces: 2 }));
  },
};

const rename = async (name) => {
  const initial = await packageJson.read();

  const temp = { ...initial, name };
  await packageJson.write(temp);
};

rename(...process.argv.slice(2, 3));
