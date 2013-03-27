/**
 * Module dependencies
 */
var crypto = require("crypto")
  , debug = require("debug")("heroku-provider:sso")
  , HttpError = require("http-error").HttpError;

module.exports = function(salt) {
  return function sso(req, res, next) {
    var id = req.param('id')
      , params = req.body || req.query;
    debug(id);

    var token = crypto
                  .createHash("sha1")
                  .update([id,salt,params.timestamp].join(":"))
                  .digest("hex");

    // The token doesn't match
    if (params.token !== token) return next(new HttpError("Token mismatch", 403));

    var time = Date.now() / 1000 - 2*60;

    // The timestamp doesn't match
    if(parseInt(params.timestamp) < time) return next(new HttpError("Timestamp Expired", 403));

    res.cookie('heroku-nav-data', params['nav-data']);
    req.session.resource = id;
    req.session.email = params.email;
    req.session.provider = 'heroku';
    next();
  };
};
