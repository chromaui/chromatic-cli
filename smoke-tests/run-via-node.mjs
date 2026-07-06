#!/usr/bin/env node

import process from 'process';

import { run } from 'chromatic/node';

run({
  flags: {
    projectToken: process.env.CHROMATIC_PROJECT_TOKEN,
    buildScriptName: 'build-storybook',
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
