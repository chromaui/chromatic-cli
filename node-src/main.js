const Observable = require('zen-observable');

global.Observable = Observable;
require('any-observable/register')('global.Observable');

module.exports = require('./index');
