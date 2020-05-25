#!/usr/bin/env node

require('dotenv').config();
require('esm')(module)('./main.js').main(process.argv.slice(2));
