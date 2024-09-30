#!/usr/bin/env node

import { config } from 'dotenv';

import { main as initMain } from './init';
import { main } from './main';
import { main as traceMain } from './trace';
import { main as trimMain } from './trim-stats-file';

config();

const commands = {
  init: () => initMain(process.argv.slice(3)),
  main: () => main(process.argv.slice(2)),
  trace: () => traceMain(process.argv.slice(3)),
  'trim-stats-file': () => trimMain(process.argv.slice(3)),
};

(commands[process.argv[2]] || commands.main)();
