/**
 * Module dependencies
 */
var express = require('express');
var metric = require('metric-log');
var envs = require('envs');
var debug = require('debug')('heroku-provider');
var HttpError = require('http-error').HttpError;

module.exports = function(api, options) {
  if (!api) throw new Error('No api given to heroku provider');
  if (!options) options = {};

  /**
   * Create the app
   */

  var app = express();

  /**
   * Middleware
   */

  var auth = express.basicAuth(
    options.username || envs('HEROKU_USERNAME', ''),
    options.password || envs('HEROKU_PASSWORD', ''));

  /**
   * Give the provider to the api
   */

  var provider = options.provider || 'heroku';

  /**
   * Give option to pass req to api
   */

  var passReq = !!options.passReq;

  /**
   * Configure the app
   */

  app.use(function metrics(req, res, next) {
    req._heroku_metric = (req.metric || metric).context({lib: 'heroku-provider', provider: provider});
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

    function created(err, id, config) {
      done({err: err, resource: id});
      if (err) return next(err);
      if (!id) return next(new HttpError('Resource was not created'), 500);
      config = config || {};

      req._heroku_metric.count('provision.' + resource.plan, 1, {resource: id});
      res.send({
        id: id,
        config: config
      });
    }

    var arity = api.create.length;
    if (arity === 4) return api.create(req, resource, provider, created);
    if (arity === 3 && passReq) return api.create(req, resource, created);
    if (arity === 3) return api.create(resource, provider, created);
    api.create(resource, created);
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

    function updated(err, prev, config, message) {
      done({err: err, resource: id});
      if (err) return next(err);
      if (!prev) return next(new HttpError('Not Found', 404));

      req._heroku_metric.count(['plan-change.from', prev, 'to', request.plan].join('.'), 1, {resource: id});
      res.send({
        config: config,
        message: message
      });
    }

    var arity = api.update.length;
    if (arity === 5) return api.update(req, id, request, provider, updated);
    if (arity === 4 && passReq) return api.update(req, id, request, updated);
    if (arity === 4) return api.update(id, request, provider, updated);
    api.update(id, request, updated);
  });

  // Deprovision
  app.del('/resources/:id', auth, function(req, res, next){
    debug(req.params);
    var done = req._heroku_metric.profile('provision.remove');

    var id = req.params.id;

    function removed(err, prev) {
      done({err: err, resource: id});
      if (err) return next(err);

      if (prev) req._heroku_metric.count('deprovision.' + prev, 1, {resource: id});
      res.send('ok');
    }

    var arity = api.remove.length;
    if (arity === 4) return api.remove(req, id, provider, removed);
    if (arity === 3 && passReq) return api.remove(req, id, removed);
    if (arity === 3) return api.remove(id, provider, removed);
    api.remove(id, removed);
  });

  return app;
};
