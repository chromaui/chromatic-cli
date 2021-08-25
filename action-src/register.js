import Observable from 'zen-observable';

global.Observable = Observable;
require('any-observable/register')('global.Observable');

require('./main');
