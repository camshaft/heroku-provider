/**
 * Module dependencies
 */
var express = require('express');
var metric = require('metric-log');
var debug = require('debug')('heroku-provider');
var HttpError = require('http-error').HttpError;

module.exports = function(api, manifest) {
  if (!api) throw new Error('No api given to heroku provider');
  if (!manifest) manifest = require(process.cwd() + '/addon-manifest');

  /**
   * Create the app
   */

  var app = express();

  /**
   * Middleware
   */

  var auth = express.basicAuth(manifest.id, manifest.api.password);

  /**
   * Configure the app
   */

  app.use(function metrics(req, res, next) {
    req._heroku_metric = (req.metric || metric).context({lib: 'heroku-provider'});
    next();
  });
  app.use(app.router);
  app.use(function errorHandler(err, req, res, next) {
    console.error(err.stack || err);
    res.status(err.code || 500);
    res.send({message: err.toString()});
  });

  /**
   * Routes
   */

  // Provision
  app.post('/resources', auth, function(req, res, next){
    debug(req.body);
    var done = req._heroku_metric.profile('provision.create');

    var body = req.body;
    var resource = {
      heroku_id: body.heroku_id,
      plan: body.plan,
      callback_url: body.callback_url,
      logplex_token: body.logplex_token,
      options: body.options
    };

    api.create(resource, function(err, id, config) {
      done({err: err, resource: id});
      if (err) return next(err);
      if (!id) return next(new HttpError('Resource was not created'), 500);
      config = config || {};

      req._heroku_metric.count('provision.' + resource.plan, 1, {resource: id});
      res.send({
        id: id,
        config: config
      });
    });
  });

  // Plan change
  app.put('/resources/:id', auth, function(req, res, next){
    debug(req.params, req.body);
    var done = req._heroku_metric.profile('provision.update');

    var id = req.params.id;
    var request = {
      plan: req.body.plan,
      heroku_id: req.body.heroku_id
    };

    api.update(id, request, function(err, prev, config, message) {
      done({err: err, resource: id});
      if (err) return next(err);
      if (!prev) return next(new HttpError('Not Found', 404));

      req._heroku_metric.count(['plan-change.from', prev, 'to', request.plan].join('.'), 1, {resource: id});
      res.send({
        config: config,
        message: message
      });
    });
  });

  // Deprovision
  app.del('/resources/:id', auth, function(req, res, next){
    debug(req.params);
    var done = req._heroku_metric.profile('provision.remove');

    var id = req.params.id;

    api.remove(id, function(err, prev) {
      done({err: err, resource: id});
      if (err) return next(err);

      if (prev) req._heroku_metric.count('deprovision.' + prev, 1, {resource: id});
      res.send('ok');
    });
  });

  return app;
};
