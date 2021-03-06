'use strict';

var assert = require('assert');
var logger = require('../logging').logger;
var tracer = require('../logging').tracer;
var ODataService = require('./ODataService');

exports.createServices = createServices;


function createServices(rt) {
  assert(rt, 'valid runtime is required');

  var services = [];

  for (var pathname in rt.xsodata) {
    try {
      services.push(new ODataService(rt, pathname, rt.xsodata[pathname]));
      tracer.info('Registered OData handler for path: "%s"', pathname);
    } catch (err) {
      logger.error('Failed to register OData handler for "%s", error: %s', pathname, err);
    }
  }

  return services;
}
