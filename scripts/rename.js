#!/usr/bin/env node

import { readFile, writeFile } from 'jsonfile';
import pkgUp from 'pkg-up';

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

  const temporary = { ...initial, name };
  await packageJson.write(temporary);
};

rename(...process.argv.slice(2, 3));
