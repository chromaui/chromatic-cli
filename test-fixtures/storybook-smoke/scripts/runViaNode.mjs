#!/usr/bin/env node

import { run } from 'chromatic/node';
import process from 'process';

run({
  flags: {
    projectToken: process.env.CHROMATIC_PROJECT_TOKEN,
    exitZeroOnChanges: true,
  },
}).then(
  ({ code }) => {
    process.exit(code);
  },
  (err) => {
    console.log(err);
    process.exit(1);
  }
);
