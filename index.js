// Generated by CoffeeScript 1.6.3
/*
Redis Tagging

The MIT License (MIT)

Copyright © 2013 Patrick Liess, http://www.tcs.de

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/


(function() {
  var RedisInst, RedisTagging, _,
    __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

  RedisInst = require("redis");

  _ = require("underscore");

  RedisTagging = (function() {
    function RedisTagging(options) {
      var host, port;
      if (options == null) {
        options = {};
      }
      this._initErrors = __bind(this._initErrors, this);
      this._handleError = __bind(this._handleError, this);
      this._deleteID = __bind(this._deleteID, this);
      this.removebucket = __bind(this.removebucket, this);
      this.buckets = __bind(this.buckets, this);
      this.toptags = __bind(this.toptags, this);
      this.tags = __bind(this.tags, this);
      this.allids = __bind(this.allids, this);
      this.remove = __bind(this.remove, this);
      this.set = __bind(this.set, this);
      this.get = __bind(this.get, this);
      this.redisns = (options.nsprefix || "rt") + ":";
      port = options.port || 6379;
      host = options.host || "127.0.0.1";
      this.redis = RedisInst.createClient(port, host);
      this._initErrors();
    }

    RedisTagging.prototype.get = function(options, cb) {
      var ns,
        _this = this;
      if (this._validate(options, ["bucket", "id"], cb) === false) {
        return;
      }
      ns = this.redisns + options.bucket;
      this.redis.smembers("" + ns + ":ID:" + options.id, function(err, resp) {
        var tag, tags;
        if (err) {
          _this._handleError(cb, err);
          return;
        }
        tags = (function() {
          var _i, _len, _results;
          _results = [];
          for (_i = 0, _len = resp.length; _i < _len; _i++) {
            tag = resp[_i];
            _results.push(tag);
          }
          return _results;
        })();
        cb(null, tags);
      });
    };

    RedisTagging.prototype.set = function(options, cb) {
      var id_index, ns,
        _this = this;
      if (this._validate(options, ["bucket", "id", "score", "tags"], cb) === false) {
        return;
      }
      ns = this.redisns + options.bucket;
      id_index = ns + ':ID:' + options.id;
      this._deleteID(ns, options.id, function(mc) {
        var tag, _i, _len, _ref;
        _ref = options.tags;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          tag = _ref[_i];
          mc.push(['zincrby', ns + ':TAGCOUNT', 1, tag]);
          mc.push(['sadd', id_index, tag]);
          mc.push(['zadd', ns + ':TAGS:' + tag, options.score, options.id]);
        }
        if (options.tags.length) {
          mc.push(['sadd', ns + ':IDS', options.id]);
        }
        _this.redis.multi(mc).exec(function(err, resp) {
          if (err) {
            _this._handleError(cb, err);
            return;
          }
          cb(null, true);
        });
      });
    };

    RedisTagging.prototype.remove = function(options, cb) {
      options.tags = [];
      this.set(options, cb);
    };

    RedisTagging.prototype.allids = function(options, cb) {
      var ns,
        _this = this;
      if (this._validate(options, ["bucket"], cb) === false) {
        return;
      }
      ns = this.redisns + options.bucket;
      this.redis.smembers(ns + ":IDS", function(err, resp) {
        if (err) {
          _this._handleError(cb, err);
          return;
        }
        cb(null, resp);
      });
    };

    RedisTagging.prototype.tags = function(options, cb) {
      var lastelement, mc, ns, prefix, resultkey, rndkey, tag, tagsresult, _keys,
        _this = this;
      if (this._validate(options, ["bucket", "tags", "offset", "limit", "withscores", "type", "order"], cb) === false) {
        return;
      }
      ns = this.redisns + options.bucket;
      prefix = ns + ':TAGS:';
      lastelement = options.offset + options.limit - 1;
      mc = [];
      if (options.tags.length === 0) {
        cb(null, {
          total_items: 0,
          items: [],
          limit: options.limit,
          offset: options.offset
        });
        return;
      }
      if (options.tags.length > 1) {
        rndkey = ns + (new Date().getTime()) + '_' + Math.floor(Math.random() * 9999999999);
        _keys = (function() {
          var _i, _len, _ref, _results;
          _ref = options.tags;
          _results = [];
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            tag = _ref[_i];
            _results.push(prefix + tag);
          }
          return _results;
        })();
        mc.push(['z' + options.type + 'store', rndkey, _keys.length].concat(_keys).concat(['AGGREGATE', 'MIN']));
        if (options.limit > 0) {
          resultkey = rndkey;
        }
      } else if (options.tags.length === 1) {
        mc.push(['zcard', prefix + options.tags[0]]);
        if (options.limit > 0) {
          resultkey = prefix + options.tags[0];
        }
      }
      if (options.limit > 0) {
        tagsresult = ['z' + options.order + 'range', resultkey, options.offset, lastelement];
        if (options.withscores) {
          tagsresult = tagsresult.concat(['WITHSCORES']);
        }
        mc.push(tagsresult);
      }
      if (options.tags.length > 1) {
        mc.push(['del', rndkey]);
      }
      this.redis.multi(mc).exec(function(err, resp) {
        var e, i, rows;
        if (err) {
          _this._handleError(cb, err);
          return;
        }
        if (options.limit === 0) {
          rows = [];
        } else {
          rows = resp[1];
        }
        if (rows.length && options.withscores) {
          rows = (function() {
            var _i, _len, _results;
            _results = [];
            for (i = _i = 0, _len = rows.length; _i < _len; i = _i += 2) {
              e = rows[i];
              _results.push({
                id: e,
                score: rows[i + 1]
              });
            }
            return _results;
          })();
        }
        cb(null, {
          total_items: resp[0],
          items: rows,
          limit: options.limit,
          offset: options.offset
        });
      });
    };

    RedisTagging.prototype.toptags = function(options, cb) {
      var mc, ns, rediskey,
        _this = this;
      if (this._validate(options, ["bucket", "amount"], cb) === false) {
        return;
      }
      ns = this.redisns + options.bucket;
      options.amount = options.amount - 1;
      rediskey = ns + ':TAGCOUNT';
      mc = [["zcard", rediskey], ["zrevrange", rediskey, 0, options.amount, "WITHSCORES"]];
      this.redis.multi(mc).exec(function(err, resp) {
        var e, i, rows;
        if (err) {
          _this._handleError(cb, err);
          return;
        }
        rows = (function() {
          var _i, _len, _ref, _results;
          _ref = resp[1];
          _results = [];
          for (i = _i = 0, _len = _ref.length; _i < _len; i = _i += 2) {
            e = _ref[i];
            _results.push({
              tag: e,
              count: Number(resp[1][i + 1])
            });
          }
          return _results;
        })();
        cb(null, {
          total_items: resp[0],
          items: rows
        });
      });
    };

    RedisTagging.prototype.buckets = function(cb) {
      var _this = this;
      this.redis.keys(this.redisns + "*" + ":TAGCOUNT", function(err, resp) {
        var e, o;
        if (err) {
          _this._handleError(cb, err);
          return;
        }
        o = (function() {
          var _i, _len, _results;
          _results = [];
          for (_i = 0, _len = resp.length; _i < _len; _i++) {
            e = resp[_i];
            _results.push(e.substr(this.redisns.length, e.length - this.redisns.length - ":TAGCOUNT".length));
          }
          return _results;
        }).call(_this);
        cb(null, o);
      });
    };

    RedisTagging.prototype.removebucket = function(options, cb) {
      var mc, ns,
        _this = this;
      if (this._validate(options, ["bucket"], cb) === false) {
        return;
      }
      ns = this.redisns + options.bucket;
      mc = [["smembers", ns + ":IDS"], ["zrange", ns + ":TAGCOUNT", 0, -1]];
      this.redis.multi(mc).exec(function(err, resp) {
        var e, rkeys, _i, _j, _len, _len1, _ref, _ref1;
        if (err) {
          _this._handleError(cb, err);
          return;
        }
        rkeys = [ns + ":IDS", ns + ":TAGCOUNT"];
        _ref = resp[0];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          e = _ref[_i];
          rkeys.push(ns + ":ID:" + e);
        }
        _ref1 = resp[1];
        for (_j = 0, _len1 = _ref1.length; _j < _len1; _j++) {
          e = _ref1[_j];
          rkeys.push(ns + ":TAGS:" + e);
        }
        _this.redis.del(rkeys, function(err, resp) {
          cb(null, true);
        });
      });
    };

    RedisTagging.prototype._deleteID = function(ns, id, cb) {
      var id_index, mc,
        _this = this;
      mc = [];
      id_index = ns + ':ID:' + id;
      this.redis.smembers(id_index, function(err, resp) {
        var tag, _i, _len;
        if (resp.length) {
          for (_i = 0, _len = resp.length; _i < _len; _i++) {
            tag = resp[_i];
            mc.push(['zincrby', ns + ':TAGCOUNT', -1, tag]);
            mc.push(['zrem', ns + ':TAGS:' + tag, id]);
          }
          mc.push(['del', id_index]);
          mc.push(['srem', ns + ':IDS', id]);
          mc.push(['zremrangebyscore', ns + ':TAGCOUNT', 0, 0]);
        }
        cb(mc);
      });
    };

    RedisTagging.prototype._handleError = function(cb, err, data) {
      var _err, _ref;
      if (data == null) {
        data = {};
      }
      if (_.isString(err)) {
        _err = new Error();
        _err.name = err;
        _err.message = ((_ref = this._ERRORS) != null ? typeof _ref[err] === "function" ? _ref[err](data) : void 0 : void 0) || "unkown";
      } else {
        _err = err;
      }
      cb(_err);
    };

    RedisTagging.prototype._initErrors = function() {
      var key, msg, _ref;
      this._ERRORS = {};
      _ref = this.ERRORS;
      for (key in _ref) {
        msg = _ref[key];
        this._ERRORS[key] = _.template(msg);
      }
    };

    RedisTagging.prototype._VALID = {
      bucket: /^([a-zA-Z0-9_-]){1,80}$/
    };

    RedisTagging.prototype._validate = function(o, items, cb) {
      var item, _i, _len;
      for (_i = 0, _len = items.length; _i < _len; _i++) {
        item = items[_i];
        switch (item) {
          case "bucket":
          case "id":
          case "tags":
            if (!o[item]) {
              this._handleError(cb, "missingParameter", {
                item: item
              });
              return false;
            }
            break;
          case "score":
            o[item] = parseInt(o[item] || 0, 10);
            break;
          case "limit":
            o[item] = Math.abs(parseInt(o[item] || 100, 10));
            break;
          case "offset":
          case "withscores":
          case "amount":
            o[item] = Math.abs(parseInt(o[item] || 0, 10));
            break;
          case "order":
            o[item] = o[item] === "asc" ? "" : "rev";
            break;
          case "type":
            if (o[item] && o[item].toLowerCase() === "union") {
              o[item] = "union";
            } else {
              o[item] = "inter";
            }
        }
        switch (item) {
          case "bucket":
            o[item] = o[item].toString();
            if (!this._VALID[item].test(o[item])) {
              this._handleError(cb, "invalidFormat", {
                item: item
              });
              return false;
            }
            break;
          case "id":
            o[item] = o[item].toString();
            if (!o[item].length) {
              this._handleError(cb, "missingParameter", {
                item: item
              });
              return false;
            }
            break;
          case "score":
          case "limit":
          case "offset":
          case "withscores":
          case "amount":
            if (_.isNaN(o[item])) {
              this._handleError(cb, "invalidFormat", {
                item: item
              });
              return false;
            }
            break;
          case "tags":
            if (!_.isArray(o[item])) {
              this._handleError(cb, "invalidFormat", {
                item: item
              });
              return false;
            }
        }
      }
      return o;
    };

    RedisTagging.prototype.ERRORS = {
      "missingParameter": "No <%= item %> supplied",
      "invalidFormat": "Invalid <%= item %> format"
    };

    return RedisTagging;

  })();

  module.exports = RedisTagging;

}).call(this);
