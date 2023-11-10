#!/usr/bin/env node

import process from 'process';
import { run } from '../dist/node.js';

run({
  flags: {
    projectToken: process.env.CHROMATIC_PROJECT_TOKEN,
  },
}).catch((err) => {
  // eslint-disable-next-line no-console
  console.log(err);
  process.exit(1);
});
