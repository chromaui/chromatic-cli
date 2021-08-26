#!/usr/bin/env node
/* eslint-disable global-require */
import Observable from 'zen-observable';

global.Observable = Observable;
require('any-observable/register')('global.Observable');

require('dotenv').config();

const util = ['trim-stats-file', 'stats-to-story-files'].find((u) => u === process.argv[2]);

switch (true) {
  case util === 'trim-stats-file': {
    require('./trim-stats-file').main(process.argv.slice(3));
    break;
  }
  case util === 'stats-to-story-files': {
    require('./stats-to-story-files').main(process.argv.slice(3));
    break;
  }
  default: {
    require('./main').main(process.argv.slice(2));
    break;
  }
}
