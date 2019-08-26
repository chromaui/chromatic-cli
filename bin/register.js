#!/usr/bin/env node

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

require('dotenv').config();
require('esm')(module)('./main.js').run(process.argv.slice(2));
