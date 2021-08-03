#!/usr/bin/env node

const util = ['trim-stats-file', 'stats-to-story-files'].find((u) => u === process.argv[2]);

require('dotenv').config();
require('esm')(module)(`./${util || 'main'}.js`).main(process.argv.slice(util ? 3 : 2));
