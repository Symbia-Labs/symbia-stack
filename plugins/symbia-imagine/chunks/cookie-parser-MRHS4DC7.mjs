import { createRequire as __symbiaCreateRequire } from "node:module";globalThis.require ??= __symbiaCreateRequire(import.meta.url);
import {
  require_cookie
} from "./chunk-SG5E4KLZ.mjs";
import {
  __commonJS,
  __require
} from "./chunk-JCYRGLK6.mjs";

// build/plugin/symbia-imagine/node_modules/cookie-signature/index.js
var require_cookie_signature = __commonJS({
  "build/plugin/symbia-imagine/node_modules/cookie-signature/index.js"(exports) {
    var crypto = __require("crypto");
    exports.sign = function(val, secret) {
      if ("string" != typeof val) throw new TypeError("Cookie value must be provided as a string.");
      if ("string" != typeof secret) throw new TypeError("Secret string must be provided.");
      return val + "." + crypto.createHmac("sha256", secret).update(val).digest("base64").replace(/\=+$/, "");
    };
    exports.unsign = function(val, secret) {
      if ("string" != typeof val) throw new TypeError("Signed cookie string must be provided.");
      if ("string" != typeof secret) throw new TypeError("Secret string must be provided.");
      var str = val.slice(0, val.lastIndexOf(".")), mac = exports.sign(str, secret);
      return sha1(mac) == sha1(val) ? str : false;
    };
    function sha1(str) {
      return crypto.createHash("sha1").update(str).digest("hex");
    }
  }
});

// build/plugin/symbia-imagine/node_modules/cookie-parser/index.js
var require_cookie_parser = __commonJS({
  "build/plugin/symbia-imagine/node_modules/cookie-parser/index.js"(exports, module) {
    var cookie = require_cookie();
    var signature = require_cookie_signature();
    module.exports = cookieParser;
    module.exports.JSONCookie = JSONCookie;
    module.exports.JSONCookies = JSONCookies;
    module.exports.signedCookie = signedCookie;
    module.exports.signedCookies = signedCookies;
    function cookieParser(secret, options) {
      var secrets = !secret || Array.isArray(secret) ? secret || [] : [secret];
      return function cookieParser2(req, res, next) {
        if (req.cookies) {
          return next();
        }
        var cookies = req.headers.cookie;
        req.secret = secrets[0];
        req.cookies = /* @__PURE__ */ Object.create(null);
        req.signedCookies = /* @__PURE__ */ Object.create(null);
        if (!cookies) {
          return next();
        }
        req.cookies = cookie.parse(cookies, options);
        if (secrets.length !== 0) {
          req.signedCookies = signedCookies(req.cookies, secrets);
          req.signedCookies = JSONCookies(req.signedCookies);
        }
        req.cookies = JSONCookies(req.cookies);
        next();
      };
    }
    function JSONCookie(str) {
      if (typeof str !== "string" || str.substr(0, 2) !== "j:") {
        return void 0;
      }
      try {
        return JSON.parse(str.slice(2));
      } catch (err) {
        return void 0;
      }
    }
    function JSONCookies(obj) {
      var cookies = Object.keys(obj);
      var key;
      var val;
      for (var i = 0; i < cookies.length; i++) {
        key = cookies[i];
        val = JSONCookie(obj[key]);
        if (val) {
          obj[key] = val;
        }
      }
      return obj;
    }
    function signedCookie(str, secret) {
      if (typeof str !== "string") {
        return void 0;
      }
      if (str.substr(0, 2) !== "s:") {
        return str;
      }
      var secrets = !secret || Array.isArray(secret) ? secret || [] : [secret];
      for (var i = 0; i < secrets.length; i++) {
        var val = signature.unsign(str.slice(2), secrets[i]);
        if (val !== false) {
          return val;
        }
      }
      return false;
    }
    function signedCookies(obj, secret) {
      var cookies = Object.keys(obj);
      var dec;
      var key;
      var ret = /* @__PURE__ */ Object.create(null);
      var val;
      for (var i = 0; i < cookies.length; i++) {
        key = cookies[i];
        val = obj[key];
        dec = signedCookie(val, secret);
        if (val !== dec) {
          ret[key] = dec;
          delete obj[key];
        }
      }
      return ret;
    }
  }
});
export default require_cookie_parser();
