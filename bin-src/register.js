#!/usr/bin/env node
import Observable from 'zen-observable';

global.Observable = Observable;
(await import('any-observable/register')).default('global.Observable');

(await import('dotenv')).default.config();

const util = ['trim-stats-file', 'stats-to-story-files'].find((u) => u === process.argv[2]);

switch (true) {
  case util === 'trim-stats-file': {
    (await import('./trim-stats-file')).main(process.argv.slice(3));
    break;
  }
  case util === 'stats-to-story-files': {
    (await import('./stats-to-story-files')).main(process.argv.slice(3));
    break;
  }
  default: {
    (await import('./main')).main(process.argv.slice(2));
    break;
  }
}
