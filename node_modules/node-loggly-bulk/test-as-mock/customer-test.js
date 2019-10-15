/*
 * search-test.js: Tests for Loggly search requests
 *
 * (C) 2010 Charlie Robbins
 * MIT LICENSE
 *
 */
var path = require('path'),
  vows = require('vows'),
  assert = require('assert'),
  nock = require('nock'),
  helpers = require('./helpers');

var options = {},
  testContext = {},
  config = helpers.loadConfig(),
  loggly = require('../lib/loggly').createClient(config);

vows.describe('node-loggly/customer').addBatch({
  "When using the node-loggly client": {
    "the customer() method": {
      topic: function() {
        nock("https://" + config.subdomain + ".loggly.com")
          .get('/apiv2/customer')
          .reply(200, {
            "tokens": ["test", "test2"],
            "subdomain": config.subdomain,
            "subscription": {
              "key1": "value1"
            }
          });
        loggly.customer(this.callback);

      },
      "should return a valid customer": function(err, customer) {
        assert.isNull(err);
        assert.isArray(customer.tokens);
        assert.isString(customer.subdomain);
        assert.isObject(customer.subscription);
      }
    }
  }
}).export(module);
