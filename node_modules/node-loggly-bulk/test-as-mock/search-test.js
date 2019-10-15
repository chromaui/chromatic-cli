/*
 * search-test.js: Tests for Loggly search requests
 *
 * (C) 2010 Charlie Robbins
 * MIT LICENSE
 *
 */
var path = require('path'),
  vows = require('vows'),
  nock = require('nock'),
  assert = require('assert'),
  helpers = require('./helpers');

var options = {},
  testContext = {},
  config = helpers.loadConfig(),
  loggly = require('../lib/loggly').createClient(config);

vows.describe('node-loggly/search').addBatch({
  "When using the node-loggly client": {
    "the search() method": {
      "when searching without chaining": {
        topic: function() {
          nock("https://" + config.subdomain + ".loggly.com", {
              reqheaders: {
                'authorization': 'Basic ' + new Buffer(config.auth.username + ":" + config.auth.password).toString('base64')
              }
            })
            .get('/apiv2/search')
            .query({
              q: 'logging message'
            })
            .reply(200, {
              total_events: 1,
              page: 0,
              events: [{
                raw: 'this is a test logging message from /test/input-test.js',
                logtypes: [],
                timestamp: 1456830373968,
                unparsed: null,
                logmsg: 'this is a test logging message from /test/input-test.js',
                id: '9ce38479-df9d-11e5-802c-12a650209768',
                tags: [],
                event: {}
              }, ],
              callback: '',
              rsid: {
                status: 'SCHEDULED',
                date_from: 1455971607000,
                elapsed_time: 0.026120901107788086,
                date_to: 1456835607000,
                id: '897886661'
              }

            });
          nock("https://" + config.subdomain + ".loggly.com", {
              reqheaders: {
                'authorization': 'Basic ' + new Buffer(config.auth.username + ":" + config.auth.password).toString('base64')
              }
            })
            .get('/apiv2/events')
            .query({
              rsid: '897886661'
            })
            .reply(200, {
              total_events: 1,
              page: 0,
              events: [{
                raw: 'this is a test logging message from /test/input-test.js',
                logtypes: [],
                timestamp: 1456830373968,
                unparsed: null,
                logmsg: 'this is a test logging message from /test/input-test.js',
                id: '9ce38479-df9d-11e5-802c-12a650209768',
                tags: [],
                event: {}
              }, ],
              callback: '',
              rsid: {
                status: 'SCHEDULED',
                date_from: 1455971607000,
                elapsed_time: 0.026120901107788086,
                date_to: 1456835607000,
                id: '897886661'
              }

            });
          loggly.search('logging message', this.callback)
        },
        "should return a set of valid search results": function(err, results) {
          helpers.assertSearch(err, results);
        }
      },
      "when searching with chaining": {
        topic: function() {
          nock("https://" + config.subdomain + ".loggly.com", {
              reqheaders: {
                'authorization': 'Basic ' + new Buffer(config.auth.username + ":" + config.auth.password).toString('base64')
              }
            })
            .get('/apiv2/search')
            .query({
              q: 'logging message',
              callback: ''
            })
            .reply(200, {
              total_events: 1,
              page: 0,
              events: [{
                raw: 'this is a test logging message from /test/input-test.js',
                logtypes: [],
                timestamp: 1456830373968,
                unparsed: null,
                logmsg: 'this is a test logging message from /test/input-test.js',
                id: '9ce38479-df9d-11e5-802c-12a650209768',
                tags: [],
                event: {}
              }],
              callback: '',
              rsid: {
                status: 'SCHEDULED',
                date_from: 1455971607000,
                elapsed_time: 0.026120901107788086,
                date_to: 1456835607000,
                id: '897886661'
              }
            });
          nock("https://" + config.subdomain + ".loggly.com", {
              reqheaders: {
                'authorization': 'Basic ' + new Buffer(config.auth.username + ":" + config.auth.password).toString('base64')
              }
            }).get('/apiv2/events')
            .query({
              rsid: '897886661'
            })
            .reply(200, {
              total_events: 1,
              page: 0,
              events: [{
                raw: 'this is a test logging message from /test/input-test.js',
                logtypes: [],
                timestamp: 1456830373968,
                unparsed: null,
                logmsg: 'this is a test logging message from /test/input-test.js',
                id: '9ce38479-df9d-11e5-802c-12a650209768',
                tags: [],
                event: {}
              }],
              callback: '',
              rsid: {
                status: 'SCHEDULED',
                date_from: 1455971607000,
                elapsed_time: 0.026120901107788086,
                date_to: 1456835607000,
                id: ''
              }
            });
          loggly.search('logging message')
            .run(this.callback);
        },
        "should return a set of valid search results": function(err, results) {
          helpers.assertSearch(err, results);
        }
      }
    },
    "the _checkRange() method": {
      "with invalid options set": {
        "should correct them": function() {
          var search = loggly.search({
              query: 'invalid logging message',
              from: 'now',
              until: '-1d'
            })
            ._checkRange();

          assert.equal(search.options.from, 'now');
          assert.equal(search.options.until, '-1d');
        }
      },
      "with valid options set": {
        "should not modify them": function() {
          var search = loggly.search({
              query: 'valid logging message',
              from: '-2M',
              until: 'now'
            })
            ._checkRange();

          assert.equal(search.options.from, '-2M');
          assert.equal(search.options.until, 'now');
        }
      }
    }
  }
}).export(module);
