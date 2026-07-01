#!/usr/bin/env node

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import pkgUp from 'pkg-up';
import { readFile, writeFile } from 'jsonfile';

// Node runs this file as ESM (it uses import), where __dirname isn't defined
const __dirname = dirname(fileURLToPath(import.meta.url));

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
