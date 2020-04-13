#!/usr/bin/env node

require('dotenv').config();
require('esm')(module)('./main.js').run(process.argv.slice(2));
