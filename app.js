/**
 * Module dependencies
 */
var express = require("express")
  , debug = require("debug")("heroku-provider")
  , HttpError = require("http-error").HttpError;

/**
 * Dummy metrics
 */
function metrics () {}
metrics.profile = function() {};
metrics.context = function() {return metrics};

module.exports = function(api, options) {

  /**
   * Create the app
   */
  var app = express();

  /**
   * Middleware
   */
  var auth = express.basicAuth(options.username, options.password)
    , sso = require("./sso")(options.salt);

  /**
   * Configure the app
   */
  app.configure(function() {
    app.use(function dummyMetrics(req, res, next) {
      req.metric = req.metric || metrics;
      req._heroku_metric = req.metric.context({at: "provider", lib: "heroku-provider"});
      next();
    });
    app.use(app.router);
    app.use(function errorHandler(err, req, res, next) {
      console.error(err);
      res.status(err.code || 500);
      res.send(err.toString());
    });
  });

  /**
   * Routes
   */
  // Provision
  app.post("/resources", auth, function(req, res, next){
    debug(req.body);
    req._heroku_metric.profile("provision-response-time");

    api.add(req.body, function(err, resource) {
      req._heroku_metric.profile("provision-response-time", {err: err, fn:'add'});
      if(err) return next(err);

      req._heroku_metric("provision", 1, "instance", {plan: resource.plan});
      res.send(resource);
    });
  });

  // Plan change
  app.put("/resources/:id", auth, function(req, res, next){
    debug(req.params, req.body);
    req._heroku_metric.profile("provision-response-time");

    api.update(req.params.id, req.body, function(err, resource, prev) {
      req._heroku_metric.profile("provision-response-time", {err:err, fn:'update'});
      if(err) return next(err);
      if(!resource) return next(new HttpError("Not Found", 404));

      req._heroku_metric("plan-change", 1, 'resource', {plan: resource.plan, 'prev-plan': prev.plan});
      res.send("ok");
    });
  });

  // Deprovision
  app.del("/resources/:id", auth, function(req, res, next){
    debug(req.params);
    req._heroku_metric.profile("provision-response-time");

    api.remove(req.params.id, function(err, resource) {
      req._heroku_metric.profile("provision-response-time", {err:err, fn:'remove'});
      if(err) return next(err);
      if(!resource) return next(new HttpError("Not Found", 404));

      req._heroku_metric("deprovision", 1, "instance", {plan: resource.plan});
      res.send("ok");
    });
  });

  app.get("/resources/:id", sso, function(req, res) {
    res.redirect(req.base || "/");
  });

  app.post("/login", sso, function(req, res) {
    res.redirect(req.base || "/");
  });

  return app;
};
