#!/usr/bin/env node
require('./readEnv');
require('esm')(module)('./main.js').main(process.argv.slice(2));
