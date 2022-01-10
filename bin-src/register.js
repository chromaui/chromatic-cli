#!/usr/bin/env node
/* eslint-disable global-require */
const Observable = require('zen-observable');

global.Observable = Observable;
require('any-observable/register')('global.Observable');

require('dotenv').config();

const commands = {
  main: () => require('./main').main(process.argv.slice(2)),
  trace: () => require('./trace').main(process.argv.slice(3)),
  'trim-stats-file': () => require('./trim-stats-file').main(process.argv.slice(3)),
  'stats-to-story-files': () => require('./stats-to-story-files').main(process.argv.slice(3)),
};

(commands[process.argv[2]] || commands.main)();
