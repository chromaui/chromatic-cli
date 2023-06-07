#!/usr/bin/env node
/* eslint-disable global-require */

require('dotenv').config();

const commands = {
  main: () => require('./main').run(process.argv.slice(2)),
  trace: () => require('./trace').main(process.argv.slice(3)),
  'trim-stats-file': () => require('./trim-stats-file').main(process.argv.slice(3)),
};

(commands[process.argv[2]] || commands.main)();
