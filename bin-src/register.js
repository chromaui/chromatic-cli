#!/usr/bin/env node
import Observable from 'zen-observable';

global.Observable = Observable;
require('any-observable/register')('global.Observable');

require('dotenv').config();
require('./main').main(process.argv.slice(2));
