#!/usr/bin/env node

import process from 'process';
import { run } from '../dist/node.js';

run({
  flags: {
    projectToken: process.env.CHROMATIC_PROJECT_TOKEN,
  },
}).then(
  ({ code }) => {
    process.exit(code);
  },
  (err) => {
    // eslint-disable-next-line no-console
    console.log(err);
    process.exit(1);
  }
);
