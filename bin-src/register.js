#!/usr/bin/env node

import 'dotenv/config';

const commands = {
  init: () => import('./init').then(({ main: initMain }) => initMain(process.argv.slice(3))),
  main: () => import('./main').then(({ main }) => main(process.argv.slice(2))),
  trace: () => import('./trace').then(({ main: traceMain }) => traceMain(process.argv.slice(3))),
  'trim-stats-file': () =>
    import('./trimStatsFile').then(({ main: trimMain }) => trimMain(process.argv.slice(3))),
};

(commands[process.argv[2]] || commands.main)();
