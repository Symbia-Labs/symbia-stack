import { createRequire as __symbiaCreateRequire } from "node:module";globalThis.require ??= __symbiaCreateRequire(import.meta.url);
import "../chunks/chunk-KBV6ZZYE.mjs";
import "../chunks/chunk-P45NL53C.mjs";
import "../chunks/chunk-QBVP4NZ7.mjs";
import "../chunks/chunk-ZEHBX6Z6.mjs";
import {
  DEFAULT_ORG_IDS,
  DEFAULT_USER_IDS
} from "../chunks/chunk-SYI65BHD.mjs";
import {
  decryptSecret,
  encryptSecret,
  nodeCredentialCrypto
} from "../chunks/chunk-2JVNKTJS.mjs";
import {
  require_ms
} from "../chunks/chunk-MXWCS3YP.mjs";
import {
  createInsertSchema
} from "../chunks/chunk-6PY65LKM.mjs";
import {
  external_exports
} from "../chunks/chunk-TCCFD4DK.mjs";
import {
  and,
  boolean,
  eq,
  inArray,
  index,
  initializeDatabase,
  integer,
  isNull,
  json,
  like,
  or,
  pgTable,
  relations,
  runWithRLSContext,
  sql,
  text,
  timestamp,
  uniqueIndex,
  varchar
} from "../chunks/chunk-DSXICZVV.mjs";
import "../chunks/chunk-572SKMOA.mjs";
import {
  __commonJS,
  __require,
  __toESM
} from "../chunks/chunk-JCYRGLK6.mjs";

// build/plugin/symbia-imagine/node_modules/bcryptjs/dist/bcrypt.js
var require_bcrypt = __commonJS({
  "build/plugin/symbia-imagine/node_modules/bcryptjs/dist/bcrypt.js"(exports, module) {
    (function(global, factory) {
      if (typeof define === "function" && define["amd"])
        define([], factory);
      else if (typeof __require === "function" && typeof module === "object" && module && module["exports"])
        module["exports"] = factory();
      else
        (global["dcodeIO"] = global["dcodeIO"] || {})["bcrypt"] = factory();
    })(exports, function() {
      "use strict";
      var bcrypt3 = {};
      var randomFallback = null;
      function random(len) {
        if (typeof module !== "undefined" && module && module["exports"])
          try {
            return __require("crypto")["randomBytes"](len);
          } catch (e) {
          }
        try {
          var a;
          (self["crypto"] || self["msCrypto"])["getRandomValues"](a = new Uint32Array(len));
          return Array.prototype.slice.call(a);
        } catch (e) {
        }
        if (!randomFallback)
          throw Error("Neither WebCryptoAPI nor a crypto module is available. Use bcrypt.setRandomFallback to set an alternative");
        return randomFallback(len);
      }
      var randomAvailable = false;
      try {
        random(1);
        randomAvailable = true;
      } catch (e) {
      }
      randomFallback = null;
      bcrypt3.setRandomFallback = function(random2) {
        randomFallback = random2;
      };
      bcrypt3.genSaltSync = function(rounds, seed_length) {
        rounds = rounds || GENSALT_DEFAULT_LOG2_ROUNDS;
        if (typeof rounds !== "number")
          throw Error("Illegal arguments: " + typeof rounds + ", " + typeof seed_length);
        if (rounds < 4)
          rounds = 4;
        else if (rounds > 31)
          rounds = 31;
        var salt = [];
        salt.push("$2a$");
        if (rounds < 10)
          salt.push("0");
        salt.push(rounds.toString());
        salt.push("$");
        salt.push(base64_encode(random(BCRYPT_SALT_LEN), BCRYPT_SALT_LEN));
        return salt.join("");
      };
      bcrypt3.genSalt = function(rounds, seed_length, callback) {
        if (typeof seed_length === "function")
          callback = seed_length, seed_length = void 0;
        if (typeof rounds === "function")
          callback = rounds, rounds = void 0;
        if (typeof rounds === "undefined")
          rounds = GENSALT_DEFAULT_LOG2_ROUNDS;
        else if (typeof rounds !== "number")
          throw Error("illegal arguments: " + typeof rounds);
        function _async(callback2) {
          nextTick(function() {
            try {
              callback2(null, bcrypt3.genSaltSync(rounds));
            } catch (err) {
              callback2(err);
            }
          });
        }
        if (callback) {
          if (typeof callback !== "function")
            throw Error("Illegal callback: " + typeof callback);
          _async(callback);
        } else
          return new Promise(function(resolve, reject) {
            _async(function(err, res) {
              if (err) {
                reject(err);
                return;
              }
              resolve(res);
            });
          });
      };
      bcrypt3.hashSync = function(s, salt) {
        if (typeof salt === "undefined")
          salt = GENSALT_DEFAULT_LOG2_ROUNDS;
        if (typeof salt === "number")
          salt = bcrypt3.genSaltSync(salt);
        if (typeof s !== "string" || typeof salt !== "string")
          throw Error("Illegal arguments: " + typeof s + ", " + typeof salt);
        return _hash(s, salt);
      };
      bcrypt3.hash = function(s, salt, callback, progressCallback) {
        function _async(callback2) {
          if (typeof s === "string" && typeof salt === "number")
            bcrypt3.genSalt(salt, function(err, salt2) {
              _hash(s, salt2, callback2, progressCallback);
            });
          else if (typeof s === "string" && typeof salt === "string")
            _hash(s, salt, callback2, progressCallback);
          else
            nextTick(callback2.bind(this, Error("Illegal arguments: " + typeof s + ", " + typeof salt)));
        }
        if (callback) {
          if (typeof callback !== "function")
            throw Error("Illegal callback: " + typeof callback);
          _async(callback);
        } else
          return new Promise(function(resolve, reject) {
            _async(function(err, res) {
              if (err) {
                reject(err);
                return;
              }
              resolve(res);
            });
          });
      };
      function safeStringCompare(known, unknown) {
        var right = 0, wrong = 0;
        for (var i = 0, k = known.length; i < k; ++i) {
          if (known.charCodeAt(i) === unknown.charCodeAt(i))
            ++right;
          else
            ++wrong;
        }
        if (right < 0)
          return false;
        return wrong === 0;
      }
      bcrypt3.compareSync = function(s, hash) {
        if (typeof s !== "string" || typeof hash !== "string")
          throw Error("Illegal arguments: " + typeof s + ", " + typeof hash);
        if (hash.length !== 60)
          return false;
        return safeStringCompare(bcrypt3.hashSync(s, hash.substr(0, hash.length - 31)), hash);
      };
      bcrypt3.compare = function(s, hash, callback, progressCallback) {
        function _async(callback2) {
          if (typeof s !== "string" || typeof hash !== "string") {
            nextTick(callback2.bind(this, Error("Illegal arguments: " + typeof s + ", " + typeof hash)));
            return;
          }
          if (hash.length !== 60) {
            nextTick(callback2.bind(this, null, false));
            return;
          }
          bcrypt3.hash(s, hash.substr(0, 29), function(err, comp) {
            if (err)
              callback2(err);
            else
              callback2(null, safeStringCompare(comp, hash));
          }, progressCallback);
        }
        if (callback) {
          if (typeof callback !== "function")
            throw Error("Illegal callback: " + typeof callback);
          _async(callback);
        } else
          return new Promise(function(resolve, reject) {
            _async(function(err, res) {
              if (err) {
                reject(err);
                return;
              }
              resolve(res);
            });
          });
      };
      bcrypt3.getRounds = function(hash) {
        if (typeof hash !== "string")
          throw Error("Illegal arguments: " + typeof hash);
        return parseInt(hash.split("$")[2], 10);
      };
      bcrypt3.getSalt = function(hash) {
        if (typeof hash !== "string")
          throw Error("Illegal arguments: " + typeof hash);
        if (hash.length !== 60)
          throw Error("Illegal hash length: " + hash.length + " != 60");
        return hash.substring(0, 29);
      };
      var nextTick = typeof process !== "undefined" && process && typeof process.nextTick === "function" ? typeof setImmediate === "function" ? setImmediate : process.nextTick : setTimeout;
      function stringToBytes(str) {
        var out = [], i = 0;
        utfx.encodeUTF16toUTF8(function() {
          if (i >= str.length) return null;
          return str.charCodeAt(i++);
        }, function(b) {
          out.push(b);
        });
        return out;
      }
      var BASE64_CODE = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split("");
      var BASE64_INDEX = [
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        0,
        1,
        54,
        55,
        56,
        57,
        58,
        59,
        60,
        61,
        62,
        63,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        19,
        20,
        21,
        22,
        23,
        24,
        25,
        26,
        27,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        28,
        29,
        30,
        31,
        32,
        33,
        34,
        35,
        36,
        37,
        38,
        39,
        40,
        41,
        42,
        43,
        44,
        45,
        46,
        47,
        48,
        49,
        50,
        51,
        52,
        53,
        -1,
        -1,
        -1,
        -1,
        -1
      ];
      var stringFromCharCode = String.fromCharCode;
      function base64_encode(b, len) {
        var off = 0, rs = [], c1, c2;
        if (len <= 0 || len > b.length)
          throw Error("Illegal len: " + len);
        while (off < len) {
          c1 = b[off++] & 255;
          rs.push(BASE64_CODE[c1 >> 2 & 63]);
          c1 = (c1 & 3) << 4;
          if (off >= len) {
            rs.push(BASE64_CODE[c1 & 63]);
            break;
          }
          c2 = b[off++] & 255;
          c1 |= c2 >> 4 & 15;
          rs.push(BASE64_CODE[c1 & 63]);
          c1 = (c2 & 15) << 2;
          if (off >= len) {
            rs.push(BASE64_CODE[c1 & 63]);
            break;
          }
          c2 = b[off++] & 255;
          c1 |= c2 >> 6 & 3;
          rs.push(BASE64_CODE[c1 & 63]);
          rs.push(BASE64_CODE[c2 & 63]);
        }
        return rs.join("");
      }
      function base64_decode(s, len) {
        var off = 0, slen = s.length, olen = 0, rs = [], c1, c2, c3, c4, o, code;
        if (len <= 0)
          throw Error("Illegal len: " + len);
        while (off < slen - 1 && olen < len) {
          code = s.charCodeAt(off++);
          c1 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
          code = s.charCodeAt(off++);
          c2 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
          if (c1 == -1 || c2 == -1)
            break;
          o = c1 << 2 >>> 0;
          o |= (c2 & 48) >> 4;
          rs.push(stringFromCharCode(o));
          if (++olen >= len || off >= slen)
            break;
          code = s.charCodeAt(off++);
          c3 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
          if (c3 == -1)
            break;
          o = (c2 & 15) << 4 >>> 0;
          o |= (c3 & 60) >> 2;
          rs.push(stringFromCharCode(o));
          if (++olen >= len || off >= slen)
            break;
          code = s.charCodeAt(off++);
          c4 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
          o = (c3 & 3) << 6 >>> 0;
          o |= c4;
          rs.push(stringFromCharCode(o));
          ++olen;
        }
        var res = [];
        for (off = 0; off < olen; off++)
          res.push(rs[off].charCodeAt(0));
        return res;
      }
      var utfx = (function() {
        "use strict";
        var utfx2 = {};
        utfx2.MAX_CODEPOINT = 1114111;
        utfx2.encodeUTF8 = function(src, dst) {
          var cp = null;
          if (typeof src === "number")
            cp = src, src = function() {
              return null;
            };
          while (cp !== null || (cp = src()) !== null) {
            if (cp < 128)
              dst(cp & 127);
            else if (cp < 2048)
              dst(cp >> 6 & 31 | 192), dst(cp & 63 | 128);
            else if (cp < 65536)
              dst(cp >> 12 & 15 | 224), dst(cp >> 6 & 63 | 128), dst(cp & 63 | 128);
            else
              dst(cp >> 18 & 7 | 240), dst(cp >> 12 & 63 | 128), dst(cp >> 6 & 63 | 128), dst(cp & 63 | 128);
            cp = null;
          }
        };
        utfx2.decodeUTF8 = function(src, dst) {
          var a, b, c, d, fail = function(b2) {
            b2 = b2.slice(0, b2.indexOf(null));
            var err = Error(b2.toString());
            err.name = "TruncatedError";
            err["bytes"] = b2;
            throw err;
          };
          while ((a = src()) !== null) {
            if ((a & 128) === 0)
              dst(a);
            else if ((a & 224) === 192)
              (b = src()) === null && fail([a, b]), dst((a & 31) << 6 | b & 63);
            else if ((a & 240) === 224)
              ((b = src()) === null || (c = src()) === null) && fail([a, b, c]), dst((a & 15) << 12 | (b & 63) << 6 | c & 63);
            else if ((a & 248) === 240)
              ((b = src()) === null || (c = src()) === null || (d = src()) === null) && fail([a, b, c, d]), dst((a & 7) << 18 | (b & 63) << 12 | (c & 63) << 6 | d & 63);
            else throw RangeError("Illegal starting byte: " + a);
          }
        };
        utfx2.UTF16toUTF8 = function(src, dst) {
          var c1, c2 = null;
          while (true) {
            if ((c1 = c2 !== null ? c2 : src()) === null)
              break;
            if (c1 >= 55296 && c1 <= 57343) {
              if ((c2 = src()) !== null) {
                if (c2 >= 56320 && c2 <= 57343) {
                  dst((c1 - 55296) * 1024 + c2 - 56320 + 65536);
                  c2 = null;
                  continue;
                }
              }
            }
            dst(c1);
          }
          if (c2 !== null) dst(c2);
        };
        utfx2.UTF8toUTF16 = function(src, dst) {
          var cp = null;
          if (typeof src === "number")
            cp = src, src = function() {
              return null;
            };
          while (cp !== null || (cp = src()) !== null) {
            if (cp <= 65535)
              dst(cp);
            else
              cp -= 65536, dst((cp >> 10) + 55296), dst(cp % 1024 + 56320);
            cp = null;
          }
        };
        utfx2.encodeUTF16toUTF8 = function(src, dst) {
          utfx2.UTF16toUTF8(src, function(cp) {
            utfx2.encodeUTF8(cp, dst);
          });
        };
        utfx2.decodeUTF8toUTF16 = function(src, dst) {
          utfx2.decodeUTF8(src, function(cp) {
            utfx2.UTF8toUTF16(cp, dst);
          });
        };
        utfx2.calculateCodePoint = function(cp) {
          return cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4;
        };
        utfx2.calculateUTF8 = function(src) {
          var cp, l = 0;
          while ((cp = src()) !== null)
            l += utfx2.calculateCodePoint(cp);
          return l;
        };
        utfx2.calculateUTF16asUTF8 = function(src) {
          var n = 0, l = 0;
          utfx2.UTF16toUTF8(src, function(cp) {
            ++n;
            l += utfx2.calculateCodePoint(cp);
          });
          return [n, l];
        };
        return utfx2;
      })();
      Date.now = Date.now || function() {
        return +/* @__PURE__ */ new Date();
      };
      var BCRYPT_SALT_LEN = 16;
      var GENSALT_DEFAULT_LOG2_ROUNDS = 10;
      var BLOWFISH_NUM_ROUNDS = 16;
      var MAX_EXECUTION_TIME = 100;
      var P_ORIG = [
        608135816,
        2242054355,
        320440878,
        57701188,
        2752067618,
        698298832,
        137296536,
        3964562569,
        1160258022,
        953160567,
        3193202383,
        887688300,
        3232508343,
        3380367581,
        1065670069,
        3041331479,
        2450970073,
        2306472731
      ];
      var S_ORIG = [
        3509652390,
        2564797868,
        805139163,
        3491422135,
        3101798381,
        1780907670,
        3128725573,
        4046225305,
        614570311,
        3012652279,
        134345442,
        2240740374,
        1667834072,
        1901547113,
        2757295779,
        4103290238,
        227898511,
        1921955416,
        1904987480,
        2182433518,
        2069144605,
        3260701109,
        2620446009,
        720527379,
        3318853667,
        677414384,
        3393288472,
        3101374703,
        2390351024,
        1614419982,
        1822297739,
        2954791486,
        3608508353,
        3174124327,
        2024746970,
        1432378464,
        3864339955,
        2857741204,
        1464375394,
        1676153920,
        1439316330,
        715854006,
        3033291828,
        289532110,
        2706671279,
        2087905683,
        3018724369,
        1668267050,
        732546397,
        1947742710,
        3462151702,
        2609353502,
        2950085171,
        1814351708,
        2050118529,
        680887927,
        999245976,
        1800124847,
        3300911131,
        1713906067,
        1641548236,
        4213287313,
        1216130144,
        1575780402,
        4018429277,
        3917837745,
        3693486850,
        3949271944,
        596196993,
        3549867205,
        258830323,
        2213823033,
        772490370,
        2760122372,
        1774776394,
        2652871518,
        566650946,
        4142492826,
        1728879713,
        2882767088,
        1783734482,
        3629395816,
        2517608232,
        2874225571,
        1861159788,
        326777828,
        3124490320,
        2130389656,
        2716951837,
        967770486,
        1724537150,
        2185432712,
        2364442137,
        1164943284,
        2105845187,
        998989502,
        3765401048,
        2244026483,
        1075463327,
        1455516326,
        1322494562,
        910128902,
        469688178,
        1117454909,
        936433444,
        3490320968,
        3675253459,
        1240580251,
        122909385,
        2157517691,
        634681816,
        4142456567,
        3825094682,
        3061402683,
        2540495037,
        79693498,
        3249098678,
        1084186820,
        1583128258,
        426386531,
        1761308591,
        1047286709,
        322548459,
        995290223,
        1845252383,
        2603652396,
        3431023940,
        2942221577,
        3202600964,
        3727903485,
        1712269319,
        422464435,
        3234572375,
        1170764815,
        3523960633,
        3117677531,
        1434042557,
        442511882,
        3600875718,
        1076654713,
        1738483198,
        4213154764,
        2393238008,
        3677496056,
        1014306527,
        4251020053,
        793779912,
        2902807211,
        842905082,
        4246964064,
        1395751752,
        1040244610,
        2656851899,
        3396308128,
        445077038,
        3742853595,
        3577915638,
        679411651,
        2892444358,
        2354009459,
        1767581616,
        3150600392,
        3791627101,
        3102740896,
        284835224,
        4246832056,
        1258075500,
        768725851,
        2589189241,
        3069724005,
        3532540348,
        1274779536,
        3789419226,
        2764799539,
        1660621633,
        3471099624,
        4011903706,
        913787905,
        3497959166,
        737222580,
        2514213453,
        2928710040,
        3937242737,
        1804850592,
        3499020752,
        2949064160,
        2386320175,
        2390070455,
        2415321851,
        4061277028,
        2290661394,
        2416832540,
        1336762016,
        1754252060,
        3520065937,
        3014181293,
        791618072,
        3188594551,
        3933548030,
        2332172193,
        3852520463,
        3043980520,
        413987798,
        3465142937,
        3030929376,
        4245938359,
        2093235073,
        3534596313,
        375366246,
        2157278981,
        2479649556,
        555357303,
        3870105701,
        2008414854,
        3344188149,
        4221384143,
        3956125452,
        2067696032,
        3594591187,
        2921233993,
        2428461,
        544322398,
        577241275,
        1471733935,
        610547355,
        4027169054,
        1432588573,
        1507829418,
        2025931657,
        3646575487,
        545086370,
        48609733,
        2200306550,
        1653985193,
        298326376,
        1316178497,
        3007786442,
        2064951626,
        458293330,
        2589141269,
        3591329599,
        3164325604,
        727753846,
        2179363840,
        146436021,
        1461446943,
        4069977195,
        705550613,
        3059967265,
        3887724982,
        4281599278,
        3313849956,
        1404054877,
        2845806497,
        146425753,
        1854211946,
        1266315497,
        3048417604,
        3681880366,
        3289982499,
        290971e4,
        1235738493,
        2632868024,
        2414719590,
        3970600049,
        1771706367,
        1449415276,
        3266420449,
        422970021,
        1963543593,
        2690192192,
        3826793022,
        1062508698,
        1531092325,
        1804592342,
        2583117782,
        2714934279,
        4024971509,
        1294809318,
        4028980673,
        1289560198,
        2221992742,
        1669523910,
        35572830,
        157838143,
        1052438473,
        1016535060,
        1802137761,
        1753167236,
        1386275462,
        3080475397,
        2857371447,
        1040679964,
        2145300060,
        2390574316,
        1461121720,
        2956646967,
        4031777805,
        4028374788,
        33600511,
        2920084762,
        1018524850,
        629373528,
        3691585981,
        3515945977,
        2091462646,
        2486323059,
        586499841,
        988145025,
        935516892,
        3367335476,
        2599673255,
        2839830854,
        265290510,
        3972581182,
        2759138881,
        3795373465,
        1005194799,
        847297441,
        406762289,
        1314163512,
        1332590856,
        1866599683,
        4127851711,
        750260880,
        613907577,
        1450815602,
        3165620655,
        3734664991,
        3650291728,
        3012275730,
        3704569646,
        1427272223,
        778793252,
        1343938022,
        2676280711,
        2052605720,
        1946737175,
        3164576444,
        3914038668,
        3967478842,
        3682934266,
        1661551462,
        3294938066,
        4011595847,
        840292616,
        3712170807,
        616741398,
        312560963,
        711312465,
        1351876610,
        322626781,
        1910503582,
        271666773,
        2175563734,
        1594956187,
        70604529,
        3617834859,
        1007753275,
        1495573769,
        4069517037,
        2549218298,
        2663038764,
        504708206,
        2263041392,
        3941167025,
        2249088522,
        1514023603,
        1998579484,
        1312622330,
        694541497,
        2582060303,
        2151582166,
        1382467621,
        776784248,
        2618340202,
        3323268794,
        2497899128,
        2784771155,
        503983604,
        4076293799,
        907881277,
        423175695,
        432175456,
        1378068232,
        4145222326,
        3954048622,
        3938656102,
        3820766613,
        2793130115,
        2977904593,
        26017576,
        3274890735,
        3194772133,
        1700274565,
        1756076034,
        4006520079,
        3677328699,
        720338349,
        1533947780,
        354530856,
        688349552,
        3973924725,
        1637815568,
        332179504,
        3949051286,
        53804574,
        2852348879,
        3044236432,
        1282449977,
        3583942155,
        3416972820,
        4006381244,
        1617046695,
        2628476075,
        3002303598,
        1686838959,
        431878346,
        2686675385,
        1700445008,
        1080580658,
        1009431731,
        832498133,
        3223435511,
        2605976345,
        2271191193,
        2516031870,
        1648197032,
        4164389018,
        2548247927,
        300782431,
        375919233,
        238389289,
        3353747414,
        2531188641,
        2019080857,
        1475708069,
        455242339,
        2609103871,
        448939670,
        3451063019,
        1395535956,
        2413381860,
        1841049896,
        1491858159,
        885456874,
        4264095073,
        4001119347,
        1565136089,
        3898914787,
        1108368660,
        540939232,
        1173283510,
        2745871338,
        3681308437,
        4207628240,
        3343053890,
        4016749493,
        1699691293,
        1103962373,
        3625875870,
        2256883143,
        3830138730,
        1031889488,
        3479347698,
        1535977030,
        4236805024,
        3251091107,
        2132092099,
        1774941330,
        1199868427,
        1452454533,
        157007616,
        2904115357,
        342012276,
        595725824,
        1480756522,
        206960106,
        497939518,
        591360097,
        863170706,
        2375253569,
        3596610801,
        1814182875,
        2094937945,
        3421402208,
        1082520231,
        3463918190,
        2785509508,
        435703966,
        3908032597,
        1641649973,
        2842273706,
        3305899714,
        1510255612,
        2148256476,
        2655287854,
        3276092548,
        4258621189,
        236887753,
        3681803219,
        274041037,
        1734335097,
        3815195456,
        3317970021,
        1899903192,
        1026095262,
        4050517792,
        356393447,
        2410691914,
        3873677099,
        3682840055,
        3913112168,
        2491498743,
        4132185628,
        2489919796,
        1091903735,
        1979897079,
        3170134830,
        3567386728,
        3557303409,
        857797738,
        1136121015,
        1342202287,
        507115054,
        2535736646,
        337727348,
        3213592640,
        1301675037,
        2528481711,
        1895095763,
        1721773893,
        3216771564,
        62756741,
        2142006736,
        835421444,
        2531993523,
        1442658625,
        3659876326,
        2882144922,
        676362277,
        1392781812,
        170690266,
        3921047035,
        1759253602,
        3611846912,
        1745797284,
        664899054,
        1329594018,
        3901205900,
        3045908486,
        2062866102,
        2865634940,
        3543621612,
        3464012697,
        1080764994,
        553557557,
        3656615353,
        3996768171,
        991055499,
        499776247,
        1265440854,
        648242737,
        3940784050,
        980351604,
        3713745714,
        1749149687,
        3396870395,
        4211799374,
        3640570775,
        1161844396,
        3125318951,
        1431517754,
        545492359,
        4268468663,
        3499529547,
        1437099964,
        2702547544,
        3433638243,
        2581715763,
        2787789398,
        1060185593,
        1593081372,
        2418618748,
        4260947970,
        69676912,
        2159744348,
        86519011,
        2512459080,
        3838209314,
        1220612927,
        3339683548,
        133810670,
        1090789135,
        1078426020,
        1569222167,
        845107691,
        3583754449,
        4072456591,
        1091646820,
        628848692,
        1613405280,
        3757631651,
        526609435,
        236106946,
        48312990,
        2942717905,
        3402727701,
        1797494240,
        859738849,
        992217954,
        4005476642,
        2243076622,
        3870952857,
        3732016268,
        765654824,
        3490871365,
        2511836413,
        1685915746,
        3888969200,
        1414112111,
        2273134842,
        3281911079,
        4080962846,
        172450625,
        2569994100,
        980381355,
        4109958455,
        2819808352,
        2716589560,
        2568741196,
        3681446669,
        3329971472,
        1835478071,
        660984891,
        3704678404,
        4045999559,
        3422617507,
        3040415634,
        1762651403,
        1719377915,
        3470491036,
        2693910283,
        3642056355,
        3138596744,
        1364962596,
        2073328063,
        1983633131,
        926494387,
        3423689081,
        2150032023,
        4096667949,
        1749200295,
        3328846651,
        309677260,
        2016342300,
        1779581495,
        3079819751,
        111262694,
        1274766160,
        443224088,
        298511866,
        1025883608,
        3806446537,
        1145181785,
        168956806,
        3641502830,
        3584813610,
        1689216846,
        3666258015,
        3200248200,
        1692713982,
        2646376535,
        4042768518,
        1618508792,
        1610833997,
        3523052358,
        4130873264,
        2001055236,
        3610705100,
        2202168115,
        4028541809,
        2961195399,
        1006657119,
        2006996926,
        3186142756,
        1430667929,
        3210227297,
        1314452623,
        4074634658,
        4101304120,
        2273951170,
        1399257539,
        3367210612,
        3027628629,
        1190975929,
        2062231137,
        2333990788,
        2221543033,
        2438960610,
        1181637006,
        548689776,
        2362791313,
        3372408396,
        3104550113,
        3145860560,
        296247880,
        1970579870,
        3078560182,
        3769228297,
        1714227617,
        3291629107,
        3898220290,
        166772364,
        1251581989,
        493813264,
        448347421,
        195405023,
        2709975567,
        677966185,
        3703036547,
        1463355134,
        2715995803,
        1338867538,
        1343315457,
        2802222074,
        2684532164,
        233230375,
        2599980071,
        2000651841,
        3277868038,
        1638401717,
        4028070440,
        3237316320,
        6314154,
        819756386,
        300326615,
        590932579,
        1405279636,
        3267499572,
        3150704214,
        2428286686,
        3959192993,
        3461946742,
        1862657033,
        1266418056,
        963775037,
        2089974820,
        2263052895,
        1917689273,
        448879540,
        3550394620,
        3981727096,
        150775221,
        3627908307,
        1303187396,
        508620638,
        2975983352,
        2726630617,
        1817252668,
        1876281319,
        1457606340,
        908771278,
        3720792119,
        3617206836,
        2455994898,
        1729034894,
        1080033504,
        976866871,
        3556439503,
        2881648439,
        1522871579,
        1555064734,
        1336096578,
        3548522304,
        2579274686,
        3574697629,
        3205460757,
        3593280638,
        3338716283,
        3079412587,
        564236357,
        2993598910,
        1781952180,
        1464380207,
        3163844217,
        3332601554,
        1699332808,
        1393555694,
        1183702653,
        3581086237,
        1288719814,
        691649499,
        2847557200,
        2895455976,
        3193889540,
        2717570544,
        1781354906,
        1676643554,
        2592534050,
        3230253752,
        1126444790,
        2770207658,
        2633158820,
        2210423226,
        2615765581,
        2414155088,
        3127139286,
        673620729,
        2805611233,
        1269405062,
        4015350505,
        3341807571,
        4149409754,
        1057255273,
        2012875353,
        2162469141,
        2276492801,
        2601117357,
        993977747,
        3918593370,
        2654263191,
        753973209,
        36408145,
        2530585658,
        25011837,
        3520020182,
        2088578344,
        530523599,
        2918365339,
        1524020338,
        1518925132,
        3760827505,
        3759777254,
        1202760957,
        3985898139,
        3906192525,
        674977740,
        4174734889,
        2031300136,
        2019492241,
        3983892565,
        4153806404,
        3822280332,
        352677332,
        2297720250,
        60907813,
        90501309,
        3286998549,
        1016092578,
        2535922412,
        2839152426,
        457141659,
        509813237,
        4120667899,
        652014361,
        1966332200,
        2975202805,
        55981186,
        2327461051,
        676427537,
        3255491064,
        2882294119,
        3433927263,
        1307055953,
        942726286,
        933058658,
        2468411793,
        3933900994,
        4215176142,
        1361170020,
        2001714738,
        2830558078,
        3274259782,
        1222529897,
        1679025792,
        2729314320,
        3714953764,
        1770335741,
        151462246,
        3013232138,
        1682292957,
        1483529935,
        471910574,
        1539241949,
        458788160,
        3436315007,
        1807016891,
        3718408830,
        978976581,
        1043663428,
        3165965781,
        1927990952,
        4200891579,
        2372276910,
        3208408903,
        3533431907,
        1412390302,
        2931980059,
        4132332400,
        1947078029,
        3881505623,
        4168226417,
        2941484381,
        1077988104,
        1320477388,
        886195818,
        18198404,
        3786409e3,
        2509781533,
        112762804,
        3463356488,
        1866414978,
        891333506,
        18488651,
        661792760,
        1628790961,
        3885187036,
        3141171499,
        876946877,
        2693282273,
        1372485963,
        791857591,
        2686433993,
        3759982718,
        3167212022,
        3472953795,
        2716379847,
        445679433,
        3561995674,
        3504004811,
        3574258232,
        54117162,
        3331405415,
        2381918588,
        3769707343,
        4154350007,
        1140177722,
        4074052095,
        668550556,
        3214352940,
        367459370,
        261225585,
        2610173221,
        4209349473,
        3468074219,
        3265815641,
        314222801,
        3066103646,
        3808782860,
        282218597,
        3406013506,
        3773591054,
        379116347,
        1285071038,
        846784868,
        2669647154,
        3771962079,
        3550491691,
        2305946142,
        453669953,
        1268987020,
        3317592352,
        3279303384,
        3744833421,
        2610507566,
        3859509063,
        266596637,
        3847019092,
        517658769,
        3462560207,
        3443424879,
        370717030,
        4247526661,
        2224018117,
        4143653529,
        4112773975,
        2788324899,
        2477274417,
        1456262402,
        2901442914,
        1517677493,
        1846949527,
        2295493580,
        3734397586,
        2176403920,
        1280348187,
        1908823572,
        3871786941,
        846861322,
        1172426758,
        3287448474,
        3383383037,
        1655181056,
        3139813346,
        901632758,
        1897031941,
        2986607138,
        3066810236,
        3447102507,
        1393639104,
        373351379,
        950779232,
        625454576,
        3124240540,
        4148612726,
        2007998917,
        544563296,
        2244738638,
        2330496472,
        2058025392,
        1291430526,
        424198748,
        50039436,
        29584100,
        3605783033,
        2429876329,
        2791104160,
        1057563949,
        3255363231,
        3075367218,
        3463963227,
        1469046755,
        985887462
      ];
      var C_ORIG = [
        1332899944,
        1700884034,
        1701343084,
        1684370003,
        1668446532,
        1869963892
      ];
      function _encipher(lr, off, P, S) {
        var n, l = lr[off], r = lr[off + 1];
        l ^= P[0];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[1];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[2];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[3];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[4];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[5];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[6];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[7];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[8];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[9];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[10];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[11];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[12];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[13];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[14];
        n = S[l >>> 24];
        n += S[256 | l >> 16 & 255];
        n ^= S[512 | l >> 8 & 255];
        n += S[768 | l & 255];
        r ^= n ^ P[15];
        n = S[r >>> 24];
        n += S[256 | r >> 16 & 255];
        n ^= S[512 | r >> 8 & 255];
        n += S[768 | r & 255];
        l ^= n ^ P[16];
        lr[off] = r ^ P[BLOWFISH_NUM_ROUNDS + 1];
        lr[off + 1] = l;
        return lr;
      }
      function _streamtoword(data, offp) {
        for (var i = 0, word = 0; i < 4; ++i)
          word = word << 8 | data[offp] & 255, offp = (offp + 1) % data.length;
        return { key: word, offp };
      }
      function _key(key, P, S) {
        var offset = 0, lr = [0, 0], plen = P.length, slen = S.length, sw;
        for (var i = 0; i < plen; i++)
          sw = _streamtoword(key, offset), offset = sw.offp, P[i] = P[i] ^ sw.key;
        for (i = 0; i < plen; i += 2)
          lr = _encipher(lr, 0, P, S), P[i] = lr[0], P[i + 1] = lr[1];
        for (i = 0; i < slen; i += 2)
          lr = _encipher(lr, 0, P, S), S[i] = lr[0], S[i + 1] = lr[1];
      }
      function _ekskey(data, key, P, S) {
        var offp = 0, lr = [0, 0], plen = P.length, slen = S.length, sw;
        for (var i = 0; i < plen; i++)
          sw = _streamtoword(key, offp), offp = sw.offp, P[i] = P[i] ^ sw.key;
        offp = 0;
        for (i = 0; i < plen; i += 2)
          sw = _streamtoword(data, offp), offp = sw.offp, lr[0] ^= sw.key, sw = _streamtoword(data, offp), offp = sw.offp, lr[1] ^= sw.key, lr = _encipher(lr, 0, P, S), P[i] = lr[0], P[i + 1] = lr[1];
        for (i = 0; i < slen; i += 2)
          sw = _streamtoword(data, offp), offp = sw.offp, lr[0] ^= sw.key, sw = _streamtoword(data, offp), offp = sw.offp, lr[1] ^= sw.key, lr = _encipher(lr, 0, P, S), S[i] = lr[0], S[i + 1] = lr[1];
      }
      function _crypt(b, salt, rounds, callback, progressCallback) {
        var cdata = C_ORIG.slice(), clen = cdata.length, err;
        if (rounds < 4 || rounds > 31) {
          err = Error("Illegal number of rounds (4-31): " + rounds);
          if (callback) {
            nextTick(callback.bind(this, err));
            return;
          } else
            throw err;
        }
        if (salt.length !== BCRYPT_SALT_LEN) {
          err = Error("Illegal salt length: " + salt.length + " != " + BCRYPT_SALT_LEN);
          if (callback) {
            nextTick(callback.bind(this, err));
            return;
          } else
            throw err;
        }
        rounds = 1 << rounds >>> 0;
        var P, S, i = 0, j;
        if (Int32Array) {
          P = new Int32Array(P_ORIG);
          S = new Int32Array(S_ORIG);
        } else {
          P = P_ORIG.slice();
          S = S_ORIG.slice();
        }
        _ekskey(salt, b, P, S);
        function next() {
          if (progressCallback)
            progressCallback(i / rounds);
          if (i < rounds) {
            var start = Date.now();
            for (; i < rounds; ) {
              i = i + 1;
              _key(b, P, S);
              _key(salt, P, S);
              if (Date.now() - start > MAX_EXECUTION_TIME)
                break;
            }
          } else {
            for (i = 0; i < 64; i++)
              for (j = 0; j < clen >> 1; j++)
                _encipher(cdata, j << 1, P, S);
            var ret = [];
            for (i = 0; i < clen; i++)
              ret.push((cdata[i] >> 24 & 255) >>> 0), ret.push((cdata[i] >> 16 & 255) >>> 0), ret.push((cdata[i] >> 8 & 255) >>> 0), ret.push((cdata[i] & 255) >>> 0);
            if (callback) {
              callback(null, ret);
              return;
            } else
              return ret;
          }
          if (callback)
            nextTick(next);
        }
        if (typeof callback !== "undefined") {
          next();
        } else {
          var res;
          while (true)
            if (typeof (res = next()) !== "undefined")
              return res || [];
        }
      }
      function _hash(s, salt, callback, progressCallback) {
        var err;
        if (typeof s !== "string" || typeof salt !== "string") {
          err = Error("Invalid string / salt: Not a string");
          if (callback) {
            nextTick(callback.bind(this, err));
            return;
          } else
            throw err;
        }
        var minor, offset;
        if (salt.charAt(0) !== "$" || salt.charAt(1) !== "2") {
          err = Error("Invalid salt version: " + salt.substring(0, 2));
          if (callback) {
            nextTick(callback.bind(this, err));
            return;
          } else
            throw err;
        }
        if (salt.charAt(2) === "$")
          minor = String.fromCharCode(0), offset = 3;
        else {
          minor = salt.charAt(2);
          if (minor !== "a" && minor !== "b" && minor !== "y" || salt.charAt(3) !== "$") {
            err = Error("Invalid salt revision: " + salt.substring(2, 4));
            if (callback) {
              nextTick(callback.bind(this, err));
              return;
            } else
              throw err;
          }
          offset = 4;
        }
        if (salt.charAt(offset + 2) > "$") {
          err = Error("Missing salt rounds");
          if (callback) {
            nextTick(callback.bind(this, err));
            return;
          } else
            throw err;
        }
        var r1 = parseInt(salt.substring(offset, offset + 1), 10) * 10, r2 = parseInt(salt.substring(offset + 1, offset + 2), 10), rounds = r1 + r2, real_salt = salt.substring(offset + 3, offset + 25);
        s += minor >= "a" ? "\0" : "";
        var passwordb = stringToBytes(s), saltb = base64_decode(real_salt, BCRYPT_SALT_LEN);
        function finish(bytes) {
          var res = [];
          res.push("$2");
          if (minor >= "a")
            res.push(minor);
          res.push("$");
          if (rounds < 10)
            res.push("0");
          res.push(rounds.toString());
          res.push("$");
          res.push(base64_encode(saltb, saltb.length));
          res.push(base64_encode(bytes, C_ORIG.length * 4 - 1));
          return res.join("");
        }
        if (typeof callback == "undefined")
          return finish(_crypt(passwordb, saltb, rounds));
        else {
          _crypt(passwordb, saltb, rounds, function(err2, bytes) {
            if (err2)
              callback(err2, null);
            else
              callback(null, finish(bytes));
          }, progressCallback);
        }
      }
      bcrypt3.encodeBase64 = base64_encode;
      bcrypt3.decodeBase64 = base64_decode;
      return bcrypt3;
    });
  }
});

// build/plugin/symbia-imagine/node_modules/bcryptjs/index.js
var require_bcryptjs = __commonJS({
  "build/plugin/symbia-imagine/node_modules/bcryptjs/index.js"(exports, module) {
    module.exports = require_bcrypt();
  }
});

// build/plugin/symbia-imagine/node_modules/safe-buffer/index.js
var require_safe_buffer = __commonJS({
  "build/plugin/symbia-imagine/node_modules/safe-buffer/index.js"(exports, module) {
    var buffer = __require("buffer");
    var Buffer2 = buffer.Buffer;
    function copyProps(src, dst) {
      for (var key in src) {
        dst[key] = src[key];
      }
    }
    if (Buffer2.from && Buffer2.alloc && Buffer2.allocUnsafe && Buffer2.allocUnsafeSlow) {
      module.exports = buffer;
    } else {
      copyProps(buffer, exports);
      exports.Buffer = SafeBuffer;
    }
    function SafeBuffer(arg, encodingOrOffset, length) {
      return Buffer2(arg, encodingOrOffset, length);
    }
    SafeBuffer.prototype = Object.create(Buffer2.prototype);
    copyProps(Buffer2, SafeBuffer);
    SafeBuffer.from = function(arg, encodingOrOffset, length) {
      if (typeof arg === "number") {
        throw new TypeError("Argument must not be a number");
      }
      return Buffer2(arg, encodingOrOffset, length);
    };
    SafeBuffer.alloc = function(size, fill, encoding) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      var buf = Buffer2(size);
      if (fill !== void 0) {
        if (typeof encoding === "string") {
          buf.fill(fill, encoding);
        } else {
          buf.fill(fill);
        }
      } else {
        buf.fill(0);
      }
      return buf;
    };
    SafeBuffer.allocUnsafe = function(size) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      return Buffer2(size);
    };
    SafeBuffer.allocUnsafeSlow = function(size) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      return buffer.SlowBuffer(size);
    };
  }
});

// build/plugin/symbia-imagine/node_modules/jws/lib/data-stream.js
var require_data_stream = __commonJS({
  "build/plugin/symbia-imagine/node_modules/jws/lib/data-stream.js"(exports, module) {
    var Buffer2 = require_safe_buffer().Buffer;
    var Stream = __require("stream");
    var util = __require("util");
    function DataStream(data) {
      this.buffer = null;
      this.writable = true;
      this.readable = true;
      if (!data) {
        this.buffer = Buffer2.alloc(0);
        return this;
      }
      if (typeof data.pipe === "function") {
        this.buffer = Buffer2.alloc(0);
        data.pipe(this);
        return this;
      }
      if (data.length || typeof data === "object") {
        this.buffer = data;
        this.writable = false;
        process.nextTick(function() {
          this.emit("end", data);
          this.readable = false;
          this.emit("close");
        }.bind(this));
        return this;
      }
      throw new TypeError("Unexpected data type (" + typeof data + ")");
    }
    util.inherits(DataStream, Stream);
    DataStream.prototype.write = function write(data) {
      this.buffer = Buffer2.concat([this.buffer, Buffer2.from(data)]);
      this.emit("data", data);
    };
    DataStream.prototype.end = function end(data) {
      if (data)
        this.write(data);
      this.emit("end", data);
      this.emit("close");
      this.writable = false;
      this.readable = false;
    };
    module.exports = DataStream;
  }
});

// build/plugin/symbia-imagine/node_modules/ecdsa-sig-formatter/src/param-bytes-for-alg.js
var require_param_bytes_for_alg = __commonJS({
  "build/plugin/symbia-imagine/node_modules/ecdsa-sig-formatter/src/param-bytes-for-alg.js"(exports, module) {
    "use strict";
    function getParamSize(keySize) {
      var result = (keySize / 8 | 0) + (keySize % 8 === 0 ? 0 : 1);
      return result;
    }
    var paramBytesForAlg = {
      ES256: getParamSize(256),
      ES384: getParamSize(384),
      ES512: getParamSize(521)
    };
    function getParamBytesForAlg(alg) {
      var paramBytes = paramBytesForAlg[alg];
      if (paramBytes) {
        return paramBytes;
      }
      throw new Error('Unknown algorithm "' + alg + '"');
    }
    module.exports = getParamBytesForAlg;
  }
});

// build/plugin/symbia-imagine/node_modules/ecdsa-sig-formatter/src/ecdsa-sig-formatter.js
var require_ecdsa_sig_formatter = __commonJS({
  "build/plugin/symbia-imagine/node_modules/ecdsa-sig-formatter/src/ecdsa-sig-formatter.js"(exports, module) {
    "use strict";
    var Buffer2 = require_safe_buffer().Buffer;
    var getParamBytesForAlg = require_param_bytes_for_alg();
    var MAX_OCTET = 128;
    var CLASS_UNIVERSAL = 0;
    var PRIMITIVE_BIT = 32;
    var TAG_SEQ = 16;
    var TAG_INT = 2;
    var ENCODED_TAG_SEQ = TAG_SEQ | PRIMITIVE_BIT | CLASS_UNIVERSAL << 6;
    var ENCODED_TAG_INT = TAG_INT | CLASS_UNIVERSAL << 6;
    function base64Url(base64) {
      return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    }
    function signatureAsBuffer(signature) {
      if (Buffer2.isBuffer(signature)) {
        return signature;
      } else if ("string" === typeof signature) {
        return Buffer2.from(signature, "base64");
      }
      throw new TypeError("ECDSA signature must be a Base64 string or a Buffer");
    }
    function derToJose(signature, alg) {
      signature = signatureAsBuffer(signature);
      var paramBytes = getParamBytesForAlg(alg);
      var maxEncodedParamLength = paramBytes + 1;
      var inputLength = signature.length;
      var offset = 0;
      if (signature[offset++] !== ENCODED_TAG_SEQ) {
        throw new Error('Could not find expected "seq"');
      }
      var seqLength = signature[offset++];
      if (seqLength === (MAX_OCTET | 1)) {
        seqLength = signature[offset++];
      }
      if (inputLength - offset < seqLength) {
        throw new Error('"seq" specified length of "' + seqLength + '", only "' + (inputLength - offset) + '" remaining');
      }
      if (signature[offset++] !== ENCODED_TAG_INT) {
        throw new Error('Could not find expected "int" for "r"');
      }
      var rLength = signature[offset++];
      if (inputLength - offset - 2 < rLength) {
        throw new Error('"r" specified length of "' + rLength + '", only "' + (inputLength - offset - 2) + '" available');
      }
      if (maxEncodedParamLength < rLength) {
        throw new Error('"r" specified length of "' + rLength + '", max of "' + maxEncodedParamLength + '" is acceptable');
      }
      var rOffset = offset;
      offset += rLength;
      if (signature[offset++] !== ENCODED_TAG_INT) {
        throw new Error('Could not find expected "int" for "s"');
      }
      var sLength = signature[offset++];
      if (inputLength - offset !== sLength) {
        throw new Error('"s" specified length of "' + sLength + '", expected "' + (inputLength - offset) + '"');
      }
      if (maxEncodedParamLength < sLength) {
        throw new Error('"s" specified length of "' + sLength + '", max of "' + maxEncodedParamLength + '" is acceptable');
      }
      var sOffset = offset;
      offset += sLength;
      if (offset !== inputLength) {
        throw new Error('Expected to consume entire buffer, but "' + (inputLength - offset) + '" bytes remain');
      }
      var rPadding = paramBytes - rLength, sPadding = paramBytes - sLength;
      var dst = Buffer2.allocUnsafe(rPadding + rLength + sPadding + sLength);
      for (offset = 0; offset < rPadding; ++offset) {
        dst[offset] = 0;
      }
      signature.copy(dst, offset, rOffset + Math.max(-rPadding, 0), rOffset + rLength);
      offset = paramBytes;
      for (var o = offset; offset < o + sPadding; ++offset) {
        dst[offset] = 0;
      }
      signature.copy(dst, offset, sOffset + Math.max(-sPadding, 0), sOffset + sLength);
      dst = dst.toString("base64");
      dst = base64Url(dst);
      return dst;
    }
    function countPadding(buf, start, stop) {
      var padding = 0;
      while (start + padding < stop && buf[start + padding] === 0) {
        ++padding;
      }
      var needsSign = buf[start + padding] >= MAX_OCTET;
      if (needsSign) {
        --padding;
      }
      return padding;
    }
    function joseToDer(signature, alg) {
      signature = signatureAsBuffer(signature);
      var paramBytes = getParamBytesForAlg(alg);
      var signatureBytes = signature.length;
      if (signatureBytes !== paramBytes * 2) {
        throw new TypeError('"' + alg + '" signatures must be "' + paramBytes * 2 + '" bytes, saw "' + signatureBytes + '"');
      }
      var rPadding = countPadding(signature, 0, paramBytes);
      var sPadding = countPadding(signature, paramBytes, signature.length);
      var rLength = paramBytes - rPadding;
      var sLength = paramBytes - sPadding;
      var rsBytes = 1 + 1 + rLength + 1 + 1 + sLength;
      var shortLength = rsBytes < MAX_OCTET;
      var dst = Buffer2.allocUnsafe((shortLength ? 2 : 3) + rsBytes);
      var offset = 0;
      dst[offset++] = ENCODED_TAG_SEQ;
      if (shortLength) {
        dst[offset++] = rsBytes;
      } else {
        dst[offset++] = MAX_OCTET | 1;
        dst[offset++] = rsBytes & 255;
      }
      dst[offset++] = ENCODED_TAG_INT;
      dst[offset++] = rLength;
      if (rPadding < 0) {
        dst[offset++] = 0;
        offset += signature.copy(dst, offset, 0, paramBytes);
      } else {
        offset += signature.copy(dst, offset, rPadding, paramBytes);
      }
      dst[offset++] = ENCODED_TAG_INT;
      dst[offset++] = sLength;
      if (sPadding < 0) {
        dst[offset++] = 0;
        signature.copy(dst, offset, paramBytes);
      } else {
        signature.copy(dst, offset, paramBytes + sPadding);
      }
      return dst;
    }
    module.exports = {
      derToJose,
      joseToDer
    };
  }
});

// build/plugin/symbia-imagine/node_modules/buffer-equal-constant-time/index.js
var require_buffer_equal_constant_time = __commonJS({
  "build/plugin/symbia-imagine/node_modules/buffer-equal-constant-time/index.js"(exports, module) {
    "use strict";
    var Buffer2 = __require("buffer").Buffer;
    var SlowBuffer = __require("buffer").SlowBuffer;
    module.exports = bufferEq;
    function bufferEq(a, b) {
      if (!Buffer2.isBuffer(a) || !Buffer2.isBuffer(b)) {
        return false;
      }
      if (a.length !== b.length) {
        return false;
      }
      var c = 0;
      for (var i = 0; i < a.length; i++) {
        c |= a[i] ^ b[i];
      }
      return c === 0;
    }
    bufferEq.install = function() {
      Buffer2.prototype.equal = SlowBuffer.prototype.equal = function equal(that) {
        return bufferEq(this, that);
      };
    };
    var origBufEqual = Buffer2.prototype.equal;
    var origSlowBufEqual = SlowBuffer.prototype.equal;
    bufferEq.restore = function() {
      Buffer2.prototype.equal = origBufEqual;
      SlowBuffer.prototype.equal = origSlowBufEqual;
    };
  }
});

// build/plugin/symbia-imagine/node_modules/jwa/index.js
var require_jwa = __commonJS({
  "build/plugin/symbia-imagine/node_modules/jwa/index.js"(exports, module) {
    var Buffer2 = require_safe_buffer().Buffer;
    var crypto3 = __require("crypto");
    var formatEcdsa = require_ecdsa_sig_formatter();
    var util = __require("util");
    var MSG_INVALID_ALGORITHM = '"%s" is not a valid algorithm.\n  Supported algorithms are:\n  "HS256", "HS384", "HS512", "RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512" and "none".';
    var MSG_INVALID_SECRET = "secret must be a string or buffer";
    var MSG_INVALID_VERIFIER_KEY = "key must be a string or a buffer";
    var MSG_INVALID_SIGNER_KEY = "key must be a string, a buffer or an object";
    var supportsKeyObjects = typeof crypto3.createPublicKey === "function";
    if (supportsKeyObjects) {
      MSG_INVALID_VERIFIER_KEY += " or a KeyObject";
      MSG_INVALID_SECRET += "or a KeyObject";
    }
    function checkIsPublicKey(key) {
      if (Buffer2.isBuffer(key)) {
        return;
      }
      if (typeof key === "string") {
        return;
      }
      if (!supportsKeyObjects) {
        throw typeError(MSG_INVALID_VERIFIER_KEY);
      }
      if (typeof key !== "object") {
        throw typeError(MSG_INVALID_VERIFIER_KEY);
      }
      if (typeof key.type !== "string") {
        throw typeError(MSG_INVALID_VERIFIER_KEY);
      }
      if (typeof key.asymmetricKeyType !== "string") {
        throw typeError(MSG_INVALID_VERIFIER_KEY);
      }
      if (typeof key.export !== "function") {
        throw typeError(MSG_INVALID_VERIFIER_KEY);
      }
    }
    function checkIsPrivateKey(key) {
      if (Buffer2.isBuffer(key)) {
        return;
      }
      if (typeof key === "string") {
        return;
      }
      if (typeof key === "object") {
        return;
      }
      throw typeError(MSG_INVALID_SIGNER_KEY);
    }
    function checkIsSecretKey(key) {
      if (Buffer2.isBuffer(key)) {
        return;
      }
      if (typeof key === "string") {
        return key;
      }
      if (!supportsKeyObjects) {
        throw typeError(MSG_INVALID_SECRET);
      }
      if (typeof key !== "object") {
        throw typeError(MSG_INVALID_SECRET);
      }
      if (key.type !== "secret") {
        throw typeError(MSG_INVALID_SECRET);
      }
      if (typeof key.export !== "function") {
        throw typeError(MSG_INVALID_SECRET);
      }
    }
    function fromBase64(base64) {
      return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    }
    function toBase64(base64url) {
      base64url = base64url.toString();
      var padding = 4 - base64url.length % 4;
      if (padding !== 4) {
        for (var i = 0; i < padding; ++i) {
          base64url += "=";
        }
      }
      return base64url.replace(/\-/g, "+").replace(/_/g, "/");
    }
    function typeError(template) {
      var args = [].slice.call(arguments, 1);
      var errMsg = util.format.bind(util, template).apply(null, args);
      return new TypeError(errMsg);
    }
    function bufferOrString(obj) {
      return Buffer2.isBuffer(obj) || typeof obj === "string";
    }
    function normalizeInput(thing) {
      if (!bufferOrString(thing))
        thing = JSON.stringify(thing);
      return thing;
    }
    function createHmacSigner(bits) {
      return function sign(thing, secret) {
        checkIsSecretKey(secret);
        thing = normalizeInput(thing);
        var hmac = crypto3.createHmac("sha" + bits, secret);
        var sig = (hmac.update(thing), hmac.digest("base64"));
        return fromBase64(sig);
      };
    }
    var bufferEqual;
    var timingSafeEqual = "timingSafeEqual" in crypto3 ? function timingSafeEqual2(a, b) {
      if (a.byteLength !== b.byteLength) {
        return false;
      }
      return crypto3.timingSafeEqual(a, b);
    } : function timingSafeEqual2(a, b) {
      if (!bufferEqual) {
        bufferEqual = require_buffer_equal_constant_time();
      }
      return bufferEqual(a, b);
    };
    function createHmacVerifier(bits) {
      return function verify(thing, signature, secret) {
        var computedSig = createHmacSigner(bits)(thing, secret);
        return timingSafeEqual(Buffer2.from(signature), Buffer2.from(computedSig));
      };
    }
    function createKeySigner(bits) {
      return function sign(thing, privateKey) {
        checkIsPrivateKey(privateKey);
        thing = normalizeInput(thing);
        var signer = crypto3.createSign("RSA-SHA" + bits);
        var sig = (signer.update(thing), signer.sign(privateKey, "base64"));
        return fromBase64(sig);
      };
    }
    function createKeyVerifier(bits) {
      return function verify(thing, signature, publicKey) {
        checkIsPublicKey(publicKey);
        thing = normalizeInput(thing);
        signature = toBase64(signature);
        var verifier = crypto3.createVerify("RSA-SHA" + bits);
        verifier.update(thing);
        return verifier.verify(publicKey, signature, "base64");
      };
    }
    function createPSSKeySigner(bits) {
      return function sign(thing, privateKey) {
        checkIsPrivateKey(privateKey);
        thing = normalizeInput(thing);
        var signer = crypto3.createSign("RSA-SHA" + bits);
        var sig = (signer.update(thing), signer.sign({
          key: privateKey,
          padding: crypto3.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: crypto3.constants.RSA_PSS_SALTLEN_DIGEST
        }, "base64"));
        return fromBase64(sig);
      };
    }
    function createPSSKeyVerifier(bits) {
      return function verify(thing, signature, publicKey) {
        checkIsPublicKey(publicKey);
        thing = normalizeInput(thing);
        signature = toBase64(signature);
        var verifier = crypto3.createVerify("RSA-SHA" + bits);
        verifier.update(thing);
        return verifier.verify({
          key: publicKey,
          padding: crypto3.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: crypto3.constants.RSA_PSS_SALTLEN_DIGEST
        }, signature, "base64");
      };
    }
    function createECDSASigner(bits) {
      var inner = createKeySigner(bits);
      return function sign() {
        var signature = inner.apply(null, arguments);
        signature = formatEcdsa.derToJose(signature, "ES" + bits);
        return signature;
      };
    }
    function createECDSAVerifer(bits) {
      var inner = createKeyVerifier(bits);
      return function verify(thing, signature, publicKey) {
        signature = formatEcdsa.joseToDer(signature, "ES" + bits).toString("base64");
        var result = inner(thing, signature, publicKey);
        return result;
      };
    }
    function createNoneSigner() {
      return function sign() {
        return "";
      };
    }
    function createNoneVerifier() {
      return function verify(thing, signature) {
        return signature === "";
      };
    }
    module.exports = function jwa(algorithm) {
      var signerFactories = {
        hs: createHmacSigner,
        rs: createKeySigner,
        ps: createPSSKeySigner,
        es: createECDSASigner,
        none: createNoneSigner
      };
      var verifierFactories = {
        hs: createHmacVerifier,
        rs: createKeyVerifier,
        ps: createPSSKeyVerifier,
        es: createECDSAVerifer,
        none: createNoneVerifier
      };
      var match = algorithm.match(/^(RS|PS|ES|HS)(256|384|512)$|^(none)$/);
      if (!match)
        throw typeError(MSG_INVALID_ALGORITHM, algorithm);
      var algo = (match[1] || match[3]).toLowerCase();
      var bits = match[2];
      return {
        sign: signerFactories[algo](bits),
        verify: verifierFactories[algo](bits)
      };
    };
  }
});

// build/plugin/symbia-imagine/node_modules/jws/lib/tostring.js
var require_tostring = __commonJS({
  "build/plugin/symbia-imagine/node_modules/jws/lib/tostring.js"(exports, module) {
    var Buffer2 = __require("buffer").Buffer;
    module.exports = function toString(obj) {
      if (typeof obj === "string")
        return obj;
      if (typeof obj === "number" || Buffer2.isBuffer(obj))
        return obj.toString();
      return JSON.stringify(obj);
    };
  }
});

// build/plugin/symbia-imagine/node_modules/jws/lib/sign-stream.js
var require_sign_stream = __commonJS({
  "build/plugin/symbia-imagine/node_modules/jws/lib/sign-stream.js"(exports, module) {
    var Buffer2 = require_safe_buffer().Buffer;
    var DataStream = require_data_stream();
    var jwa = require_jwa();
    var Stream = __require("stream");
    var toString = require_tostring();
    var util = __require("util");
    function base64url(string, encoding) {
      return Buffer2.from(string, encoding).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    }
    function jwsSecuredInput(header, payload, encoding) {
      encoding = encoding || "utf8";
      var encodedHeader = base64url(toString(header), "binary");
      var encodedPayload = base64url(toString(payload), encoding);
      return util.format("%s.%s", encodedHeader, encodedPayload);
    }
    function jwsSign(opts) {
      var header = opts.header;
      var payload = opts.payload;
      var secretOrKey = opts.secret || opts.privateKey;
      var encoding = opts.encoding;
      var algo = jwa(header.alg);
      var securedInput = jwsSecuredInput(header, payload, encoding);
      var signature = algo.sign(securedInput, secretOrKey);
      return util.format("%s.%s", securedInput, signature);
    }
    function SignStream(opts) {
      var secret = opts.secret;
      secret = secret == null ? opts.privateKey : secret;
      secret = secret == null ? opts.key : secret;
      if (/^hs/i.test(opts.header.alg) === true && secret == null) {
        throw new TypeError("secret must be a string or buffer or a KeyObject");
      }
      var secretStream = new DataStream(secret);
      this.readable = true;
      this.header = opts.header;
      this.encoding = opts.encoding;
      this.secret = this.privateKey = this.key = secretStream;
      this.payload = new DataStream(opts.payload);
      this.secret.once("close", function() {
        if (!this.payload.writable && this.readable)
          this.sign();
      }.bind(this));
      this.payload.once("close", function() {
        if (!this.secret.writable && this.readable)
          this.sign();
      }.bind(this));
    }
    util.inherits(SignStream, Stream);
    SignStream.prototype.sign = function sign() {
      try {
        var signature = jwsSign({
          header: this.header,
          payload: this.payload.buffer,
          secret: this.secret.buffer,
          encoding: this.encoding
        });
        this.emit("done", signature);
        this.emit("data", signature);
        this.emit("end");
        this.readable = false;
        return signature;
      } catch (e) {
        this.readable = false;
        this.emit("error", e);
        this.emit("close");
      }
    };
    SignStream.sign = jwsSign;
    module.exports = SignStream;
  }
});

// build/plugin/symbia-imagine/node_modules/jws/lib/verify-stream.js
var require_verify_stream = __commonJS({
  "build/plugin/symbia-imagine/node_modules/jws/lib/verify-stream.js"(exports, module) {
    var Buffer2 = require_safe_buffer().Buffer;
    var DataStream = require_data_stream();
    var jwa = require_jwa();
    var Stream = __require("stream");
    var toString = require_tostring();
    var util = __require("util");
    var JWS_REGEX = /^[a-zA-Z0-9\-_]+?\.[a-zA-Z0-9\-_]+?\.([a-zA-Z0-9\-_]+)?$/;
    function isObject(thing) {
      return Object.prototype.toString.call(thing) === "[object Object]";
    }
    function safeJsonParse(thing) {
      if (isObject(thing))
        return thing;
      try {
        return JSON.parse(thing);
      } catch (e) {
        return void 0;
      }
    }
    function headerFromJWS(jwsSig) {
      var encodedHeader = jwsSig.split(".", 1)[0];
      return safeJsonParse(Buffer2.from(encodedHeader, "base64").toString("binary"));
    }
    function securedInputFromJWS(jwsSig) {
      return jwsSig.split(".", 2).join(".");
    }
    function signatureFromJWS(jwsSig) {
      return jwsSig.split(".")[2];
    }
    function payloadFromJWS(jwsSig, encoding) {
      encoding = encoding || "utf8";
      var payload = jwsSig.split(".")[1];
      return Buffer2.from(payload, "base64").toString(encoding);
    }
    function isValidJws(string) {
      return JWS_REGEX.test(string) && !!headerFromJWS(string);
    }
    function jwsVerify(jwsSig, algorithm, secretOrKey) {
      if (!algorithm) {
        var err = new Error("Missing algorithm parameter for jws.verify");
        err.code = "MISSING_ALGORITHM";
        throw err;
      }
      jwsSig = toString(jwsSig);
      var signature = signatureFromJWS(jwsSig);
      var securedInput = securedInputFromJWS(jwsSig);
      var algo = jwa(algorithm);
      return algo.verify(securedInput, signature, secretOrKey);
    }
    function jwsDecode(jwsSig, opts) {
      opts = opts || {};
      jwsSig = toString(jwsSig);
      if (!isValidJws(jwsSig))
        return null;
      var header = headerFromJWS(jwsSig);
      if (!header)
        return null;
      var payload = payloadFromJWS(jwsSig);
      if (header.typ === "JWT" || opts.json)
        payload = JSON.parse(payload, opts.encoding);
      return {
        header,
        payload,
        signature: signatureFromJWS(jwsSig)
      };
    }
    function VerifyStream(opts) {
      opts = opts || {};
      var secretOrKey = opts.secret;
      secretOrKey = secretOrKey == null ? opts.publicKey : secretOrKey;
      secretOrKey = secretOrKey == null ? opts.key : secretOrKey;
      if (/^hs/i.test(opts.algorithm) === true && secretOrKey == null) {
        throw new TypeError("secret must be a string or buffer or a KeyObject");
      }
      var secretStream = new DataStream(secretOrKey);
      this.readable = true;
      this.algorithm = opts.algorithm;
      this.encoding = opts.encoding;
      this.secret = this.publicKey = this.key = secretStream;
      this.signature = new DataStream(opts.signature);
      this.secret.once("close", function() {
        if (!this.signature.writable && this.readable)
          this.verify();
      }.bind(this));
      this.signature.once("close", function() {
        if (!this.secret.writable && this.readable)
          this.verify();
      }.bind(this));
    }
    util.inherits(VerifyStream, Stream);
    VerifyStream.prototype.verify = function verify() {
      try {
        var valid = jwsVerify(this.signature.buffer, this.algorithm, this.key.buffer);
        var obj = jwsDecode(this.signature.buffer, this.encoding);
        this.emit("done", valid, obj);
        this.emit("data", valid);
        this.emit("end");
        this.readable = false;
        return valid;
      } catch (e) {
        this.readable = false;
        this.emit("error", e);
        this.emit("close");
      }
    };
    VerifyStream.decode = jwsDecode;
    VerifyStream.isValid = isValidJws;
    VerifyStream.verify = jwsVerify;
    module.exports = VerifyStream;
  }
});

// build/plugin/symbia-imagine/node_modules/jws/index.js
var require_jws = __commonJS({
  "build/plugin/symbia-imagine/node_modules/jws/index.js"(exports) {
    var SignStream = require_sign_stream();
    var VerifyStream = require_verify_stream();
    var ALGORITHMS = [
      "HS256",
      "HS384",
      "HS512",
      "RS256",
      "RS384",
      "RS512",
      "PS256",
      "PS384",
      "PS512",
      "ES256",
      "ES384",
      "ES512"
    ];
    exports.ALGORITHMS = ALGORITHMS;
    exports.sign = SignStream.sign;
    exports.verify = VerifyStream.verify;
    exports.decode = VerifyStream.decode;
    exports.isValid = VerifyStream.isValid;
    exports.createSign = function createSign(opts) {
      return new SignStream(opts);
    };
    exports.createVerify = function createVerify(opts) {
      return new VerifyStream(opts);
    };
  }
});

// build/plugin/symbia-imagine/node_modules/jsonwebtoken/decode.js
var require_decode = __commonJS({
  "build/plugin/symbia-imagine/node_modules/jsonwebtoken/decode.js"(exports, module) {
    var jws = require_jws();
    module.exports = function(jwt2, options) {
      options = options || {};
      var decoded = jws.decode(jwt2, options);
      if (!decoded) {
        return null;
      }
      var payload = decoded.payload;
      if (typeof payload === "string") {
        try {
          var obj = JSON.parse(payload);
          if (obj !== null && typeof obj === "object") {
            payload = obj;
          }
        } catch (e) {
        }
      }
      if (options.complete === true) {
        return {
          header: decoded.header,
          payload,
          signature: decoded.signature
        };
      }
      return payload;
    };
  }
});

// build/plugin/symbia-imagine/node_modules/jsonwebtoken/lib/JsonWebTokenError.js
var require_JsonWebTokenError = __commonJS({
  "build/plugin/symbia-imagine/node_modules/jsonwebtoken/lib/JsonWebTokenError.js"(exports, module) {
    var JsonWebTokenError = function(message, error) {
      Error.call(this, message);
      if (Error.captureStackTrace) {
        Error.captureStackTrace(this, this.constructor);
      }
      this.name = "JsonWebTokenError";
      this.message = message;
      if (error) this.inner = error;
    };
    JsonWebTokenError.prototype = Object.create(Error.prototype);
    JsonWebTokenError.prototype.constructor = JsonWebTokenError;
    module.exports = JsonWebTokenError;
  }
});

// build/plugin/symbia-imagine/node_modules/jsonwebtoken/lib/NotBeforeError.js
var require_NotBeforeError = __commonJS({
  "build/plugin/symbia-imagine/node_modules/jsonwebtoken/lib/NotBeforeError.js"(exports, module) {
    var JsonWebTokenError = require_JsonWebTokenError();
    var NotBeforeError = function(message, date) {
      JsonWebTokenError.call(this, message);
      this.name = "NotBeforeError";
      this.date = date;
    };
    NotBeforeError.prototype = Object.create(JsonWebTokenError.prototype);
    NotBeforeError.prototype.constructor = NotBeforeError;
    module.exports = NotBeforeError;
  }
});

// build/plugin/symbia-imagine/node_modules/jsonwebtoken/lib/TokenExpiredError.js
var require_TokenExpiredError = __commonJS({
  "build/plugin/symbia-imagine/node_modules/jsonwebtoken/lib/TokenExpiredError.js"(exports, module) {
    var JsonWebTokenError = require_JsonWebTokenError();
    var TokenExpiredError = function(message, expiredAt) {
      JsonWebTokenError.call(this, message);
      this.name = "TokenExpiredError";
      this.expiredAt = expiredAt;
    };
    TokenExpiredError.prototype = Object.create(JsonWebTokenError.prototype);
    TokenExpiredError.prototype.constructor = TokenExpiredError;
    module.exports = TokenExpiredError;
  }
});

// build/plugin/symbia-imagine/node_modules/jsonwebtoken/lib/timespan.js
var require_timespan = __commonJS({
  "build/plugin/symbia-imagine/node_modules/jsonwebtoken/lib/timespan.js"(exports, module) {
    var ms = require_ms();
    module.exports = function(time, iat) {
      var timestamp2 = iat || Math.floor(Date.now() / 1e3);
      if (typeof time === "string") {
        var milliseconds = ms(time);
        if (typeof milliseconds === "undefined") {
          return;
        }
        return Math.floor(timestamp2 + milliseconds / 1e3);
      } else if (typeof time === "number") {
        return timestamp2 + time;
      } else {
        return;
      }
    };
  }
});

// build/plugin/symbia-imagine/node_modules/semver/internal/constants.js
var require_constants = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/internal/constants.js"(exports, module) {
    "use strict";
    var SEMVER_SPEC_VERSION = "2.0.0";
    var MAX_LENGTH = 256;
    var MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || /* istanbul ignore next */
    9007199254740991;
    var MAX_SAFE_COMPONENT_LENGTH = 16;
    var MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6;
    var RELEASE_TYPES = [
      "major",
      "premajor",
      "minor",
      "preminor",
      "patch",
      "prepatch",
      "prerelease"
    ];
    module.exports = {
      MAX_LENGTH,
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_SAFE_INTEGER,
      RELEASE_TYPES,
      SEMVER_SPEC_VERSION,
      FLAG_INCLUDE_PRERELEASE: 1,
      FLAG_LOOSE: 2
    };
  }
});

// build/plugin/symbia-imagine/node_modules/semver/internal/debug.js
var require_debug = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/internal/debug.js"(exports, module) {
    "use strict";
    var debug = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args) => console.error("SEMVER", ...args) : () => {
    };
    module.exports = debug;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/internal/re.js
var require_re = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/internal/re.js"(exports, module) {
    "use strict";
    var {
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_LENGTH
    } = require_constants();
    var debug = require_debug();
    exports = module.exports = {};
    var re = exports.re = [];
    var safeRe = exports.safeRe = [];
    var src = exports.src = [];
    var safeSrc = exports.safeSrc = [];
    var t = exports.t = {};
    var R = 0;
    var LETTERDASHNUMBER = "[a-zA-Z0-9-]";
    var safeRegexReplacements = [
      ["\\s", 1],
      ["\\d", MAX_LENGTH],
      [LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH]
    ];
    var makeSafeRegex = (value) => {
      for (const [token, max] of safeRegexReplacements) {
        value = value.split(`${token}*`).join(`${token}{0,${max}}`).split(`${token}+`).join(`${token}{1,${max}}`);
      }
      return value;
    };
    var createToken = (name, value, isGlobal) => {
      const safe = makeSafeRegex(value);
      const index2 = R++;
      debug(name, index2, value);
      t[name] = index2;
      src[index2] = value;
      safeSrc[index2] = safe;
      re[index2] = new RegExp(value, isGlobal ? "g" : void 0);
      safeRe[index2] = new RegExp(safe, isGlobal ? "g" : void 0);
    };
    createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
    createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
    createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
    createToken("MAINVERSION", `(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})`);
    createToken("MAINVERSIONLOOSE", `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASEIDENTIFIER", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIER]})`);
    createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASE", `(?:-(${src[t.PRERELEASEIDENTIFIER]}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`);
    createToken("PRERELEASELOOSE", `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
    createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
    createToken("BUILD", `(?:\\+(${src[t.BUILDIDENTIFIER]}(?:\\.${src[t.BUILDIDENTIFIER]})*))`);
    createToken("FULLPLAIN", `v?${src[t.MAINVERSION]}${src[t.PRERELEASE]}?${src[t.BUILD]}?`);
    createToken("FULL", `^${src[t.FULLPLAIN]}$`);
    createToken("LOOSEPLAIN", `[v=\\s]*${src[t.MAINVERSIONLOOSE]}${src[t.PRERELEASELOOSE]}?${src[t.BUILD]}?`);
    createToken("LOOSE", `^${src[t.LOOSEPLAIN]}$`);
    createToken("GTLT", "((?:<|>)?=?)");
    createToken("XRANGEIDENTIFIERLOOSE", `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
    createToken("XRANGEIDENTIFIER", `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`);
    createToken("XRANGEPLAIN", `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:${src[t.PRERELEASE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:${src[t.PRERELEASELOOSE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`);
    createToken("XRANGELOOSE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COERCEPLAIN", `${"(^|[^\\d])(\\d{1,"}${MAX_SAFE_COMPONENT_LENGTH}})(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`);
    createToken("COERCE", `${src[t.COERCEPLAIN]}(?:$|[^\\d])`);
    createToken("COERCEFULL", src[t.COERCEPLAIN] + `(?:${src[t.PRERELEASE]})?(?:${src[t.BUILD]})?(?:$|[^\\d])`);
    createToken("COERCERTL", src[t.COERCE], true);
    createToken("COERCERTLFULL", src[t.COERCEFULL], true);
    createToken("LONETILDE", "(?:~>?)");
    createToken("TILDETRIM", `(\\s*)${src[t.LONETILDE]}\\s+`, true);
    exports.tildeTrimReplace = "$1~";
    createToken("TILDE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`);
    createToken("TILDELOOSE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("LONECARET", "(?:\\^)");
    createToken("CARETTRIM", `(\\s*)${src[t.LONECARET]}\\s+`, true);
    exports.caretTrimReplace = "$1^";
    createToken("CARET", `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`);
    createToken("CARETLOOSE", `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COMPARATORLOOSE", `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`);
    createToken("COMPARATOR", `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`);
    createToken("COMPARATORTRIM", `(\\s*)${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true);
    exports.comparatorTrimReplace = "$1$2$3";
    createToken("HYPHENRANGE", `^\\s*(${src[t.XRANGEPLAIN]})\\s+-\\s+(${src[t.XRANGEPLAIN]})\\s*$`);
    createToken("HYPHENRANGELOOSE", `^\\s*(${src[t.XRANGEPLAINLOOSE]})\\s+-\\s+(${src[t.XRANGEPLAINLOOSE]})\\s*$`);
    createToken("STAR", "(<|>)?=?\\s*\\*");
    createToken("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$");
    createToken("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
  }
});

// build/plugin/symbia-imagine/node_modules/semver/internal/parse-options.js
var require_parse_options = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/internal/parse-options.js"(exports, module) {
    "use strict";
    var looseOption = Object.freeze({ loose: true });
    var emptyOpts = Object.freeze({});
    var parseOptions = (options) => {
      if (!options) {
        return emptyOpts;
      }
      if (typeof options !== "object") {
        return looseOption;
      }
      return options;
    };
    module.exports = parseOptions;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/internal/identifiers.js
var require_identifiers = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/internal/identifiers.js"(exports, module) {
    "use strict";
    var numeric = /^[0-9]+$/;
    var compareIdentifiers = (a, b) => {
      if (typeof a === "number" && typeof b === "number") {
        return a === b ? 0 : a < b ? -1 : 1;
      }
      const anum = numeric.test(a);
      const bnum = numeric.test(b);
      if (anum && bnum) {
        a = +a;
        b = +b;
      }
      return a === b ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b ? -1 : 1;
    };
    var rcompareIdentifiers = (a, b) => compareIdentifiers(b, a);
    module.exports = {
      compareIdentifiers,
      rcompareIdentifiers
    };
  }
});

// build/plugin/symbia-imagine/node_modules/semver/classes/semver.js
var require_semver = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/classes/semver.js"(exports, module) {
    "use strict";
    var debug = require_debug();
    var { MAX_LENGTH, MAX_SAFE_INTEGER } = require_constants();
    var { safeRe: re, t } = require_re();
    var parseOptions = require_parse_options();
    var { compareIdentifiers } = require_identifiers();
    var isPrereleaseIdentifier = (prerelease, identifier) => {
      const identifiers = identifier.split(".");
      if (identifiers.length > prerelease.length) {
        return false;
      }
      for (let i = 0; i < identifiers.length; i++) {
        if (compareIdentifiers(prerelease[i], identifiers[i]) !== 0) {
          return false;
        }
      }
      return true;
    };
    var SemVer = class _SemVer {
      constructor(version, options) {
        options = parseOptions(options);
        if (version instanceof _SemVer) {
          if (version.loose === !!options.loose && version.includePrerelease === !!options.includePrerelease) {
            return version;
          } else {
            version = version.version;
          }
        } else if (typeof version !== "string") {
          throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version}".`);
        }
        if (version.length > MAX_LENGTH) {
          throw new TypeError(
            `version is longer than ${MAX_LENGTH} characters`
          );
        }
        debug("SemVer", version, options);
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        const m = version.trim().match(options.loose ? re[t.LOOSE] : re[t.FULL]);
        if (!m) {
          throw new TypeError(`Invalid Version: ${version}`);
        }
        this.raw = version;
        this.major = +m[1];
        this.minor = +m[2];
        this.patch = +m[3];
        if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
          throw new TypeError("Invalid major version");
        }
        if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
          throw new TypeError("Invalid minor version");
        }
        if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
          throw new TypeError("Invalid patch version");
        }
        if (!m[4]) {
          this.prerelease = [];
        } else {
          this.prerelease = m[4].split(".").map((id) => {
            if (/^[0-9]+$/.test(id)) {
              const num = +id;
              if (num >= 0 && num < MAX_SAFE_INTEGER) {
                return num;
              }
            }
            return id;
          });
        }
        this.build = m[5] ? m[5].split(".") : [];
        this.format();
      }
      format() {
        this.version = `${this.major}.${this.minor}.${this.patch}`;
        if (this.prerelease.length) {
          this.version += `-${this.prerelease.join(".")}`;
        }
        return this.version;
      }
      toString() {
        return this.version;
      }
      compare(other) {
        debug("SemVer.compare", this.version, this.options, other);
        if (!(other instanceof _SemVer)) {
          if (typeof other === "string" && other === this.version) {
            return 0;
          }
          other = new _SemVer(other, this.options);
        }
        if (other.version === this.version) {
          return 0;
        }
        return this.compareMain(other) || this.comparePre(other);
      }
      compareMain(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.major < other.major) {
          return -1;
        }
        if (this.major > other.major) {
          return 1;
        }
        if (this.minor < other.minor) {
          return -1;
        }
        if (this.minor > other.minor) {
          return 1;
        }
        if (this.patch < other.patch) {
          return -1;
        }
        if (this.patch > other.patch) {
          return 1;
        }
        return 0;
      }
      comparePre(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.prerelease.length && !other.prerelease.length) {
          return -1;
        } else if (!this.prerelease.length && other.prerelease.length) {
          return 1;
        } else if (!this.prerelease.length && !other.prerelease.length) {
          return 0;
        }
        let i = 0;
        do {
          const a = this.prerelease[i];
          const b = other.prerelease[i];
          debug("prerelease compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      compareBuild(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        let i = 0;
        do {
          const a = this.build[i];
          const b = other.build[i];
          debug("build compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      // preminor will bump the version up to the next minor release, and immediately
      // down to pre-release. premajor and prepatch work the same way.
      inc(release, identifier, identifierBase) {
        if (release.startsWith("pre")) {
          if (!identifier && identifierBase === false) {
            throw new Error("invalid increment argument: identifier is empty");
          }
          if (identifier) {
            const match = `-${identifier}`.match(this.options.loose ? re[t.PRERELEASELOOSE] : re[t.PRERELEASE]);
            if (!match || match[1] !== identifier) {
              throw new Error(`invalid identifier: ${identifier}`);
            }
          }
        }
        switch (release) {
          case "premajor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor = 0;
            this.major++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "preminor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "prepatch":
            this.prerelease.length = 0;
            this.inc("patch", identifier, identifierBase);
            this.inc("pre", identifier, identifierBase);
            break;
          // If the input is a non-prerelease version, this acts the same as
          // prepatch.
          case "prerelease":
            if (this.prerelease.length === 0) {
              this.inc("patch", identifier, identifierBase);
            }
            this.inc("pre", identifier, identifierBase);
            break;
          case "release":
            if (this.prerelease.length === 0) {
              throw new Error(`version ${this.raw} is not a prerelease`);
            }
            this.prerelease.length = 0;
            break;
          case "major":
            if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) {
              this.major++;
            }
            this.minor = 0;
            this.patch = 0;
            this.prerelease = [];
            break;
          case "minor":
            if (this.patch !== 0 || this.prerelease.length === 0) {
              this.minor++;
            }
            this.patch = 0;
            this.prerelease = [];
            break;
          case "patch":
            if (this.prerelease.length === 0) {
              this.patch++;
            }
            this.prerelease = [];
            break;
          // This probably shouldn't be used publicly.
          // 1.0.0 'pre' would become 1.0.0-0 which is the wrong direction.
          case "pre": {
            const base = Number(identifierBase) ? 1 : 0;
            if (this.prerelease.length === 0) {
              this.prerelease = [base];
            } else {
              let i = this.prerelease.length;
              while (--i >= 0) {
                if (typeof this.prerelease[i] === "number") {
                  this.prerelease[i]++;
                  i = -2;
                }
              }
              if (i === -1) {
                if (identifier === this.prerelease.join(".") && identifierBase === false) {
                  throw new Error("invalid increment argument: identifier already exists");
                }
                this.prerelease.push(base);
              }
            }
            if (identifier) {
              let prerelease = [identifier, base];
              if (identifierBase === false) {
                prerelease = [identifier];
              }
              if (isPrereleaseIdentifier(this.prerelease, identifier)) {
                const prereleaseBase = this.prerelease[identifier.split(".").length];
                if (isNaN(prereleaseBase)) {
                  this.prerelease = prerelease;
                }
              } else {
                this.prerelease = prerelease;
              }
            }
            break;
          }
          default:
            throw new Error(`invalid increment argument: ${release}`);
        }
        this.raw = this.format();
        if (this.build.length) {
          this.raw += `+${this.build.join(".")}`;
        }
        return this;
      }
    };
    module.exports = SemVer;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/parse.js
var require_parse = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/parse.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var parse = (version, options, throwErrors = false) => {
      if (version instanceof SemVer) {
        return version;
      }
      try {
        return new SemVer(version, options);
      } catch (er) {
        if (!throwErrors) {
          return null;
        }
        throw er;
      }
    };
    module.exports = parse;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/valid.js
var require_valid = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/valid.js"(exports, module) {
    "use strict";
    var parse = require_parse();
    var valid = (version, options) => {
      const v = parse(version, options);
      return v ? v.version : null;
    };
    module.exports = valid;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/clean.js
var require_clean = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/clean.js"(exports, module) {
    "use strict";
    var parse = require_parse();
    var clean = (version, options) => {
      const s = parse(version.trim().replace(/^[=v]+/, ""), options);
      return s ? s.version : null;
    };
    module.exports = clean;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/inc.js
var require_inc = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/inc.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var inc = (version, release, options, identifier, identifierBase) => {
      if (typeof options === "string") {
        identifierBase = identifier;
        identifier = options;
        options = void 0;
      }
      try {
        return new SemVer(
          version instanceof SemVer ? version.version : version,
          options
        ).inc(release, identifier, identifierBase).version;
      } catch (er) {
        return null;
      }
    };
    module.exports = inc;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/diff.js
var require_diff = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/diff.js"(exports, module) {
    "use strict";
    var parse = require_parse();
    var diff = (version1, version2) => {
      const v1 = parse(version1, null, true);
      const v2 = parse(version2, null, true);
      const comparison = v1.compare(v2);
      if (comparison === 0) {
        return null;
      }
      const v1Higher = comparison > 0;
      const highVersion = v1Higher ? v1 : v2;
      const lowVersion = v1Higher ? v2 : v1;
      const highHasPre = !!highVersion.prerelease.length;
      const lowHasPre = !!lowVersion.prerelease.length;
      if (lowHasPre && !highHasPre) {
        if (!lowVersion.patch && !lowVersion.minor) {
          return "major";
        }
        if (lowVersion.compareMain(highVersion) === 0) {
          if (lowVersion.minor && !lowVersion.patch) {
            return "minor";
          }
          return "patch";
        }
      }
      const prefix = highHasPre ? "pre" : "";
      if (v1.major !== v2.major) {
        return prefix + "major";
      }
      if (v1.minor !== v2.minor) {
        return prefix + "minor";
      }
      if (v1.patch !== v2.patch) {
        return prefix + "patch";
      }
      return "prerelease";
    };
    module.exports = diff;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/major.js
var require_major = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/major.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var major = (a, loose) => new SemVer(a, loose).major;
    module.exports = major;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/minor.js
var require_minor = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/minor.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var minor = (a, loose) => new SemVer(a, loose).minor;
    module.exports = minor;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/patch.js
var require_patch = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/patch.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var patch = (a, loose) => new SemVer(a, loose).patch;
    module.exports = patch;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/prerelease.js
var require_prerelease = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/prerelease.js"(exports, module) {
    "use strict";
    var parse = require_parse();
    var prerelease = (version, options) => {
      const parsed = parse(version, options);
      return parsed && parsed.prerelease.length ? parsed.prerelease : null;
    };
    module.exports = prerelease;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/compare.js
var require_compare = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/compare.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var compare = (a, b, loose) => new SemVer(a, loose).compare(new SemVer(b, loose));
    module.exports = compare;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/rcompare.js
var require_rcompare = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/rcompare.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var rcompare = (a, b, loose) => compare(b, a, loose);
    module.exports = rcompare;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/compare-loose.js
var require_compare_loose = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/compare-loose.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var compareLoose = (a, b) => compare(a, b, true);
    module.exports = compareLoose;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/compare-build.js
var require_compare_build = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/compare-build.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var compareBuild = (a, b, loose) => {
      const versionA = new SemVer(a, loose);
      const versionB = new SemVer(b, loose);
      return versionA.compare(versionB) || versionA.compareBuild(versionB);
    };
    module.exports = compareBuild;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/sort.js
var require_sort = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/sort.js"(exports, module) {
    "use strict";
    var compareBuild = require_compare_build();
    var sort = (list, loose) => list.sort((a, b) => compareBuild(a, b, loose));
    module.exports = sort;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/rsort.js
var require_rsort = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/rsort.js"(exports, module) {
    "use strict";
    var compareBuild = require_compare_build();
    var rsort = (list, loose) => list.sort((a, b) => compareBuild(b, a, loose));
    module.exports = rsort;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/gt.js
var require_gt = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/gt.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var gt = (a, b, loose) => compare(a, b, loose) > 0;
    module.exports = gt;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/lt.js
var require_lt = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/lt.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var lt = (a, b, loose) => compare(a, b, loose) < 0;
    module.exports = lt;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/eq.js
var require_eq = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/eq.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var eq2 = (a, b, loose) => compare(a, b, loose) === 0;
    module.exports = eq2;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/neq.js
var require_neq = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/neq.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var neq = (a, b, loose) => compare(a, b, loose) !== 0;
    module.exports = neq;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/gte.js
var require_gte = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/gte.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var gte = (a, b, loose) => compare(a, b, loose) >= 0;
    module.exports = gte;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/lte.js
var require_lte = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/lte.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var lte = (a, b, loose) => compare(a, b, loose) <= 0;
    module.exports = lte;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/cmp.js
var require_cmp = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/cmp.js"(exports, module) {
    "use strict";
    var eq2 = require_eq();
    var neq = require_neq();
    var gt = require_gt();
    var gte = require_gte();
    var lt = require_lt();
    var lte = require_lte();
    var cmp = (a, op, b, loose) => {
      switch (op) {
        case "===":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a === b;
        case "!==":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a !== b;
        case "":
        case "=":
        case "==":
          return eq2(a, b, loose);
        case "!=":
          return neq(a, b, loose);
        case ">":
          return gt(a, b, loose);
        case ">=":
          return gte(a, b, loose);
        case "<":
          return lt(a, b, loose);
        case "<=":
          return lte(a, b, loose);
        default:
          throw new TypeError(`Invalid operator: ${op}`);
      }
    };
    module.exports = cmp;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/coerce.js
var require_coerce = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/coerce.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var parse = require_parse();
    var { safeRe: re, t } = require_re();
    var coerce = (version, options) => {
      if (version instanceof SemVer) {
        return version;
      }
      if (typeof version === "number") {
        version = String(version);
      }
      if (typeof version !== "string") {
        return null;
      }
      options = options || {};
      let match = null;
      if (!options.rtl) {
        match = version.match(options.includePrerelease ? re[t.COERCEFULL] : re[t.COERCE]);
      } else {
        const coerceRtlRegex = options.includePrerelease ? re[t.COERCERTLFULL] : re[t.COERCERTL];
        let next;
        while ((next = coerceRtlRegex.exec(version)) && (!match || match.index + match[0].length !== version.length)) {
          if (!match || next.index + next[0].length !== match.index + match[0].length) {
            match = next;
          }
          coerceRtlRegex.lastIndex = next.index + next[1].length + next[2].length;
        }
        coerceRtlRegex.lastIndex = -1;
      }
      if (match === null) {
        return null;
      }
      const major = match[2];
      const minor = match[3] || "0";
      const patch = match[4] || "0";
      const prerelease = options.includePrerelease && match[5] ? `-${match[5]}` : "";
      const build = options.includePrerelease && match[6] ? `+${match[6]}` : "";
      return parse(`${major}.${minor}.${patch}${prerelease}${build}`, options);
    };
    module.exports = coerce;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/truncate.js
var require_truncate = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/truncate.js"(exports, module) {
    "use strict";
    var parse = require_parse();
    var constants = require_constants();
    var SemVer = require_semver();
    var truncate = (version, truncation, options) => {
      if (!constants.RELEASE_TYPES.includes(truncation)) {
        return null;
      }
      const clonedVersion = cloneInputVersion(version, options);
      return clonedVersion && doTruncation(clonedVersion, truncation);
    };
    var cloneInputVersion = (version, options) => {
      const versionStringToParse = version instanceof SemVer ? version.version : version;
      return parse(versionStringToParse, options);
    };
    var doTruncation = (version, truncation) => {
      if (isPrerelease(truncation)) {
        return version.version;
      }
      version.prerelease = [];
      switch (truncation) {
        case "major":
          version.minor = 0;
          version.patch = 0;
          break;
        case "minor":
          version.patch = 0;
          break;
      }
      return version.format();
    };
    var isPrerelease = (type) => {
      return type.startsWith("pre");
    };
    module.exports = truncate;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/internal/lrucache.js
var require_lrucache = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/internal/lrucache.js"(exports, module) {
    "use strict";
    var LRUCache = class {
      constructor() {
        this.max = 1e3;
        this.map = /* @__PURE__ */ new Map();
      }
      get(key) {
        const value = this.map.get(key);
        if (value === void 0) {
          return void 0;
        } else {
          this.map.delete(key);
          this.map.set(key, value);
          return value;
        }
      }
      delete(key) {
        return this.map.delete(key);
      }
      set(key, value) {
        const deleted = this.delete(key);
        if (!deleted && value !== void 0) {
          if (this.map.size >= this.max) {
            const firstKey = this.map.keys().next().value;
            this.delete(firstKey);
          }
          this.map.set(key, value);
        }
        return this;
      }
    };
    module.exports = LRUCache;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/classes/range.js
var require_range = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/classes/range.js"(exports, module) {
    "use strict";
    var SPACE_CHARACTERS = /\s+/g;
    var Range = class _Range {
      constructor(range, options) {
        options = parseOptions(options);
        if (range instanceof _Range) {
          if (range.loose === !!options.loose && range.includePrerelease === !!options.includePrerelease) {
            return range;
          } else {
            return new _Range(range.raw, options);
          }
        }
        if (range instanceof Comparator) {
          this.raw = range.value;
          this.set = [[range]];
          this.formatted = void 0;
          return this;
        }
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        this.raw = range.trim().replace(SPACE_CHARACTERS, " ");
        this.set = this.raw.split("||").map((r) => this.parseRange(r.trim())).filter((c) => c.length);
        if (!this.set.length) {
          throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
        }
        if (this.set.length > 1) {
          const first = this.set[0];
          this.set = this.set.filter((c) => !isNullSet(c[0]));
          if (this.set.length === 0) {
            this.set = [first];
          } else if (this.set.length > 1) {
            for (const c of this.set) {
              if (c.length === 1 && isAny(c[0])) {
                this.set = [c];
                break;
              }
            }
          }
        }
        this.formatted = void 0;
      }
      get range() {
        if (this.formatted === void 0) {
          this.formatted = "";
          for (let i = 0; i < this.set.length; i++) {
            if (i > 0) {
              this.formatted += "||";
            }
            const comps = this.set[i];
            for (let k = 0; k < comps.length; k++) {
              if (k > 0) {
                this.formatted += " ";
              }
              this.formatted += comps[k].toString().trim();
            }
          }
        }
        return this.formatted;
      }
      format() {
        return this.range;
      }
      toString() {
        return this.range;
      }
      parseRange(range) {
        range = range.replace(BUILDSTRIPRE, "");
        const memoOpts = (this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) | (this.options.loose && FLAG_LOOSE);
        const memoKey = memoOpts + ":" + range;
        const cached = cache.get(memoKey);
        if (cached) {
          return cached;
        }
        const loose = this.options.loose;
        const hr = loose ? re[t.HYPHENRANGELOOSE] : re[t.HYPHENRANGE];
        range = range.replace(hr, hyphenReplace(this.options.includePrerelease));
        debug("hyphen replace", range);
        range = range.replace(re[t.COMPARATORTRIM], comparatorTrimReplace);
        debug("comparator trim", range);
        range = range.replace(re[t.TILDETRIM], tildeTrimReplace);
        debug("tilde trim", range);
        range = range.replace(re[t.CARETTRIM], caretTrimReplace);
        debug("caret trim", range);
        let rangeList = range.split(" ").map((comp) => parseComparator(comp, this.options)).join(" ").split(/\s+/).map((comp) => replaceGTE0(comp, this.options));
        if (loose) {
          rangeList = rangeList.filter((comp) => {
            debug("loose invalid filter", comp, this.options);
            return !!comp.match(re[t.COMPARATORLOOSE]);
          });
        }
        debug("range list", rangeList);
        const rangeMap = /* @__PURE__ */ new Map();
        const comparators = rangeList.map((comp) => new Comparator(comp, this.options));
        for (const comp of comparators) {
          if (isNullSet(comp)) {
            return [comp];
          }
          rangeMap.set(comp.value, comp);
        }
        if (rangeMap.size > 1 && rangeMap.has("")) {
          rangeMap.delete("");
        }
        const result = [...rangeMap.values()];
        cache.set(memoKey, result);
        return result;
      }
      intersects(range, options) {
        if (!(range instanceof _Range)) {
          throw new TypeError("a Range is required");
        }
        return this.set.some((thisComparators) => {
          return isSatisfiable(thisComparators, options) && range.set.some((rangeComparators) => {
            return isSatisfiable(rangeComparators, options) && thisComparators.every((thisComparator) => {
              return rangeComparators.every((rangeComparator) => {
                return thisComparator.intersects(rangeComparator, options);
              });
            });
          });
        });
      }
      // if ANY of the sets match ALL of its comparators, then pass
      test(version) {
        if (!version) {
          return false;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        for (let i = 0; i < this.set.length; i++) {
          if (testSet(this.set[i], version, this.options)) {
            return true;
          }
        }
        return false;
      }
    };
    module.exports = Range;
    var LRU = require_lrucache();
    var cache = new LRU();
    var parseOptions = require_parse_options();
    var Comparator = require_comparator();
    var debug = require_debug();
    var SemVer = require_semver();
    var {
      safeRe: re,
      src,
      t,
      comparatorTrimReplace,
      tildeTrimReplace,
      caretTrimReplace
    } = require_re();
    var { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = require_constants();
    var BUILDSTRIPRE = new RegExp(src[t.BUILD], "g");
    var isNullSet = (c) => c.value === "<0.0.0-0";
    var isAny = (c) => c.value === "";
    var isSatisfiable = (comparators, options) => {
      let result = true;
      const remainingComparators = comparators.slice();
      let testComparator = remainingComparators.pop();
      while (result && remainingComparators.length) {
        result = remainingComparators.every((otherComparator) => {
          return testComparator.intersects(otherComparator, options);
        });
        testComparator = remainingComparators.pop();
      }
      return result;
    };
    var parseComparator = (comp, options) => {
      comp = comp.replace(re[t.BUILD], "");
      debug("comp", comp, options);
      comp = replaceCarets(comp, options);
      debug("caret", comp);
      comp = replaceTildes(comp, options);
      debug("tildes", comp);
      comp = replaceXRanges(comp, options);
      debug("xrange", comp);
      comp = replaceStars(comp, options);
      debug("stars", comp);
      return comp;
    };
    var isX = (id) => !id || id.toLowerCase() === "x" || id === "*";
    var invalidXRangeOrder = (M, m, p) => isX(M) && !isX(m) || isX(m) && p && !isX(p);
    var replaceTildes = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceTilde(c, options)).join(" ");
    };
    var replaceTilde = (comp, options) => {
      const r = options.loose ? re[t.TILDELOOSE] : re[t.TILDE];
      const z = options.includePrerelease ? "-0" : "";
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("tilde", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
        } else if (pr) {
          debug("replaceTilde pr", pr);
          ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
        } else {
          ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
        }
        debug("tilde return", ret);
        return ret;
      });
    };
    var replaceCarets = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceCaret(c, options)).join(" ");
    };
    var replaceCaret = (comp, options) => {
      debug("caret", comp, options);
      const r = options.loose ? re[t.CARETLOOSE] : re[t.CARET];
      const z = options.includePrerelease ? "-0" : "";
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("caret", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          if (M === "0") {
            ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
          } else {
            ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
          }
        } else if (pr) {
          debug("replaceCaret pr", pr);
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p}-${pr} <${+M + 1}.0.0-0`;
          }
        } else {
          debug("no pr");
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p} <${+M + 1}.0.0-0`;
          }
        }
        debug("caret return", ret);
        return ret;
      });
    };
    var replaceXRanges = (comp, options) => {
      debug("replaceXRanges", comp, options);
      return comp.split(/\s+/).map((c) => replaceXRange(c, options)).join(" ");
    };
    var replaceXRange = (comp, options) => {
      comp = comp.trim();
      const r = options.loose ? re[t.XRANGELOOSE] : re[t.XRANGE];
      return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
        debug("xRange", comp, ret, gtlt, M, m, p, pr);
        if (invalidXRangeOrder(M, m, p)) {
          return comp;
        }
        const xM = isX(M);
        const xm = xM || isX(m);
        const xp = xm || isX(p);
        const anyX = xp;
        if (gtlt === "=" && anyX) {
          gtlt = "";
        }
        pr = options.includePrerelease ? "-0" : "";
        if (xM) {
          if (gtlt === ">" || gtlt === "<") {
            ret = "<0.0.0-0";
          } else {
            ret = "*";
          }
        } else if (gtlt && anyX) {
          if (xm) {
            m = 0;
          }
          p = 0;
          if (gtlt === ">") {
            gtlt = ">=";
            if (xm) {
              M = +M + 1;
              m = 0;
              p = 0;
            } else {
              m = +m + 1;
              p = 0;
            }
          } else if (gtlt === "<=") {
            gtlt = "<";
            if (xm) {
              M = +M + 1;
            } else {
              m = +m + 1;
            }
          }
          if (gtlt === "<") {
            pr = "-0";
          }
          ret = `${gtlt + M}.${m}.${p}${pr}`;
        } else if (xm) {
          ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
        } else if (xp) {
          ret = `>=${M}.${m}.0${pr} <${M}.${+m + 1}.0-0`;
        }
        debug("xRange return", ret);
        return ret;
      });
    };
    var replaceStars = (comp, options) => {
      debug("replaceStars", comp, options);
      return comp.trim().replace(re[t.STAR], "");
    };
    var replaceGTE0 = (comp, options) => {
      debug("replaceGTE0", comp, options);
      return comp.trim().replace(re[options.includePrerelease ? t.GTE0PRE : t.GTE0], "");
    };
    var hyphenReplace = (incPr) => ($0, from, fM, fm, fp, fpr, fb, to, tM, tm, tp, tpr) => {
      if (isX(fM)) {
        from = "";
      } else if (isX(fm)) {
        from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
      } else if (isX(fp)) {
        from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
      } else if (fpr) {
        from = `>=${from}`;
      } else {
        from = `>=${from}${incPr ? "-0" : ""}`;
      }
      if (isX(tM)) {
        to = "";
      } else if (isX(tm)) {
        to = `<${+tM + 1}.0.0-0`;
      } else if (isX(tp)) {
        to = `<${tM}.${+tm + 1}.0-0`;
      } else if (tpr) {
        to = `<=${tM}.${tm}.${tp}-${tpr}`;
      } else if (incPr) {
        to = `<${tM}.${tm}.${+tp + 1}-0`;
      } else {
        to = `<=${to}`;
      }
      return `${from} ${to}`.trim();
    };
    var testSet = (set, version, options) => {
      for (let i = 0; i < set.length; i++) {
        if (!set[i].test(version)) {
          return false;
        }
      }
      if (version.prerelease.length && !options.includePrerelease) {
        for (let i = 0; i < set.length; i++) {
          debug(set[i].semver);
          if (set[i].semver === Comparator.ANY) {
            continue;
          }
          if (set[i].semver.prerelease.length > 0) {
            const allowed = set[i].semver;
            if (allowed.major === version.major && allowed.minor === version.minor && allowed.patch === version.patch) {
              return true;
            }
          }
        }
        return false;
      }
      return true;
    };
  }
});

// build/plugin/symbia-imagine/node_modules/semver/classes/comparator.js
var require_comparator = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/classes/comparator.js"(exports, module) {
    "use strict";
    var ANY = Symbol("SemVer ANY");
    var Comparator = class _Comparator {
      static get ANY() {
        return ANY;
      }
      constructor(comp, options) {
        options = parseOptions(options);
        if (comp instanceof _Comparator) {
          if (comp.loose === !!options.loose) {
            return comp;
          } else {
            comp = comp.value;
          }
        }
        comp = comp.trim().split(/\s+/).join(" ");
        debug("comparator", comp, options);
        this.options = options;
        this.loose = !!options.loose;
        this.parse(comp);
        if (this.semver === ANY) {
          this.value = "";
        } else {
          this.value = this.operator + this.semver.version;
        }
        debug("comp", this);
      }
      parse(comp) {
        const r = this.options.loose ? re[t.COMPARATORLOOSE] : re[t.COMPARATOR];
        const m = comp.match(r);
        if (!m) {
          throw new TypeError(`Invalid comparator: ${comp}`);
        }
        this.operator = m[1] !== void 0 ? m[1] : "";
        if (this.operator === "=") {
          this.operator = "";
        }
        if (!m[2]) {
          this.semver = ANY;
        } else {
          this.semver = new SemVer(m[2], this.options.loose);
        }
      }
      toString() {
        return this.value;
      }
      test(version) {
        debug("Comparator.test", version, this.options.loose);
        if (this.semver === ANY || version === ANY) {
          return true;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        return cmp(version, this.operator, this.semver, this.options);
      }
      intersects(comp, options) {
        if (!(comp instanceof _Comparator)) {
          throw new TypeError("a Comparator is required");
        }
        if (this.operator === "") {
          if (this.value === "") {
            return true;
          }
          return new Range(comp.value, options).test(this.value);
        } else if (comp.operator === "") {
          if (comp.value === "") {
            return true;
          }
          return new Range(this.value, options).test(comp.semver);
        }
        options = parseOptions(options);
        if (options.includePrerelease && (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")) {
          return false;
        }
        if (!options.includePrerelease && (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))) {
          return false;
        }
        if (this.operator.startsWith(">") && comp.operator.startsWith(">")) {
          return true;
        }
        if (this.operator.startsWith("<") && comp.operator.startsWith("<")) {
          return true;
        }
        if (this.semver.version === comp.semver.version && this.operator.includes("=") && comp.operator.includes("=")) {
          return true;
        }
        if (cmp(this.semver, "<", comp.semver, options) && this.operator.startsWith(">") && comp.operator.startsWith("<")) {
          return true;
        }
        if (cmp(this.semver, ">", comp.semver, options) && this.operator.startsWith("<") && comp.operator.startsWith(">")) {
          return true;
        }
        return false;
      }
    };
    module.exports = Comparator;
    var parseOptions = require_parse_options();
    var { safeRe: re, t } = require_re();
    var cmp = require_cmp();
    var debug = require_debug();
    var SemVer = require_semver();
    var Range = require_range();
  }
});

// build/plugin/symbia-imagine/node_modules/semver/functions/satisfies.js
var require_satisfies = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/functions/satisfies.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var satisfies = (version, range, options) => {
      try {
        range = new Range(range, options);
      } catch (er) {
        return false;
      }
      return range.test(version);
    };
    module.exports = satisfies;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/ranges/to-comparators.js
var require_to_comparators = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/ranges/to-comparators.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var toComparators = (range, options) => new Range(range, options).set.map((comp) => comp.map((c) => c.value).join(" ").trim().split(" "));
    module.exports = toComparators;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/ranges/max-satisfying.js
var require_max_satisfying = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/ranges/max-satisfying.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var maxSatisfying = (versions, range, options) => {
      let max = null;
      let maxSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!max || maxSV.compare(v) === -1) {
            max = v;
            maxSV = new SemVer(max, options);
          }
        }
      });
      return max;
    };
    module.exports = maxSatisfying;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/ranges/min-satisfying.js
var require_min_satisfying = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/ranges/min-satisfying.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var minSatisfying = (versions, range, options) => {
      let min = null;
      let minSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!min || minSV.compare(v) === 1) {
            min = v;
            minSV = new SemVer(min, options);
          }
        }
      });
      return min;
    };
    module.exports = minSatisfying;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/ranges/min-version.js
var require_min_version = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/ranges/min-version.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var gt = require_gt();
    var minVersion = (range, loose) => {
      range = new Range(range, loose);
      let minver = new SemVer("0.0.0");
      if (range.test(minver)) {
        return minver;
      }
      minver = new SemVer("0.0.0-0");
      if (range.test(minver)) {
        return minver;
      }
      minver = null;
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let setMin = null;
        comparators.forEach((comparator) => {
          const compver = new SemVer(comparator.semver.version);
          switch (comparator.operator) {
            case ">":
              if (compver.prerelease.length === 0) {
                compver.patch++;
              } else {
                compver.prerelease.push(0);
              }
              compver.raw = compver.format();
            /* fallthrough */
            case "":
            case ">=":
              if (!setMin || gt(compver, setMin)) {
                setMin = compver;
              }
              break;
            case "<":
            case "<=":
              break;
            /* istanbul ignore next */
            default:
              throw new Error(`Unexpected operation: ${comparator.operator}`);
          }
        });
        if (setMin && (!minver || gt(minver, setMin))) {
          minver = setMin;
        }
      }
      if (minver && range.test(minver)) {
        return minver;
      }
      return null;
    };
    module.exports = minVersion;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/ranges/valid.js
var require_valid2 = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/ranges/valid.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var validRange = (range, options) => {
      try {
        return new Range(range, options).range || "*";
      } catch (er) {
        return null;
      }
    };
    module.exports = validRange;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/ranges/outside.js
var require_outside = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/ranges/outside.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var Range = require_range();
    var satisfies = require_satisfies();
    var gt = require_gt();
    var lt = require_lt();
    var lte = require_lte();
    var gte = require_gte();
    var outside = (version, range, hilo, options) => {
      version = new SemVer(version, options);
      range = new Range(range, options);
      let gtfn, ltefn, ltfn, comp, ecomp;
      switch (hilo) {
        case ">":
          gtfn = gt;
          ltefn = lte;
          ltfn = lt;
          comp = ">";
          ecomp = ">=";
          break;
        case "<":
          gtfn = lt;
          ltefn = gte;
          ltfn = gt;
          comp = "<";
          ecomp = "<=";
          break;
        default:
          throw new TypeError('Must provide a hilo val of "<" or ">"');
      }
      if (satisfies(version, range, options)) {
        return false;
      }
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let high = null;
        let low = null;
        comparators.forEach((comparator) => {
          if (comparator.semver === ANY) {
            comparator = new Comparator(">=0.0.0");
          }
          high = high || comparator;
          low = low || comparator;
          if (gtfn(comparator.semver, high.semver, options)) {
            high = comparator;
          } else if (ltfn(comparator.semver, low.semver, options)) {
            low = comparator;
          }
        });
        if (high.operator === comp || high.operator === ecomp) {
          return false;
        }
        if ((!low.operator || low.operator === comp) && ltefn(version, low.semver)) {
          return false;
        } else if (low.operator === ecomp && ltfn(version, low.semver)) {
          return false;
        }
      }
      return true;
    };
    module.exports = outside;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/ranges/gtr.js
var require_gtr = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/ranges/gtr.js"(exports, module) {
    "use strict";
    var outside = require_outside();
    var gtr = (version, range, options) => outside(version, range, ">", options);
    module.exports = gtr;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/ranges/ltr.js
var require_ltr = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/ranges/ltr.js"(exports, module) {
    "use strict";
    var outside = require_outside();
    var ltr = (version, range, options) => outside(version, range, "<", options);
    module.exports = ltr;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/ranges/intersects.js
var require_intersects = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/ranges/intersects.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var intersects = (r1, r2, options) => {
      r1 = new Range(r1, options);
      r2 = new Range(r2, options);
      return r1.intersects(r2, options);
    };
    module.exports = intersects;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/ranges/simplify.js
var require_simplify = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/ranges/simplify.js"(exports, module) {
    "use strict";
    var satisfies = require_satisfies();
    var compare = require_compare();
    module.exports = (versions, range, options) => {
      const set = [];
      let first = null;
      let prev = null;
      const v = versions.sort((a, b) => compare(a, b, options));
      for (const version of v) {
        const included = satisfies(version, range, options);
        if (included) {
          prev = version;
          if (!first) {
            first = version;
          }
        } else {
          if (prev) {
            set.push([first, prev]);
          }
          prev = null;
          first = null;
        }
      }
      if (first) {
        set.push([first, null]);
      }
      const ranges = [];
      for (const [min, max] of set) {
        if (min === max) {
          ranges.push(min);
        } else if (!max && min === v[0]) {
          ranges.push("*");
        } else if (!max) {
          ranges.push(`>=${min}`);
        } else if (min === v[0]) {
          ranges.push(`<=${max}`);
        } else {
          ranges.push(`${min} - ${max}`);
        }
      }
      const simplified = ranges.join(" || ");
      const original = typeof range.raw === "string" ? range.raw : String(range);
      return simplified.length < original.length ? simplified : range;
    };
  }
});

// build/plugin/symbia-imagine/node_modules/semver/ranges/subset.js
var require_subset = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/ranges/subset.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var satisfies = require_satisfies();
    var compare = require_compare();
    var subset = (sub, dom, options = {}) => {
      if (sub === dom) {
        return true;
      }
      sub = new Range(sub, options);
      dom = new Range(dom, options);
      let sawNonNull = false;
      OUTER: for (const simpleSub of sub.set) {
        for (const simpleDom of dom.set) {
          const isSub = simpleSubset(simpleSub, simpleDom, options);
          sawNonNull = sawNonNull || isSub !== null;
          if (isSub) {
            continue OUTER;
          }
        }
        if (sawNonNull) {
          return false;
        }
      }
      return true;
    };
    var minimumVersionWithPreRelease = [new Comparator(">=0.0.0-0")];
    var minimumVersion = [new Comparator(">=0.0.0")];
    var simpleSubset = (sub, dom, options) => {
      if (sub === dom) {
        return true;
      }
      if (sub.length === 1 && sub[0].semver === ANY) {
        if (dom.length === 1 && dom[0].semver === ANY) {
          return true;
        } else if (options.includePrerelease) {
          sub = minimumVersionWithPreRelease;
        } else {
          sub = minimumVersion;
        }
      }
      if (dom.length === 1 && dom[0].semver === ANY) {
        if (options.includePrerelease) {
          return true;
        } else {
          dom = minimumVersion;
        }
      }
      const eqSet = /* @__PURE__ */ new Set();
      let gt, lt;
      for (const c of sub) {
        if (c.operator === ">" || c.operator === ">=") {
          gt = higherGT(gt, c, options);
        } else if (c.operator === "<" || c.operator === "<=") {
          lt = lowerLT(lt, c, options);
        } else {
          eqSet.add(c.semver);
        }
      }
      if (eqSet.size > 1) {
        return null;
      }
      let gtltComp;
      if (gt && lt) {
        gtltComp = compare(gt.semver, lt.semver, options);
        if (gtltComp > 0) {
          return null;
        } else if (gtltComp === 0 && (gt.operator !== ">=" || lt.operator !== "<=")) {
          return null;
        }
      }
      for (const eq2 of eqSet) {
        if (gt && !satisfies(eq2, String(gt), options)) {
          return null;
        }
        if (lt && !satisfies(eq2, String(lt), options)) {
          return null;
        }
        for (const c of dom) {
          if (!satisfies(eq2, String(c), options)) {
            return false;
          }
        }
        return true;
      }
      let higher, lower;
      let hasDomLT, hasDomGT;
      let needDomLTPre = lt && !options.includePrerelease && lt.semver.prerelease.length ? lt.semver : false;
      let needDomGTPre = gt && !options.includePrerelease && gt.semver.prerelease.length ? gt.semver : false;
      if (needDomLTPre && needDomLTPre.prerelease.length === 1 && lt.operator === "<" && needDomLTPre.prerelease[0] === 0) {
        needDomLTPre = false;
      }
      for (const c of dom) {
        hasDomGT = hasDomGT || c.operator === ">" || c.operator === ">=";
        hasDomLT = hasDomLT || c.operator === "<" || c.operator === "<=";
        if (gt) {
          if (needDomGTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomGTPre.major && c.semver.minor === needDomGTPre.minor && c.semver.patch === needDomGTPre.patch) {
              needDomGTPre = false;
            }
          }
          if (c.operator === ">" || c.operator === ">=") {
            higher = higherGT(gt, c, options);
            if (higher === c && higher !== gt) {
              return false;
            }
          } else if (gt.operator === ">=" && !c.test(gt.semver)) {
            return false;
          }
        }
        if (lt) {
          if (needDomLTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomLTPre.major && c.semver.minor === needDomLTPre.minor && c.semver.patch === needDomLTPre.patch) {
              needDomLTPre = false;
            }
          }
          if (c.operator === "<" || c.operator === "<=") {
            lower = lowerLT(lt, c, options);
            if (lower === c && lower !== lt) {
              return false;
            }
          } else if (lt.operator === "<=" && !c.test(lt.semver)) {
            return false;
          }
        }
        if (!c.operator && (lt || gt) && gtltComp !== 0) {
          return false;
        }
      }
      if (gt && hasDomLT && !lt && gtltComp !== 0) {
        return false;
      }
      if (lt && hasDomGT && !gt && gtltComp !== 0) {
        return false;
      }
      if (needDomGTPre || needDomLTPre) {
        return false;
      }
      return true;
    };
    var higherGT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare(a.semver, b.semver, options);
      return comp > 0 ? a : comp < 0 ? b : b.operator === ">" && a.operator === ">=" ? b : a;
    };
    var lowerLT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare(a.semver, b.semver, options);
      return comp < 0 ? a : comp > 0 ? b : b.operator === "<" && a.operator === "<=" ? b : a;
    };
    module.exports = subset;
  }
});

// build/plugin/symbia-imagine/node_modules/semver/index.js
var require_semver2 = __commonJS({
  "build/plugin/symbia-imagine/node_modules/semver/index.js"(exports, module) {
    "use strict";
    var internalRe = require_re();
    var constants = require_constants();
    var SemVer = require_semver();
    var identifiers = require_identifiers();
    var parse = require_parse();
    var valid = require_valid();
    var clean = require_clean();
    var inc = require_inc();
    var diff = require_diff();
    var major = require_major();
    var minor = require_minor();
    var patch = require_patch();
    var prerelease = require_prerelease();
    var compare = require_compare();
    var rcompare = require_rcompare();
    var compareLoose = require_compare_loose();
    var compareBuild = require_compare_build();
    var sort = require_sort();
    var rsort = require_rsort();
    var gt = require_gt();
    var lt = require_lt();
    var eq2 = require_eq();
    var neq = require_neq();
    var gte = require_gte();
    var lte = require_lte();
    var cmp = require_cmp();
    var coerce = require_coerce();
    var truncate = require_truncate();
    var Comparator = require_comparator();
    var Range = require_range();
    var satisfies = require_satisfies();
    var toComparators = require_to_comparators();
    var maxSatisfying = require_max_satisfying();
    var minSatisfying = require_min_satisfying();
    var minVersion = require_min_version();
    var validRange = require_valid2();
    var outside = require_outside();
    var gtr = require_gtr();
    var ltr = require_ltr();
    var intersects = require_intersects();
    var simplifyRange = require_simplify();
    var subset = require_subset();
    module.exports = {
      parse,
      valid,
      clean,
      inc,
      diff,
      major,
      minor,
      patch,
      prerelease,
      compare,
      rcompare,
      compareLoose,
      compareBuild,
      sort,
      rsort,
      gt,
      lt,
      eq: eq2,
      neq,
      gte,
      lte,
      cmp,
      coerce,
      truncate,
      Comparator,
      Range,
      satisfies,
      toComparators,
      maxSatisfying,
      minSatisfying,
      minVersion,
      validRange,
      outside,
      gtr,
      ltr,
      intersects,
      simplifyRange,
      subset,
      SemVer,
      re: internalRe.re,
      src: internalRe.src,
      tokens: internalRe.t,
      SEMVER_SPEC_VERSION: constants.SEMVER_SPEC_VERSION,
      RELEASE_TYPES: constants.RELEASE_TYPES,
      compareIdentifiers: identifiers.compareIdentifiers,
      rcompareIdentifiers: identifiers.rcompareIdentifiers
    };
  }
});

// build/plugin/symbia-imagine/node_modules/jsonwebtoken/lib/asymmetricKeyDetailsSupported.js
var require_asymmetricKeyDetailsSupported = __commonJS({
  "build/plugin/symbia-imagine/node_modules/jsonwebtoken/lib/asymmetricKeyDetailsSupported.js"(exports, module) {
    var semver = require_semver2();
    module.exports = semver.satisfies(process.version, ">=15.7.0");
  }
});

// build/plugin/symbia-imagine/node_modules/jsonwebtoken/lib/rsaPssKeyDetailsSupported.js
var require_rsaPssKeyDetailsSupported = __commonJS({
  "build/plugin/symbia-imagine/node_modules/jsonwebtoken/lib/rsaPssKeyDetailsSupported.js"(exports, module) {
    var semver = require_semver2();
    module.exports = semver.satisfies(process.version, ">=16.9.0");
  }
});

// build/plugin/symbia-imagine/node_modules/jsonwebtoken/lib/validateAsymmetricKey.js
var require_validateAsymmetricKey = __commonJS({
  "build/plugin/symbia-imagine/node_modules/jsonwebtoken/lib/validateAsymmetricKey.js"(exports, module) {
    var ASYMMETRIC_KEY_DETAILS_SUPPORTED = require_asymmetricKeyDetailsSupported();
    var RSA_PSS_KEY_DETAILS_SUPPORTED = require_rsaPssKeyDetailsSupported();
    var allowedAlgorithmsForKeys = {
      "ec": ["ES256", "ES384", "ES512"],
      "rsa": ["RS256", "PS256", "RS384", "PS384", "RS512", "PS512"],
      "rsa-pss": ["PS256", "PS384", "PS512"]
    };
    var allowedCurves = {
      ES256: "prime256v1",
      ES384: "secp384r1",
      ES512: "secp521r1"
    };
    module.exports = function(algorithm, key) {
      if (!algorithm || !key) return;
      const keyType = key.asymmetricKeyType;
      if (!keyType) return;
      const allowedAlgorithms = allowedAlgorithmsForKeys[keyType];
      if (!allowedAlgorithms) {
        throw new Error(`Unknown key type "${keyType}".`);
      }
      if (!allowedAlgorithms.includes(algorithm)) {
        throw new Error(`"alg" parameter for "${keyType}" key type must be one of: ${allowedAlgorithms.join(", ")}.`);
      }
      if (ASYMMETRIC_KEY_DETAILS_SUPPORTED) {
        switch (keyType) {
          case "ec":
            const keyCurve = key.asymmetricKeyDetails.namedCurve;
            const allowedCurve = allowedCurves[algorithm];
            if (keyCurve !== allowedCurve) {
              throw new Error(`"alg" parameter "${algorithm}" requires curve "${allowedCurve}".`);
            }
            break;
          case "rsa-pss":
            if (RSA_PSS_KEY_DETAILS_SUPPORTED) {
              const length = parseInt(algorithm.slice(-3), 10);
              const { hashAlgorithm, mgf1HashAlgorithm, saltLength } = key.asymmetricKeyDetails;
              if (hashAlgorithm !== `sha${length}` || mgf1HashAlgorithm !== hashAlgorithm) {
                throw new Error(`Invalid key for this operation, its RSA-PSS parameters do not meet the requirements of "alg" ${algorithm}.`);
              }
              if (saltLength !== void 0 && saltLength > length >> 3) {
                throw new Error(`Invalid key for this operation, its RSA-PSS parameter saltLength does not meet the requirements of "alg" ${algorithm}.`);
              }
            }
            break;
        }
      }
    };
  }
});

// build/plugin/symbia-imagine/node_modules/jsonwebtoken/lib/psSupported.js
var require_psSupported = __commonJS({
  "build/plugin/symbia-imagine/node_modules/jsonwebtoken/lib/psSupported.js"(exports, module) {
    var semver = require_semver2();
    module.exports = semver.satisfies(process.version, "^6.12.0 || >=8.0.0");
  }
});

// build/plugin/symbia-imagine/node_modules/jsonwebtoken/verify.js
var require_verify = __commonJS({
  "build/plugin/symbia-imagine/node_modules/jsonwebtoken/verify.js"(exports, module) {
    var JsonWebTokenError = require_JsonWebTokenError();
    var NotBeforeError = require_NotBeforeError();
    var TokenExpiredError = require_TokenExpiredError();
    var decode = require_decode();
    var timespan = require_timespan();
    var validateAsymmetricKey = require_validateAsymmetricKey();
    var PS_SUPPORTED = require_psSupported();
    var jws = require_jws();
    var { KeyObject, createSecretKey, createPublicKey } = __require("crypto");
    var PUB_KEY_ALGS = ["RS256", "RS384", "RS512"];
    var EC_KEY_ALGS = ["ES256", "ES384", "ES512"];
    var RSA_KEY_ALGS = ["RS256", "RS384", "RS512"];
    var HS_ALGS = ["HS256", "HS384", "HS512"];
    if (PS_SUPPORTED) {
      PUB_KEY_ALGS.splice(PUB_KEY_ALGS.length, 0, "PS256", "PS384", "PS512");
      RSA_KEY_ALGS.splice(RSA_KEY_ALGS.length, 0, "PS256", "PS384", "PS512");
    }
    module.exports = function(jwtString, secretOrPublicKey, options, callback) {
      if (typeof options === "function" && !callback) {
        callback = options;
        options = {};
      }
      if (!options) {
        options = {};
      }
      options = Object.assign({}, options);
      let done;
      if (callback) {
        done = callback;
      } else {
        done = function(err, data) {
          if (err) throw err;
          return data;
        };
      }
      if (options.clockTimestamp && typeof options.clockTimestamp !== "number") {
        return done(new JsonWebTokenError("clockTimestamp must be a number"));
      }
      if (options.nonce !== void 0 && (typeof options.nonce !== "string" || options.nonce.trim() === "")) {
        return done(new JsonWebTokenError("nonce must be a non-empty string"));
      }
      if (options.allowInvalidAsymmetricKeyTypes !== void 0 && typeof options.allowInvalidAsymmetricKeyTypes !== "boolean") {
        return done(new JsonWebTokenError("allowInvalidAsymmetricKeyTypes must be a boolean"));
      }
      const clockTimestamp = options.clockTimestamp || Math.floor(Date.now() / 1e3);
      if (!jwtString) {
        return done(new JsonWebTokenError("jwt must be provided"));
      }
      if (typeof jwtString !== "string") {
        return done(new JsonWebTokenError("jwt must be a string"));
      }
      const parts = jwtString.split(".");
      if (parts.length !== 3) {
        return done(new JsonWebTokenError("jwt malformed"));
      }
      let decodedToken;
      try {
        decodedToken = decode(jwtString, { complete: true });
      } catch (err) {
        return done(err);
      }
      if (!decodedToken) {
        return done(new JsonWebTokenError("invalid token"));
      }
      const header = decodedToken.header;
      let getSecret;
      if (typeof secretOrPublicKey === "function") {
        if (!callback) {
          return done(new JsonWebTokenError("verify must be called asynchronous if secret or public key is provided as a callback"));
        }
        getSecret = secretOrPublicKey;
      } else {
        getSecret = function(header2, secretCallback) {
          return secretCallback(null, secretOrPublicKey);
        };
      }
      return getSecret(header, function(err, secretOrPublicKey2) {
        if (err) {
          return done(new JsonWebTokenError("error in secret or public key callback: " + err.message));
        }
        const hasSignature = parts[2].trim() !== "";
        if (!hasSignature && secretOrPublicKey2) {
          return done(new JsonWebTokenError("jwt signature is required"));
        }
        if (hasSignature && !secretOrPublicKey2) {
          return done(new JsonWebTokenError("secret or public key must be provided"));
        }
        if (!hasSignature && !options.algorithms) {
          return done(new JsonWebTokenError('please specify "none" in "algorithms" to verify unsigned tokens'));
        }
        if (secretOrPublicKey2 != null && !(secretOrPublicKey2 instanceof KeyObject)) {
          try {
            secretOrPublicKey2 = createPublicKey(secretOrPublicKey2);
          } catch (_) {
            try {
              secretOrPublicKey2 = createSecretKey(typeof secretOrPublicKey2 === "string" ? Buffer.from(secretOrPublicKey2) : secretOrPublicKey2);
            } catch (_2) {
              return done(new JsonWebTokenError("secretOrPublicKey is not valid key material"));
            }
          }
        }
        if (!options.algorithms) {
          if (secretOrPublicKey2.type === "secret") {
            options.algorithms = HS_ALGS;
          } else if (["rsa", "rsa-pss"].includes(secretOrPublicKey2.asymmetricKeyType)) {
            options.algorithms = RSA_KEY_ALGS;
          } else if (secretOrPublicKey2.asymmetricKeyType === "ec") {
            options.algorithms = EC_KEY_ALGS;
          } else {
            options.algorithms = PUB_KEY_ALGS;
          }
        }
        if (options.algorithms.indexOf(decodedToken.header.alg) === -1) {
          return done(new JsonWebTokenError("invalid algorithm"));
        }
        if (header.alg.startsWith("HS") && secretOrPublicKey2.type !== "secret") {
          return done(new JsonWebTokenError(`secretOrPublicKey must be a symmetric key when using ${header.alg}`));
        } else if (/^(?:RS|PS|ES)/.test(header.alg) && secretOrPublicKey2.type !== "public") {
          return done(new JsonWebTokenError(`secretOrPublicKey must be an asymmetric key when using ${header.alg}`));
        }
        if (!options.allowInvalidAsymmetricKeyTypes) {
          try {
            validateAsymmetricKey(header.alg, secretOrPublicKey2);
          } catch (e) {
            return done(e);
          }
        }
        let valid;
        try {
          valid = jws.verify(jwtString, decodedToken.header.alg, secretOrPublicKey2);
        } catch (e) {
          return done(e);
        }
        if (!valid) {
          return done(new JsonWebTokenError("invalid signature"));
        }
        const payload = decodedToken.payload;
        if (typeof payload.nbf !== "undefined" && !options.ignoreNotBefore) {
          if (typeof payload.nbf !== "number") {
            return done(new JsonWebTokenError("invalid nbf value"));
          }
          if (payload.nbf > clockTimestamp + (options.clockTolerance || 0)) {
            return done(new NotBeforeError("jwt not active", new Date(payload.nbf * 1e3)));
          }
        }
        if (typeof payload.exp !== "undefined" && !options.ignoreExpiration) {
          if (typeof payload.exp !== "number") {
            return done(new JsonWebTokenError("invalid exp value"));
          }
          if (clockTimestamp >= payload.exp + (options.clockTolerance || 0)) {
            return done(new TokenExpiredError("jwt expired", new Date(payload.exp * 1e3)));
          }
        }
        if (options.audience) {
          const audiences = Array.isArray(options.audience) ? options.audience : [options.audience];
          const target = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
          const match = target.some(function(targetAudience) {
            return audiences.some(function(audience) {
              return audience instanceof RegExp ? audience.test(targetAudience) : audience === targetAudience;
            });
          });
          if (!match) {
            return done(new JsonWebTokenError("jwt audience invalid. expected: " + audiences.join(" or ")));
          }
        }
        if (options.issuer) {
          const invalid_issuer = typeof options.issuer === "string" && payload.iss !== options.issuer || Array.isArray(options.issuer) && options.issuer.indexOf(payload.iss) === -1;
          if (invalid_issuer) {
            return done(new JsonWebTokenError("jwt issuer invalid. expected: " + options.issuer));
          }
        }
        if (options.subject) {
          if (payload.sub !== options.subject) {
            return done(new JsonWebTokenError("jwt subject invalid. expected: " + options.subject));
          }
        }
        if (options.jwtid) {
          if (payload.jti !== options.jwtid) {
            return done(new JsonWebTokenError("jwt jwtid invalid. expected: " + options.jwtid));
          }
        }
        if (options.nonce) {
          if (payload.nonce !== options.nonce) {
            return done(new JsonWebTokenError("jwt nonce invalid. expected: " + options.nonce));
          }
        }
        if (options.maxAge) {
          if (typeof payload.iat !== "number") {
            return done(new JsonWebTokenError("iat required when maxAge is specified"));
          }
          const maxAgeTimestamp = timespan(options.maxAge, payload.iat);
          if (typeof maxAgeTimestamp === "undefined") {
            return done(new JsonWebTokenError('"maxAge" should be a number of seconds or string representing a timespan eg: "1d", "20h", 60'));
          }
          if (clockTimestamp >= maxAgeTimestamp + (options.clockTolerance || 0)) {
            return done(new TokenExpiredError("maxAge exceeded", new Date(maxAgeTimestamp * 1e3)));
          }
        }
        if (options.complete === true) {
          const signature = decodedToken.signature;
          return done(null, {
            header,
            payload,
            signature
          });
        }
        return done(null, payload);
      });
    };
  }
});

// build/plugin/symbia-imagine/node_modules/lodash.includes/index.js
var require_lodash = __commonJS({
  "build/plugin/symbia-imagine/node_modules/lodash.includes/index.js"(exports, module) {
    var INFINITY = 1 / 0;
    var MAX_SAFE_INTEGER = 9007199254740991;
    var MAX_INTEGER = 17976931348623157e292;
    var NAN = 0 / 0;
    var argsTag = "[object Arguments]";
    var funcTag = "[object Function]";
    var genTag = "[object GeneratorFunction]";
    var stringTag = "[object String]";
    var symbolTag = "[object Symbol]";
    var reTrim = /^\s+|\s+$/g;
    var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
    var reIsBinary = /^0b[01]+$/i;
    var reIsOctal = /^0o[0-7]+$/i;
    var reIsUint = /^(?:0|[1-9]\d*)$/;
    var freeParseInt = parseInt;
    function arrayMap(array, iteratee) {
      var index2 = -1, length = array ? array.length : 0, result = Array(length);
      while (++index2 < length) {
        result[index2] = iteratee(array[index2], index2, array);
      }
      return result;
    }
    function baseFindIndex(array, predicate, fromIndex, fromRight) {
      var length = array.length, index2 = fromIndex + (fromRight ? 1 : -1);
      while (fromRight ? index2-- : ++index2 < length) {
        if (predicate(array[index2], index2, array)) {
          return index2;
        }
      }
      return -1;
    }
    function baseIndexOf(array, value, fromIndex) {
      if (value !== value) {
        return baseFindIndex(array, baseIsNaN, fromIndex);
      }
      var index2 = fromIndex - 1, length = array.length;
      while (++index2 < length) {
        if (array[index2] === value) {
          return index2;
        }
      }
      return -1;
    }
    function baseIsNaN(value) {
      return value !== value;
    }
    function baseTimes(n, iteratee) {
      var index2 = -1, result = Array(n);
      while (++index2 < n) {
        result[index2] = iteratee(index2);
      }
      return result;
    }
    function baseValues(object, props) {
      return arrayMap(props, function(key) {
        return object[key];
      });
    }
    function overArg(func, transform) {
      return function(arg) {
        return func(transform(arg));
      };
    }
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var objectToString = objectProto.toString;
    var propertyIsEnumerable = objectProto.propertyIsEnumerable;
    var nativeKeys = overArg(Object.keys, Object);
    var nativeMax = Math.max;
    function arrayLikeKeys(value, inherited) {
      var result = isArray(value) || isArguments(value) ? baseTimes(value.length, String) : [];
      var length = result.length, skipIndexes = !!length;
      for (var key in value) {
        if ((inherited || hasOwnProperty.call(value, key)) && !(skipIndexes && (key == "length" || isIndex(key, length)))) {
          result.push(key);
        }
      }
      return result;
    }
    function baseKeys(object) {
      if (!isPrototype(object)) {
        return nativeKeys(object);
      }
      var result = [];
      for (var key in Object(object)) {
        if (hasOwnProperty.call(object, key) && key != "constructor") {
          result.push(key);
        }
      }
      return result;
    }
    function isIndex(value, length) {
      length = length == null ? MAX_SAFE_INTEGER : length;
      return !!length && (typeof value == "number" || reIsUint.test(value)) && (value > -1 && value % 1 == 0 && value < length);
    }
    function isPrototype(value) {
      var Ctor = value && value.constructor, proto = typeof Ctor == "function" && Ctor.prototype || objectProto;
      return value === proto;
    }
    function includes(collection, value, fromIndex, guard) {
      collection = isArrayLike(collection) ? collection : values(collection);
      fromIndex = fromIndex && !guard ? toInteger(fromIndex) : 0;
      var length = collection.length;
      if (fromIndex < 0) {
        fromIndex = nativeMax(length + fromIndex, 0);
      }
      return isString(collection) ? fromIndex <= length && collection.indexOf(value, fromIndex) > -1 : !!length && baseIndexOf(collection, value, fromIndex) > -1;
    }
    function isArguments(value) {
      return isArrayLikeObject(value) && hasOwnProperty.call(value, "callee") && (!propertyIsEnumerable.call(value, "callee") || objectToString.call(value) == argsTag);
    }
    var isArray = Array.isArray;
    function isArrayLike(value) {
      return value != null && isLength(value.length) && !isFunction(value);
    }
    function isArrayLikeObject(value) {
      return isObjectLike(value) && isArrayLike(value);
    }
    function isFunction(value) {
      var tag = isObject(value) ? objectToString.call(value) : "";
      return tag == funcTag || tag == genTag;
    }
    function isLength(value) {
      return typeof value == "number" && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
    }
    function isObject(value) {
      var type = typeof value;
      return !!value && (type == "object" || type == "function");
    }
    function isObjectLike(value) {
      return !!value && typeof value == "object";
    }
    function isString(value) {
      return typeof value == "string" || !isArray(value) && isObjectLike(value) && objectToString.call(value) == stringTag;
    }
    function isSymbol(value) {
      return typeof value == "symbol" || isObjectLike(value) && objectToString.call(value) == symbolTag;
    }
    function toFinite(value) {
      if (!value) {
        return value === 0 ? value : 0;
      }
      value = toNumber(value);
      if (value === INFINITY || value === -INFINITY) {
        var sign = value < 0 ? -1 : 1;
        return sign * MAX_INTEGER;
      }
      return value === value ? value : 0;
    }
    function toInteger(value) {
      var result = toFinite(value), remainder = result % 1;
      return result === result ? remainder ? result - remainder : result : 0;
    }
    function toNumber(value) {
      if (typeof value == "number") {
        return value;
      }
      if (isSymbol(value)) {
        return NAN;
      }
      if (isObject(value)) {
        var other = typeof value.valueOf == "function" ? value.valueOf() : value;
        value = isObject(other) ? other + "" : other;
      }
      if (typeof value != "string") {
        return value === 0 ? value : +value;
      }
      value = value.replace(reTrim, "");
      var isBinary = reIsBinary.test(value);
      return isBinary || reIsOctal.test(value) ? freeParseInt(value.slice(2), isBinary ? 2 : 8) : reIsBadHex.test(value) ? NAN : +value;
    }
    function keys(object) {
      return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
    }
    function values(object) {
      return object ? baseValues(object, keys(object)) : [];
    }
    module.exports = includes;
  }
});

// build/plugin/symbia-imagine/node_modules/lodash.isboolean/index.js
var require_lodash2 = __commonJS({
  "build/plugin/symbia-imagine/node_modules/lodash.isboolean/index.js"(exports, module) {
    var boolTag = "[object Boolean]";
    var objectProto = Object.prototype;
    var objectToString = objectProto.toString;
    function isBoolean(value) {
      return value === true || value === false || isObjectLike(value) && objectToString.call(value) == boolTag;
    }
    function isObjectLike(value) {
      return !!value && typeof value == "object";
    }
    module.exports = isBoolean;
  }
});

// build/plugin/symbia-imagine/node_modules/lodash.isinteger/index.js
var require_lodash3 = __commonJS({
  "build/plugin/symbia-imagine/node_modules/lodash.isinteger/index.js"(exports, module) {
    var INFINITY = 1 / 0;
    var MAX_INTEGER = 17976931348623157e292;
    var NAN = 0 / 0;
    var symbolTag = "[object Symbol]";
    var reTrim = /^\s+|\s+$/g;
    var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
    var reIsBinary = /^0b[01]+$/i;
    var reIsOctal = /^0o[0-7]+$/i;
    var freeParseInt = parseInt;
    var objectProto = Object.prototype;
    var objectToString = objectProto.toString;
    function isInteger(value) {
      return typeof value == "number" && value == toInteger(value);
    }
    function isObject(value) {
      var type = typeof value;
      return !!value && (type == "object" || type == "function");
    }
    function isObjectLike(value) {
      return !!value && typeof value == "object";
    }
    function isSymbol(value) {
      return typeof value == "symbol" || isObjectLike(value) && objectToString.call(value) == symbolTag;
    }
    function toFinite(value) {
      if (!value) {
        return value === 0 ? value : 0;
      }
      value = toNumber(value);
      if (value === INFINITY || value === -INFINITY) {
        var sign = value < 0 ? -1 : 1;
        return sign * MAX_INTEGER;
      }
      return value === value ? value : 0;
    }
    function toInteger(value) {
      var result = toFinite(value), remainder = result % 1;
      return result === result ? remainder ? result - remainder : result : 0;
    }
    function toNumber(value) {
      if (typeof value == "number") {
        return value;
      }
      if (isSymbol(value)) {
        return NAN;
      }
      if (isObject(value)) {
        var other = typeof value.valueOf == "function" ? value.valueOf() : value;
        value = isObject(other) ? other + "" : other;
      }
      if (typeof value != "string") {
        return value === 0 ? value : +value;
      }
      value = value.replace(reTrim, "");
      var isBinary = reIsBinary.test(value);
      return isBinary || reIsOctal.test(value) ? freeParseInt(value.slice(2), isBinary ? 2 : 8) : reIsBadHex.test(value) ? NAN : +value;
    }
    module.exports = isInteger;
  }
});

// build/plugin/symbia-imagine/node_modules/lodash.isnumber/index.js
var require_lodash4 = __commonJS({
  "build/plugin/symbia-imagine/node_modules/lodash.isnumber/index.js"(exports, module) {
    var numberTag = "[object Number]";
    var objectProto = Object.prototype;
    var objectToString = objectProto.toString;
    function isObjectLike(value) {
      return !!value && typeof value == "object";
    }
    function isNumber(value) {
      return typeof value == "number" || isObjectLike(value) && objectToString.call(value) == numberTag;
    }
    module.exports = isNumber;
  }
});

// build/plugin/symbia-imagine/node_modules/lodash.isplainobject/index.js
var require_lodash5 = __commonJS({
  "build/plugin/symbia-imagine/node_modules/lodash.isplainobject/index.js"(exports, module) {
    var objectTag = "[object Object]";
    function isHostObject(value) {
      var result = false;
      if (value != null && typeof value.toString != "function") {
        try {
          result = !!(value + "");
        } catch (e) {
        }
      }
      return result;
    }
    function overArg(func, transform) {
      return function(arg) {
        return func(transform(arg));
      };
    }
    var funcProto = Function.prototype;
    var objectProto = Object.prototype;
    var funcToString = funcProto.toString;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var objectCtorString = funcToString.call(Object);
    var objectToString = objectProto.toString;
    var getPrototype = overArg(Object.getPrototypeOf, Object);
    function isObjectLike(value) {
      return !!value && typeof value == "object";
    }
    function isPlainObject(value) {
      if (!isObjectLike(value) || objectToString.call(value) != objectTag || isHostObject(value)) {
        return false;
      }
      var proto = getPrototype(value);
      if (proto === null) {
        return true;
      }
      var Ctor = hasOwnProperty.call(proto, "constructor") && proto.constructor;
      return typeof Ctor == "function" && Ctor instanceof Ctor && funcToString.call(Ctor) == objectCtorString;
    }
    module.exports = isPlainObject;
  }
});

// build/plugin/symbia-imagine/node_modules/lodash.isstring/index.js
var require_lodash6 = __commonJS({
  "build/plugin/symbia-imagine/node_modules/lodash.isstring/index.js"(exports, module) {
    var stringTag = "[object String]";
    var objectProto = Object.prototype;
    var objectToString = objectProto.toString;
    var isArray = Array.isArray;
    function isObjectLike(value) {
      return !!value && typeof value == "object";
    }
    function isString(value) {
      return typeof value == "string" || !isArray(value) && isObjectLike(value) && objectToString.call(value) == stringTag;
    }
    module.exports = isString;
  }
});

// build/plugin/symbia-imagine/node_modules/lodash.once/index.js
var require_lodash7 = __commonJS({
  "build/plugin/symbia-imagine/node_modules/lodash.once/index.js"(exports, module) {
    var FUNC_ERROR_TEXT = "Expected a function";
    var INFINITY = 1 / 0;
    var MAX_INTEGER = 17976931348623157e292;
    var NAN = 0 / 0;
    var symbolTag = "[object Symbol]";
    var reTrim = /^\s+|\s+$/g;
    var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
    var reIsBinary = /^0b[01]+$/i;
    var reIsOctal = /^0o[0-7]+$/i;
    var freeParseInt = parseInt;
    var objectProto = Object.prototype;
    var objectToString = objectProto.toString;
    function before(n, func) {
      var result;
      if (typeof func != "function") {
        throw new TypeError(FUNC_ERROR_TEXT);
      }
      n = toInteger(n);
      return function() {
        if (--n > 0) {
          result = func.apply(this, arguments);
        }
        if (n <= 1) {
          func = void 0;
        }
        return result;
      };
    }
    function once(func) {
      return before(2, func);
    }
    function isObject(value) {
      var type = typeof value;
      return !!value && (type == "object" || type == "function");
    }
    function isObjectLike(value) {
      return !!value && typeof value == "object";
    }
    function isSymbol(value) {
      return typeof value == "symbol" || isObjectLike(value) && objectToString.call(value) == symbolTag;
    }
    function toFinite(value) {
      if (!value) {
        return value === 0 ? value : 0;
      }
      value = toNumber(value);
      if (value === INFINITY || value === -INFINITY) {
        var sign = value < 0 ? -1 : 1;
        return sign * MAX_INTEGER;
      }
      return value === value ? value : 0;
    }
    function toInteger(value) {
      var result = toFinite(value), remainder = result % 1;
      return result === result ? remainder ? result - remainder : result : 0;
    }
    function toNumber(value) {
      if (typeof value == "number") {
        return value;
      }
      if (isSymbol(value)) {
        return NAN;
      }
      if (isObject(value)) {
        var other = typeof value.valueOf == "function" ? value.valueOf() : value;
        value = isObject(other) ? other + "" : other;
      }
      if (typeof value != "string") {
        return value === 0 ? value : +value;
      }
      value = value.replace(reTrim, "");
      var isBinary = reIsBinary.test(value);
      return isBinary || reIsOctal.test(value) ? freeParseInt(value.slice(2), isBinary ? 2 : 8) : reIsBadHex.test(value) ? NAN : +value;
    }
    module.exports = once;
  }
});

// build/plugin/symbia-imagine/node_modules/jsonwebtoken/sign.js
var require_sign = __commonJS({
  "build/plugin/symbia-imagine/node_modules/jsonwebtoken/sign.js"(exports, module) {
    var timespan = require_timespan();
    var PS_SUPPORTED = require_psSupported();
    var validateAsymmetricKey = require_validateAsymmetricKey();
    var jws = require_jws();
    var includes = require_lodash();
    var isBoolean = require_lodash2();
    var isInteger = require_lodash3();
    var isNumber = require_lodash4();
    var isPlainObject = require_lodash5();
    var isString = require_lodash6();
    var once = require_lodash7();
    var { KeyObject, createSecretKey, createPrivateKey } = __require("crypto");
    var SUPPORTED_ALGS = ["RS256", "RS384", "RS512", "ES256", "ES384", "ES512", "HS256", "HS384", "HS512", "none"];
    if (PS_SUPPORTED) {
      SUPPORTED_ALGS.splice(3, 0, "PS256", "PS384", "PS512");
    }
    var sign_options_schema = {
      expiresIn: { isValid: function(value) {
        return isInteger(value) || isString(value) && value;
      }, message: '"expiresIn" should be a number of seconds or string representing a timespan' },
      notBefore: { isValid: function(value) {
        return isInteger(value) || isString(value) && value;
      }, message: '"notBefore" should be a number of seconds or string representing a timespan' },
      audience: { isValid: function(value) {
        return isString(value) || Array.isArray(value);
      }, message: '"audience" must be a string or array' },
      algorithm: { isValid: includes.bind(null, SUPPORTED_ALGS), message: '"algorithm" must be a valid string enum value' },
      header: { isValid: isPlainObject, message: '"header" must be an object' },
      encoding: { isValid: isString, message: '"encoding" must be a string' },
      issuer: { isValid: isString, message: '"issuer" must be a string' },
      subject: { isValid: isString, message: '"subject" must be a string' },
      jwtid: { isValid: isString, message: '"jwtid" must be a string' },
      noTimestamp: { isValid: isBoolean, message: '"noTimestamp" must be a boolean' },
      keyid: { isValid: isString, message: '"keyid" must be a string' },
      mutatePayload: { isValid: isBoolean, message: '"mutatePayload" must be a boolean' },
      allowInsecureKeySizes: { isValid: isBoolean, message: '"allowInsecureKeySizes" must be a boolean' },
      allowInvalidAsymmetricKeyTypes: { isValid: isBoolean, message: '"allowInvalidAsymmetricKeyTypes" must be a boolean' }
    };
    var registered_claims_schema = {
      iat: { isValid: isNumber, message: '"iat" should be a number of seconds' },
      exp: { isValid: isNumber, message: '"exp" should be a number of seconds' },
      nbf: { isValid: isNumber, message: '"nbf" should be a number of seconds' }
    };
    function validate(schema, allowUnknown, object, parameterName) {
      if (!isPlainObject(object)) {
        throw new Error('Expected "' + parameterName + '" to be a plain object.');
      }
      Object.keys(object).forEach(function(key) {
        const validator = schema[key];
        if (!validator) {
          if (!allowUnknown) {
            throw new Error('"' + key + '" is not allowed in "' + parameterName + '"');
          }
          return;
        }
        if (!validator.isValid(object[key])) {
          throw new Error(validator.message);
        }
      });
    }
    function validateOptions(options) {
      return validate(sign_options_schema, false, options, "options");
    }
    function validatePayload(payload) {
      return validate(registered_claims_schema, true, payload, "payload");
    }
    var options_to_payload = {
      "audience": "aud",
      "issuer": "iss",
      "subject": "sub",
      "jwtid": "jti"
    };
    var options_for_objects = [
      "expiresIn",
      "notBefore",
      "noTimestamp",
      "audience",
      "issuer",
      "subject",
      "jwtid"
    ];
    module.exports = function(payload, secretOrPrivateKey, options, callback) {
      if (typeof options === "function") {
        callback = options;
        options = {};
      } else {
        options = options || {};
      }
      const isObjectPayload = typeof payload === "object" && !Buffer.isBuffer(payload);
      const header = Object.assign({
        alg: options.algorithm || "HS256",
        typ: isObjectPayload ? "JWT" : void 0,
        kid: options.keyid
      }, options.header);
      function failure(err) {
        if (callback) {
          return callback(err);
        }
        throw err;
      }
      if (!secretOrPrivateKey && options.algorithm !== "none") {
        return failure(new Error("secretOrPrivateKey must have a value"));
      }
      if (secretOrPrivateKey != null && !(secretOrPrivateKey instanceof KeyObject)) {
        try {
          secretOrPrivateKey = createPrivateKey(secretOrPrivateKey);
        } catch (_) {
          try {
            secretOrPrivateKey = createSecretKey(typeof secretOrPrivateKey === "string" ? Buffer.from(secretOrPrivateKey) : secretOrPrivateKey);
          } catch (_2) {
            return failure(new Error("secretOrPrivateKey is not valid key material"));
          }
        }
      }
      if (header.alg.startsWith("HS") && secretOrPrivateKey.type !== "secret") {
        return failure(new Error(`secretOrPrivateKey must be a symmetric key when using ${header.alg}`));
      } else if (/^(?:RS|PS|ES)/.test(header.alg)) {
        if (secretOrPrivateKey.type !== "private") {
          return failure(new Error(`secretOrPrivateKey must be an asymmetric key when using ${header.alg}`));
        }
        if (!options.allowInsecureKeySizes && !header.alg.startsWith("ES") && secretOrPrivateKey.asymmetricKeyDetails !== void 0 && //KeyObject.asymmetricKeyDetails is supported in Node 15+
        secretOrPrivateKey.asymmetricKeyDetails.modulusLength < 2048) {
          return failure(new Error(`secretOrPrivateKey has a minimum key size of 2048 bits for ${header.alg}`));
        }
      }
      if (typeof payload === "undefined") {
        return failure(new Error("payload is required"));
      } else if (isObjectPayload) {
        try {
          validatePayload(payload);
        } catch (error) {
          return failure(error);
        }
        if (!options.mutatePayload) {
          payload = Object.assign({}, payload);
        }
      } else {
        const invalid_options = options_for_objects.filter(function(opt) {
          return typeof options[opt] !== "undefined";
        });
        if (invalid_options.length > 0) {
          return failure(new Error("invalid " + invalid_options.join(",") + " option for " + typeof payload + " payload"));
        }
      }
      if (typeof payload.exp !== "undefined" && typeof options.expiresIn !== "undefined") {
        return failure(new Error('Bad "options.expiresIn" option the payload already has an "exp" property.'));
      }
      if (typeof payload.nbf !== "undefined" && typeof options.notBefore !== "undefined") {
        return failure(new Error('Bad "options.notBefore" option the payload already has an "nbf" property.'));
      }
      try {
        validateOptions(options);
      } catch (error) {
        return failure(error);
      }
      if (!options.allowInvalidAsymmetricKeyTypes) {
        try {
          validateAsymmetricKey(header.alg, secretOrPrivateKey);
        } catch (error) {
          return failure(error);
        }
      }
      const timestamp2 = payload.iat || Math.floor(Date.now() / 1e3);
      if (options.noTimestamp) {
        delete payload.iat;
      } else if (isObjectPayload) {
        payload.iat = timestamp2;
      }
      if (typeof options.notBefore !== "undefined") {
        try {
          payload.nbf = timespan(options.notBefore, timestamp2);
        } catch (err) {
          return failure(err);
        }
        if (typeof payload.nbf === "undefined") {
          return failure(new Error('"notBefore" should be a number of seconds or string representing a timespan eg: "1d", "20h", 60'));
        }
      }
      if (typeof options.expiresIn !== "undefined" && typeof payload === "object") {
        try {
          payload.exp = timespan(options.expiresIn, timestamp2);
        } catch (err) {
          return failure(err);
        }
        if (typeof payload.exp === "undefined") {
          return failure(new Error('"expiresIn" should be a number of seconds or string representing a timespan eg: "1d", "20h", 60'));
        }
      }
      Object.keys(options_to_payload).forEach(function(key) {
        const claim = options_to_payload[key];
        if (typeof options[key] !== "undefined") {
          if (typeof payload[claim] !== "undefined") {
            return failure(new Error('Bad "options.' + key + '" option. The payload already has an "' + claim + '" property.'));
          }
          payload[claim] = options[key];
        }
      });
      const encoding = options.encoding || "utf8";
      if (typeof callback === "function") {
        callback = callback && once(callback);
        jws.createSign({
          header,
          privateKey: secretOrPrivateKey,
          payload,
          encoding
        }).once("error", callback).once("done", function(signature) {
          if (!options.allowInsecureKeySizes && /^(?:RS|PS)/.test(header.alg) && signature.length < 256) {
            return callback(new Error(`secretOrPrivateKey has a minimum key size of 2048 bits for ${header.alg}`));
          }
          callback(null, signature);
        });
      } else {
        let signature = jws.sign({ header, payload, secret: secretOrPrivateKey, encoding });
        if (!options.allowInsecureKeySizes && /^(?:RS|PS)/.test(header.alg) && signature.length < 256) {
          throw new Error(`secretOrPrivateKey has a minimum key size of 2048 bits for ${header.alg}`);
        }
        return signature;
      }
    };
  }
});

// build/plugin/symbia-imagine/node_modules/jsonwebtoken/index.js
var require_jsonwebtoken = __commonJS({
  "build/plugin/symbia-imagine/node_modules/jsonwebtoken/index.js"(exports, module) {
    module.exports = {
      decode: require_decode(),
      verify: require_verify(),
      sign: require_sign(),
      JsonWebTokenError: require_JsonWebTokenError(),
      NotBeforeError: require_NotBeforeError(),
      TokenExpiredError: require_TokenExpiredError()
    };
  }
});

// build/plugin/symbia-imagine/services/identity.mjs
var import_bcryptjs = __toESM(require_bcryptjs(), 1);
import crypto from "crypto";
var import_bcryptjs2 = __toESM(require_bcryptjs(), 1);
var import_jsonwebtoken = __toESM(require_jsonwebtoken(), 1);
import { randomBytes } from "node:crypto";
import crypto2 from "crypto";
import fs from "fs";
import path from "path";
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var schema_exports = {};
__export(schema_exports, {
  agentLoginSchema: () => agentLoginSchema,
  agentRegisterSchema: () => agentRegisterSchema,
  agents: () => agents,
  agentsRelations: () => agentsRelations,
  apiKeys: () => apiKeys,
  apiKeysRelations: () => apiKeysRelations,
  applicationServices: () => applicationServices,
  applicationServicesRelations: () => applicationServicesRelations,
  applications: () => applications,
  applicationsRelations: () => applicationsRelations,
  auditLogs: () => auditLogs,
  auditLogsRelations: () => auditLogsRelations,
  bindEntitySchema: () => bindEntitySchema,
  createApiKeySchema: () => createApiKeySchema,
  createApplicationSchema: () => createApplicationSchema,
  createEntitySchema: () => createEntitySchema,
  createOrgSchema: () => createOrgSchema,
  createProjectSchema: () => createProjectSchema,
  createScopedEntitlementSchema: () => createScopedEntitlementSchema,
  createServiceSchema: () => createServiceSchema,
  createUserCredentialSchema: () => createUserCredentialSchema,
  entities: () => entities,
  entitiesRelations: () => entitiesRelations,
  entitlementTranches: () => entitlementTranches,
  entitlementTranchesRelations: () => entitlementTranchesRelations,
  entitlements: () => entitlements,
  entitlementsRelations: () => entitlementsRelations,
  entityAliases: () => entityAliases,
  entityAliasesRelations: () => entityAliasesRelations,
  entityInstances: () => entityInstances,
  entityInstancesRelations: () => entityInstancesRelations,
  entityStatusEnum: () => entityStatusEnum,
  entityTypeEnum: () => entityTypeEnum,
  forgotPasswordSchema: () => forgotPasswordSchema,
  insertAgentSchema: () => insertAgentSchema,
  insertApiKeySchema: () => insertApiKeySchema,
  insertApplicationSchema: () => insertApplicationSchema,
  insertApplicationServiceSchema: () => insertApplicationServiceSchema,
  insertAuditLogSchema: () => insertAuditLogSchema,
  insertEntitlementSchema: () => insertEntitlementSchema,
  insertEntitlementTrancheSchema: () => insertEntitlementTrancheSchema,
  insertEntityAliasSchema: () => insertEntityAliasSchema,
  insertEntityInstanceSchema: () => insertEntityInstanceSchema,
  insertEntitySchema: () => insertEntitySchema,
  insertMembershipSchema: () => insertMembershipSchema,
  insertOrganizationSchema: () => insertOrganizationSchema,
  insertPlanSchema: () => insertPlanSchema,
  insertProjectSchema: () => insertProjectSchema,
  insertScopedEntitlementSchema: () => insertScopedEntitlementSchema,
  insertServiceSchema: () => insertServiceSchema,
  insertSessionSchema: () => insertSessionSchema,
  insertUserCredentialSchema: () => insertUserCredentialSchema,
  insertUserEntitlementSchema: () => insertUserEntitlementSchema,
  insertUserRoleSchema: () => insertUserRoleSchema,
  insertUserSchema: () => insertUserSchema,
  inviteMemberSchema: () => inviteMemberSchema,
  loginSchema: () => loginSchema,
  memberships: () => memberships,
  membershipsRelations: () => membershipsRelations,
  organizations: () => organizations,
  organizationsRelations: () => organizationsRelations,
  passwordResetTokens: () => passwordResetTokens,
  passwordResetTokensRelations: () => passwordResetTokensRelations,
  plans: () => plans,
  plansRelations: () => plansRelations,
  projects: () => projects,
  projectsRelations: () => projectsRelations,
  registerSchema: () => registerSchema,
  resetPasswordSchema: () => resetPasswordSchema,
  resolveEntitySchema: () => resolveEntitySchema,
  scopeTypeEnum: () => scopeTypeEnum,
  scopedEntitlements: () => scopedEntitlements,
  scopedEntitlementsRelations: () => scopedEntitlementsRelations,
  services: () => services,
  servicesRelations: () => servicesRelations,
  sessions: () => sessions,
  sessionsRelations: () => sessionsRelations,
  unbindEntitySchema: () => unbindEntitySchema,
  userCredentialProviderEnum: () => userCredentialProviderEnum,
  userCredentials: () => userCredentials,
  userCredentialsRelations: () => userCredentialsRelations,
  userEntitlements: () => userEntitlements,
  userEntitlementsRelations: () => userEntitlementsRelations,
  userRoles: () => userRoles,
  userRolesRelations: () => userRolesRelations,
  users: () => users,
  usersRelations: () => usersRelations
});
var users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  emailIdx: uniqueIndex("idx_users_email").on(table.email)
}));
var usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  sessions: many(sessions)
}));
var organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  planId: varchar("plan_id").references(() => plans.id),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var organizationsRelations = relations(organizations, ({ one, many }) => ({
  plan: one(plans, {
    fields: [organizations.planId],
    references: [plans.id]
  }),
  memberships: many(memberships),
  entitlements: many(entitlements)
}));
var memberships = pgTable("memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orgId: varchar("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  // admin, member, viewer
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  userIdx: index("idx_memberships_user_id").on(table.userId),
  orgIdx: index("idx_memberships_org_id").on(table.orgId),
  orgUserIdx: uniqueIndex("idx_memberships_org_user").on(table.orgId, table.userId)
}));
var membershipsRelations = relations(memberships, ({ one }) => ({
  user: one(users, {
    fields: [memberships.userId],
    references: [users.id]
  }),
  organization: one(organizations, {
    fields: [memberships.orgId],
    references: [organizations.id]
  })
}));
var plans = pgTable("plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  featuresJson: json("features_json").$type().default([]),
  limitsJson: json("limits_json").$type().default({}),
  priceCents: integer("price_cents").notNull().default(0)
});
var plansRelations = relations(plans, ({ many }) => ({
  organizations: many(organizations)
}));
var entitlements = pgTable("entitlements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  featureKey: text("feature_key").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  expiresAt: timestamp("expires_at")
});
var entitlementsRelations = relations(entitlements, ({ one }) => ({
  organization: one(organizations, {
    fields: [entitlements.orgId],
    references: [organizations.id]
  })
}));
var sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  userIdx: index("idx_sessions_user_id").on(table.userId),
  expiresIdx: index("idx_sessions_expires").on(table.expiresAt)
}));
var sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id]
  })
}));
var passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id]
  })
}));
var projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"),
  // active, archived, suspended
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  orgIdx: index("idx_projects_org_id").on(table.orgId),
  orgSlugIdx: uniqueIndex("idx_projects_org_slug").on(table.orgId, table.slug)
}));
var projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [projects.orgId],
    references: [organizations.id]
  }),
  applications: many(applications),
  services: many(services)
}));
var applications = pgTable("applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  orgId: varchar("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  environment: text("environment").notNull().default("development"),
  // development, staging, production
  appType: text("app_type").notNull().default("web"),
  // web, mobile, api, cli
  repoUrl: text("repo_url"),
  metadataJson: json("metadata_json").$type().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  orgIdx: index("idx_applications_org_id").on(table.orgId),
  projectIdx: index("idx_applications_project_id").on(table.projectId)
}));
var applicationsRelations = relations(applications, ({ one, many }) => ({
  project: one(projects, {
    fields: [applications.projectId],
    references: [projects.id]
  }),
  organization: one(organizations, {
    fields: [applications.orgId],
    references: [organizations.id]
  }),
  serviceLinks: many(applicationServices)
}));
var services = pgTable("services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  orgId: varchar("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  serviceType: text("service_type").notNull(),
  // database, api, auth, storage, messaging, analytics
  provider: text("provider"),
  // aws, gcp, stripe, twilio, etc.
  endpointUrl: text("endpoint_url"),
  externalId: text("external_id"),
  // External service identifier
  status: text("status").notNull().default("active"),
  // active, inactive, error
  metadataJson: json("metadata_json").$type().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  orgIdx: index("idx_services_org_id").on(table.orgId),
  projectIdx: index("idx_services_project_id").on(table.projectId)
}));
var servicesRelations = relations(services, ({ one, many }) => ({
  project: one(projects, {
    fields: [services.projectId],
    references: [projects.id]
  }),
  organization: one(organizations, {
    fields: [services.orgId],
    references: [organizations.id]
  }),
  applicationLinks: many(applicationServices)
}));
var applicationServices = pgTable("application_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  applicationId: varchar("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var applicationServicesRelations = relations(applicationServices, ({ one }) => ({
  application: one(applications, {
    fields: [applicationServices.applicationId],
    references: [applications.id]
  }),
  service: one(services, {
    fields: [applicationServices.serviceId],
    references: [services.id]
  })
}));
var entitlementTranches = pgTable("entitlement_tranches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").references(() => plans.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  trancheKey: text("tranche_key").notNull(),
  // e.g., "api_calls", "storage_gb", "users"
  description: text("description"),
  defaultQuota: integer("default_quota").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var entitlementTranchesRelations = relations(entitlementTranches, ({ one }) => ({
  plan: one(plans, {
    fields: [entitlementTranches.planId],
    references: [plans.id]
  })
}));
var scopedEntitlements = pgTable("scoped_entitlements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  scopeType: text("scope_type").notNull(),
  // org, project, application, service
  scopeId: varchar("scope_id").notNull(),
  // ID of the scoped entity
  trancheId: varchar("tranche_id").references(() => entitlementTranches.id),
  featureKey: text("feature_key").notNull(),
  quota: integer("quota").default(0),
  consumed: integer("consumed").default(0),
  enabled: boolean("enabled").notNull().default(true),
  expiresAt: timestamp("expires_at"),
  metadataJson: json("metadata_json").$type().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var scopedEntitlementsRelations = relations(scopedEntitlements, ({ one }) => ({
  organization: one(organizations, {
    fields: [scopedEntitlements.orgId],
    references: [organizations.id]
  }),
  tranche: one(entitlementTranches, {
    fields: [scopedEntitlements.trancheId],
    references: [entitlementTranches.id]
  })
}));
var userEntitlements = pgTable("user_entitlements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  entitlementKey: text("entitlement_key").notNull(),
  // e.g., "cap:registry.write", "cap:registry.publish"
  grantedBy: varchar("granted_by").references(() => users.id),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var userEntitlementsRelations = relations(userEntitlements, ({ one }) => ({
  user: one(users, {
    fields: [userEntitlements.userId],
    references: [users.id]
  }),
  granter: one(users, {
    fields: [userEntitlements.grantedBy],
    references: [users.id]
  })
}));
var userRoles = pgTable("user_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleKey: text("role_key").notNull(),
  // e.g., "role:admin", "role:publisher", "role:reviewer"
  grantedBy: varchar("granted_by").references(() => users.id),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id]
  }),
  granter: one(users, {
    fields: [userRoles.grantedBy],
    references: [users.id]
  })
}));
var apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  // First 8 chars for identification
  orgId: varchar("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  scopes: json("scopes").$type().default([]),
  // e.g., ["read:resources", "write:resources"]
  expiresAt: timestamp("expires_at"),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  orgIdx: index("idx_api_keys_org_id").on(table.orgId),
  createdByIdx: index("idx_api_keys_created_by").on(table.createdBy)
}));
var apiKeysRelations = relations(apiKeys, ({ one }) => ({
  organization: one(organizations, {
    fields: [apiKeys.orgId],
    references: [organizations.id]
  }),
  creator: one(users, {
    fields: [apiKeys.createdBy],
    references: [users.id]
  })
}));
var agents = pgTable("agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: text("agent_id").notNull().unique(),
  // Unique identifier like "assistant:onboarding" or "agent:my-bot"
  credentialHash: text("credential_hash").notNull(),
  // bcrypt hash of credential (parallel to passwordHash)
  name: text("name").notNull(),
  orgId: varchar("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  capabilities: json("capabilities").$type().default([]),
  // e.g., ["cap:messaging.send", "cap:messaging.receive"]
  metadata: json("metadata").$type().default({}),
  isActive: boolean("is_active").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  agentIdIdx: uniqueIndex("idx_agents_agent_id").on(table.agentId),
  orgIdx: index("idx_agents_org_id").on(table.orgId)
}));
var agentsRelations = relations(agents, ({ one }) => ({
  organization: one(organizations, {
    fields: [agents.orgId],
    references: [organizations.id]
  })
}));
var entityTypeEnum = external_exports.enum([
  "user",
  "assistant",
  "service",
  "integration",
  "sandbox"
]);
var entityStatusEnum = external_exports.enum([
  "active",
  "inactive",
  "suspended"
]);
var entities = pgTable("entities", {
  // UUID primary key with ent_ prefix convention
  id: varchar("id").primaryKey().default(sql`'ent_' || gen_random_uuid()`),
  // Entity type
  type: text("type").notNull(),
  // user, assistant, service, integration, sandbox
  // Human-readable addressing
  slug: text("slug").notNull(),
  // e.g., "log-analyst", "brian", "messaging"
  displayName: text("display_name").notNull(),
  // e.g., "Log Analyst", "Brian"
  // Multi-instance support
  instanceId: text("instance_id"),
  // e.g., "prod-1", "us-west-1"
  instanceIndex: integer("instance_index").default(1),
  // 1, 2, 3 for ordered instances
  // Org/Network scoping
  orgId: varchar("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  networkId: text("network_id"),
  // For federation: "acme.symbia.io"
  // Resolution hints
  capabilities: json("capabilities").$type().default([]),
  tags: json("tags").$type().default([]),
  // Lifecycle
  status: text("status").notNull().default("active"),
  // active, inactive, suspended
  // Network binding (ephemeral - current connection)
  boundNodeId: text("bound_node_id"),
  // Current network node ID (null if disconnected)
  boundAt: timestamp("bound_at"),
  // When bound to current node
  // Source reference (links to original user/agent record)
  sourceTable: text("source_table"),
  // 'users' or 'agents'
  sourceId: varchar("source_id"),
  // ID in the source table
  // Metadata
  metadata: json("metadata").$type().default({}),
  // Timestamps
  registeredAt: timestamp("registered_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  // Unique constraint on slug + org + instance for local addressing
  slugOrgInstanceIdx: uniqueIndex("idx_entities_slug_org_instance").on(
    table.slug,
    table.orgId,
    table.instanceId
  ),
  // Index for org lookups
  orgIdx: index("idx_entities_org_id").on(table.orgId),
  // Index for type filtering
  typeIdx: index("idx_entities_type").on(table.type),
  // Index for network node binding lookups
  boundNodeIdx: index("idx_entities_bound_node").on(table.boundNodeId),
  // Index for source table lookups (syncing from users/agents)
  sourceIdx: index("idx_entities_source").on(table.sourceTable, table.sourceId),
  // Index for status filtering
  statusIdx: index("idx_entities_status").on(table.status)
}));
var entitiesRelations = relations(entities, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [entities.orgId],
    references: [organizations.id]
  }),
  aliases: many(entityAliases)
}));
var entityAliases = pgTable("entity_aliases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityId: varchar("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  // Alias format
  aliasType: text("alias_type").notNull(),
  // 'slug', 'qualified', 'legacy', 'federated'
  aliasValue: text("alias_value").notNull(),
  // The actual alias string
  // Scoping (for ambiguity resolution)
  orgId: varchar("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  // Priority for resolution (higher = preferred)
  priority: integer("priority").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  // Unique constraint on alias value within org
  aliasOrgIdx: uniqueIndex("idx_entity_aliases_value_org").on(table.aliasValue, table.orgId),
  // Index for entity lookups
  entityIdx: index("idx_entity_aliases_entity").on(table.entityId),
  // Index for alias resolution
  aliasValueIdx: index("idx_entity_aliases_value").on(table.aliasValue)
}));
var entityAliasesRelations = relations(entityAliases, ({ one }) => ({
  entity: one(entities, {
    fields: [entityAliases.entityId],
    references: [entities.id]
  }),
  organization: one(organizations, {
    fields: [entityAliases.orgId],
    references: [organizations.id]
  })
}));
var entityInstances = pgTable("entity_instances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityId: varchar("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  // Instance identification
  instanceId: text("instance_id").notNull(),
  // e.g., "prod-1", "us-west-1"
  instanceIndex: integer("instance_index").notNull(),
  // 1, 2, 3...
  // Runtime state
  nodeId: text("node_id"),
  // Current network node (if connected)
  status: text("status").notNull().default("available"),
  // available, busy, offline
  lastHeartbeat: timestamp("last_heartbeat"),
  // Load balancing metadata
  loadScore: integer("load_score").default(0),
  // Higher = more loaded
  metadata: json("metadata").$type().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  entityInstanceIdx: uniqueIndex("idx_entity_instances_entity_instance").on(
    table.entityId,
    table.instanceId
  ),
  entityIdx: index("idx_entity_instances_entity").on(table.entityId),
  statusIdx: index("idx_entity_instances_status").on(table.status)
}));
var entityInstancesRelations = relations(entityInstances, ({ one }) => ({
  entity: one(entities, {
    fields: [entityInstances.entityId],
    references: [entities.id]
  })
}));
var insertEntitySchema = createInsertSchema(entities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  registeredAt: true
});
var insertEntityAliasSchema = createInsertSchema(entityAliases).omit({
  id: true,
  createdAt: true
});
var insertEntityInstanceSchema = createInsertSchema(entityInstances).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var createEntitySchema = external_exports.object({
  type: entityTypeEnum,
  slug: external_exports.string().min(1).regex(/^[a-z0-9-_]+$/, "Slug must be lowercase alphanumeric with dashes or underscores"),
  displayName: external_exports.string().min(1),
  instanceId: external_exports.string().optional(),
  orgId: external_exports.string().optional(),
  networkId: external_exports.string().optional(),
  capabilities: external_exports.array(external_exports.string()).default([]),
  tags: external_exports.array(external_exports.string()).default([]),
  sourceTable: external_exports.enum(["users", "agents"]).optional(),
  sourceId: external_exports.string().optional(),
  metadata: external_exports.record(external_exports.string(), external_exports.unknown()).default({})
});
var resolveEntitySchema = external_exports.object({
  address: external_exports.string().min(1),
  // @slug, slug#instance, qualified:address, ent_uuid
  orgId: external_exports.string().optional()
  // Context for ambiguous resolution
});
var bindEntitySchema = external_exports.object({
  entityId: external_exports.string().min(1),
  nodeId: external_exports.string().min(1)
});
var unbindEntitySchema = external_exports.object({
  entityId: external_exports.string().min(1)
});
var userCredentials = pgTable("user_credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orgId: varchar("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  // e.g., "openai", "huggingface", "anthropic", "replit"
  name: text("name").notNull(),
  // User-friendly name like "My OpenAI Key"
  credentialEncrypted: text("credential_encrypted").notNull(),
  // Encrypted API key or access token
  credentialPrefix: text("credential_prefix"),
  // First 8 chars for identification (e.g., "sk-proj-...")
  isOrgWide: boolean("is_org_wide").notNull().default(false),
  // Shared across org members
  metadata: json("metadata").$type().default({}),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // OAuth-specific fields
  credentialType: text("credential_type").default("api_key"),
  // 'api_key' | 'oauth_token'
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  // Encrypted OAuth refresh token
  expiresAt: timestamp("expires_at"),
  // Token expiration time
  oauthUserId: varchar("oauth_user_id", { length: 255 }),
  // External user ID from OAuth provider
  oauthUserEmail: text("oauth_user_email"),
  // External email from OAuth provider
  oauthUserName: text("oauth_user_name")
  // External name from OAuth provider
}, (table) => ({
  userIdx: index("idx_user_credentials_user_id").on(table.userId),
  orgIdx: index("idx_user_credentials_org_id").on(table.orgId),
  providerIdx: index("idx_user_credentials_provider").on(table.provider),
  userProviderIdx: index("idx_user_credentials_user_provider").on(table.userId, table.provider),
  credentialTypeIdx: index("idx_user_credentials_type").on(table.credentialType)
}));
var userCredentialsRelations = relations(userCredentials, ({ one }) => ({
  user: one(users, {
    fields: [userCredentials.userId],
    references: [users.id]
  }),
  organization: one(organizations, {
    fields: [userCredentials.orgId],
    references: [organizations.id]
  })
}));
var auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  orgId: varchar("org_id").references(() => organizations.id),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: varchar("resource_id"),
  metadataJson: json("metadata_json").$type().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  orgCreatedIdx: index("idx_audit_logs_org_created").on(table.orgId, table.createdAt),
  userCreatedIdx: index("idx_audit_logs_user_created").on(table.userId, table.createdAt),
  resourceIdx: index("idx_audit_logs_resource").on(table.resource, table.resourceId)
}));
var auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id]
  }),
  organization: one(organizations, {
    fields: [auditLogs.orgId],
    references: [organizations.id]
  })
}));
var insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true
});
var insertMembershipSchema = createInsertSchema(memberships).omit({
  id: true,
  createdAt: true
});
var insertPlanSchema = createInsertSchema(plans).omit({
  id: true
});
var insertEntitlementSchema = createInsertSchema(entitlements).omit({
  id: true
});
var insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  createdAt: true
});
var insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true
});
var insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true
});
var insertApplicationSchema = createInsertSchema(applications).omit({
  id: true,
  createdAt: true
});
var insertServiceSchema = createInsertSchema(services).omit({
  id: true,
  createdAt: true
});
var insertApplicationServiceSchema = createInsertSchema(applicationServices).omit({
  id: true,
  createdAt: true
});
var insertEntitlementTrancheSchema = createInsertSchema(entitlementTranches).omit({
  id: true,
  createdAt: true
});
var insertScopedEntitlementSchema = createInsertSchema(scopedEntitlements).omit({
  id: true,
  createdAt: true
});
var insertUserEntitlementSchema = createInsertSchema(userEntitlements).omit({
  id: true,
  createdAt: true
});
var insertUserRoleSchema = createInsertSchema(userRoles).omit({
  id: true,
  createdAt: true
});
var insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true
});
var insertAgentSchema = createInsertSchema(agents).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var insertUserCredentialSchema = createInsertSchema(userCredentials).omit({
  id: true,
  createdAt: true
});
var registerSchema = external_exports.object({
  email: external_exports.string().email("Invalid email address"),
  password: external_exports.string().min(8, "Password must be at least 8 characters"),
  name: external_exports.string().min(1, "Name is required"),
  orgName: external_exports.string().min(1, "Organization name is required").optional()
});
var loginSchema = external_exports.object({
  email: external_exports.string().email("Invalid email address"),
  password: external_exports.string().min(1, "Password is required")
});
var forgotPasswordSchema = external_exports.object({
  email: external_exports.string().email("Invalid email address")
});
var resetPasswordSchema = external_exports.object({
  token: external_exports.string().min(1, "Reset token is required"),
  password: external_exports.string().min(8, "Password must be at least 8 characters")
});
var createOrgSchema = external_exports.object({
  name: external_exports.string().min(1, "Organization name is required"),
  slug: external_exports.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes")
});
var inviteMemberSchema = external_exports.object({
  email: external_exports.string().email("Invalid email address"),
  role: external_exports.enum(["admin", "member", "viewer"])
});
var createProjectSchema = external_exports.object({
  name: external_exports.string().min(1, "Project name is required"),
  slug: external_exports.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes"),
  description: external_exports.string().optional()
});
var createApplicationSchema = external_exports.object({
  name: external_exports.string().min(1, "Application name is required"),
  slug: external_exports.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes"),
  environment: external_exports.enum(["development", "staging", "production"]).default("development"),
  appType: external_exports.enum(["web", "mobile", "api", "cli"]).default("web"),
  repoUrl: external_exports.string().url().optional().or(external_exports.literal(""))
});
var createServiceSchema = external_exports.object({
  name: external_exports.string().min(1, "Service name is required"),
  serviceType: external_exports.enum(["database", "api", "auth", "storage", "messaging", "analytics"]),
  provider: external_exports.string().optional(),
  endpointUrl: external_exports.string().url().optional().or(external_exports.literal("")),
  externalId: external_exports.string().optional()
});
var scopeTypeEnum = external_exports.enum(["org", "project", "application", "service"]);
var createScopedEntitlementSchema = external_exports.object({
  scopeType: scopeTypeEnum,
  scopeId: external_exports.string().min(1),
  featureKey: external_exports.string().min(1, "Feature key is required"),
  quota: external_exports.number().int().min(0).optional(),
  enabled: external_exports.boolean().default(true),
  expiresAt: external_exports.string().datetime().optional()
});
var createApiKeySchema = external_exports.object({
  name: external_exports.string().min(1, "API key name is required").max(100),
  orgId: external_exports.string().optional(),
  scopes: external_exports.array(external_exports.string()).default([]),
  expiresAt: external_exports.string().datetime().optional()
});
var agentRegisterSchema = external_exports.object({
  agentId: external_exports.string().min(1, "Agent ID is required").regex(/^[a-z0-9:_-]+$/, "Agent ID must be lowercase alphanumeric with colons, underscores, or dashes"),
  credential: external_exports.string().min(32, "Credential must be at least 32 characters"),
  name: external_exports.string().min(1, "Name is required"),
  orgId: external_exports.string().optional(),
  capabilities: external_exports.array(external_exports.string()).default([]),
  metadata: external_exports.record(external_exports.string(), external_exports.unknown()).default({})
});
var agentLoginSchema = external_exports.object({
  agentId: external_exports.string().min(1, "Agent ID is required"),
  credential: external_exports.string().min(1, "Credential is required")
});
var createUserCredentialSchema = external_exports.object({
  provider: external_exports.string().min(1, "Provider is required"),
  name: external_exports.string().min(1, "Name is required").max(100),
  apiKey: external_exports.string().min(1, "API key is required"),
  isOrgWide: external_exports.boolean().default(false),
  metadata: external_exports.record(external_exports.string(), external_exports.unknown()).default({})
});
var userCredentialProviderEnum = external_exports.enum([
  "openai",
  "huggingface",
  "anthropic",
  "google",
  "cohere",
  "mistral",
  "replicate"
]);
var MEMORY_SCHEMA_SQL = `
CREATE TABLE "users" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "name" text NOT NULL,
  "is_super_admin" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "plans" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL UNIQUE,
  "features_json" json DEFAULT '[]'::json,
  "limits_json" json DEFAULT '{}'::json,
  "price_cents" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "organizations" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "plan_id" varchar REFERENCES "plans"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "memberships" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "org_id" varchar NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'member',
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "entitlements" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" varchar NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "feature_key" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "expires_at" timestamp
);

CREATE TABLE "sessions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "password_reset_tokens" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" text NOT NULL UNIQUE,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "projects" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" varchar NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "applications" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" varchar NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "org_id" varchar NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "environment" text NOT NULL DEFAULT 'development',
  "app_type" text NOT NULL DEFAULT 'web',
  "repo_url" text,
  "metadata_json" json DEFAULT '{}'::json,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "services" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" varchar NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "org_id" varchar NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "service_type" text NOT NULL,
  "provider" text,
  "endpoint_url" text,
  "external_id" text,
  "status" text NOT NULL DEFAULT 'active',
  "metadata_json" json DEFAULT '{}'::json,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "application_services" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "application_id" varchar NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "service_id" varchar NOT NULL REFERENCES "services"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "entitlement_tranches" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "plan_id" varchar REFERENCES "plans"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "tranche_key" text NOT NULL,
  "description" text,
  "default_quota" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "scoped_entitlements" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" varchar NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "scope_type" text NOT NULL,
  "scope_id" varchar NOT NULL,
  "tranche_id" varchar REFERENCES "entitlement_tranches"("id"),
  "feature_key" text NOT NULL,
  "quota" integer DEFAULT 0,
  "consumed" integer DEFAULT 0,
  "enabled" boolean NOT NULL DEFAULT true,
  "expires_at" timestamp,
  "metadata_json" json DEFAULT '{}'::json,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "user_entitlements" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "entitlement_key" text NOT NULL,
  "granted_by" varchar REFERENCES "users"("id"),
  "expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "user_roles" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role_key" text NOT NULL,
  "granted_by" varchar REFERENCES "users"("id"),
  "expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "api_keys" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "key_hash" text NOT NULL,
  "key_prefix" text NOT NULL,
  "org_id" varchar REFERENCES "organizations"("id") ON DELETE CASCADE,
  "created_by" varchar NOT NULL REFERENCES "users"("id"),
  "scopes" json DEFAULT '[]'::json,
  "expires_at" timestamp,
  "last_used_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "audit_logs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar REFERENCES "users"("id"),
  "org_id" varchar REFERENCES "organizations"("id"),
  "action" text NOT NULL,
  "resource" text NOT NULL,
  "resource_id" varchar,
  "metadata_json" json DEFAULT '{}'::json,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "agents" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" text NOT NULL UNIQUE,
  "credential_hash" text NOT NULL,
  "name" text NOT NULL,
  "org_id" varchar REFERENCES "organizations"("id") ON DELETE CASCADE,
  "capabilities" json DEFAULT '[]'::json,
  "metadata" json DEFAULT '{}'::json,
  "is_active" boolean NOT NULL DEFAULT true,
  "last_seen_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "user_credentials" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "org_id" varchar REFERENCES "organizations"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "name" text NOT NULL,
  "credential_encrypted" text NOT NULL,
  "credential_prefix" text,
  "is_org_wide" boolean NOT NULL DEFAULT false,
  "metadata" json DEFAULT '{}'::json,
  "last_used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,

  -- OAuth fields. shared/schema.ts:615-620 is the schema of record and has
  -- declared these since the OAuth work landed; this CREATE TABLE, which is
  -- what actually builds the table, stopped at created_at. A fresh install
  -- therefore built a table the code already believed had six more columns.
  "credential_type" text DEFAULT 'api_key',
  "refresh_token_encrypted" text,
  "expires_at" timestamp,
  "oauth_user_id" varchar(255),
  "oauth_user_email" text,
  "oauth_user_name" text
);

-- Indexes for users table
CREATE UNIQUE INDEX idx_users_email ON "users"("email");

-- Indexes for memberships table
CREATE INDEX idx_memberships_user_id ON "memberships"("user_id");
CREATE INDEX idx_memberships_org_id ON "memberships"("org_id");
CREATE UNIQUE INDEX idx_memberships_org_user ON "memberships"("org_id", "user_id");

-- Indexes for sessions table
CREATE INDEX idx_sessions_user_id ON "sessions"("user_id");
CREATE INDEX idx_sessions_expires ON "sessions"("expires_at");

-- Indexes for projects table
CREATE INDEX idx_projects_org_id ON "projects"("org_id");
CREATE UNIQUE INDEX idx_projects_org_slug ON "projects"("org_id", "slug");

-- Indexes for applications table
CREATE INDEX idx_applications_org_id ON "applications"("org_id");
CREATE INDEX idx_applications_project_id ON "applications"("project_id");

-- Indexes for services table
CREATE INDEX idx_services_org_id ON "services"("org_id");
CREATE INDEX idx_services_project_id ON "services"("project_id");

-- Indexes for api_keys table
CREATE INDEX idx_api_keys_org_id ON "api_keys"("org_id");
CREATE INDEX idx_api_keys_created_by ON "api_keys"("created_by");

-- Indexes for audit_logs table
CREATE INDEX idx_audit_logs_org_created ON "audit_logs"("org_id", "created_at");
CREATE INDEX idx_audit_logs_user_created ON "audit_logs"("user_id", "created_at");
CREATE INDEX idx_audit_logs_resource ON "audit_logs"("resource", "resource_id");

-- Indexes for agents table
CREATE UNIQUE INDEX idx_agents_agent_id ON "agents"("agent_id");
CREATE INDEX idx_agents_org_id ON "agents"("org_id");

-- Indexes for user_credentials table
CREATE INDEX idx_user_credentials_user_id ON "user_credentials"("user_id");
CREATE INDEX idx_user_credentials_org_id ON "user_credentials"("org_id");
CREATE INDEX idx_user_credentials_provider ON "user_credentials"("provider");
CREATE INDEX idx_user_credentials_user_provider ON "user_credentials"("user_id", "provider");
`;
var database = initializeDatabase({
  serviceId: "identity-service",
  memorySchema: MEMORY_SCHEMA_SQL,
  memoryDbEnvVar: "IDENTITY_USE_MEMORY_DB"
}, schema_exports);
var { db, isMemory, exportToFile, close } = database;
var pool = database.pool;
var DatabaseStorage = class {
  // Users
  async getUser(id) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || void 0;
  }
  async getUserByEmail(email) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || void 0;
  }
  async createUser(insertUser) {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }
  async updateUser(id, data) {
    const [user] = await db.update(users).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(users.id, id)).returning();
    return user || void 0;
  }
  async getAllUsers() {
    return db.select().from(users);
  }
  async deleteUser(id) {
    await db.update(auditLogs).set({ userId: null }).where(eq(auditLogs.userId, id));
    await db.delete(apiKeys).where(eq(apiKeys.createdBy, id));
    await db.delete(users).where(eq(users.id, id));
  }
  // Organizations
  async getOrganization(id) {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    return org || void 0;
  }
  async getOrganizationBySlug(slug) {
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug));
    return org || void 0;
  }
  async getAllOrganizations() {
    return db.select().from(organizations);
  }
  async createOrganization(insertOrg) {
    const [org] = await db.insert(organizations).values(insertOrg).returning();
    return org;
  }
  async createOrganizationWithId(insertOrg) {
    const [org] = await db.insert(organizations).values(insertOrg).returning();
    return org;
  }
  async updateOrganization(id, data) {
    const [org] = await db.update(organizations).set(data).where(eq(organizations.id, id)).returning();
    return org || void 0;
  }
  async deleteOrganization(id) {
    await db.update(auditLogs).set({ orgId: null }).where(eq(auditLogs.orgId, id));
    await db.delete(organizations).where(eq(organizations.id, id));
  }
  // Memberships
  async getMembership(id) {
    const [membership] = await db.select().from(memberships).where(eq(memberships.id, id));
    return membership || void 0;
  }
  async getMembershipByUserAndOrg(userId, orgId) {
    const [membership] = await db.select().from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)));
    return membership || void 0;
  }
  async getMembershipsByUser(userId) {
    return db.select().from(memberships).where(eq(memberships.userId, userId));
  }
  async getMembershipsByOrg(orgId) {
    const result = await db.select({
      id: memberships.id,
      userId: memberships.userId,
      orgId: memberships.orgId,
      role: memberships.role,
      createdAt: memberships.createdAt,
      user: users
    }).from(memberships).leftJoin(users, eq(memberships.userId, users.id)).where(eq(memberships.orgId, orgId));
    return result.filter((r) => r.user !== null);
  }
  async createMembership(insertMembership) {
    const [membership] = await db.insert(memberships).values(insertMembership).returning();
    return membership;
  }
  async updateMembership(id, data) {
    const [membership] = await db.update(memberships).set(data).where(eq(memberships.id, id)).returning();
    return membership || void 0;
  }
  async deleteMembership(id) {
    await db.delete(memberships).where(eq(memberships.id, id));
  }
  // Plans
  async getPlan(id) {
    const [plan] = await db.select().from(plans).where(eq(plans.id, id));
    return plan || void 0;
  }
  async getPlanByName(name) {
    const [plan] = await db.select().from(plans).where(eq(plans.name, name));
    return plan || void 0;
  }
  async getAllPlans() {
    return db.select().from(plans);
  }
  async createPlan(insertPlan) {
    const normalizedPlan = {
      ...insertPlan,
      featuresJson: insertPlan.featuresJson ? [...insertPlan.featuresJson] : [],
      limitsJson: insertPlan.limitsJson ? { ...insertPlan.limitsJson } : {}
    };
    const [plan] = await db.insert(plans).values(normalizedPlan).returning();
    return plan;
  }
  async updatePlan(id, data) {
    const normalized = {
      ...data,
      featuresJson: data.featuresJson ? [...data.featuresJson] : data.featuresJson,
      limitsJson: data.limitsJson ? { ...data.limitsJson } : data.limitsJson
    };
    const [plan] = await db.update(plans).set(normalized).where(eq(plans.id, id)).returning();
    return plan || void 0;
  }
  // Entitlements
  async getEntitlementsByOrg(orgId) {
    return db.select().from(entitlements).where(eq(entitlements.orgId, orgId));
  }
  async createEntitlement(insertEntitlement) {
    const [entitlement] = await db.insert(entitlements).values(insertEntitlement).returning();
    return entitlement;
  }
  async updateEntitlement(id, data) {
    const [entitlement] = await db.update(entitlements).set(data).where(eq(entitlements.id, id)).returning();
    return entitlement || void 0;
  }
  // Sessions
  async getSession(id) {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
    return session || void 0;
  }
  async getSessionByTokenHash(tokenHash) {
    const [session] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash));
    return session || void 0;
  }
  async createSession(insertSession) {
    const [session] = await db.insert(sessions).values(insertSession).returning();
    return session;
  }
  async deleteSession(id) {
    await db.delete(sessions).where(eq(sessions.id, id));
  }
  async deleteSessionsByUser(userId) {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  }
  // Audit Logs
  async createAuditLog(insertLog) {
    const [log] = await db.insert(auditLogs).values(insertLog).returning();
    return log;
  }
  async getAuditLogsByOrg(orgId) {
    return db.select().from(auditLogs).where(eq(auditLogs.orgId, orgId));
  }
  async getAllAuditLogs() {
    return db.select().from(auditLogs);
  }
  // Projects
  async getProject(id) {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project || void 0;
  }
  async getProjectsByOrg(orgId) {
    return db.select().from(projects).where(eq(projects.orgId, orgId));
  }
  async createProject(insertProject) {
    const [project] = await db.insert(projects).values(insertProject).returning();
    return project;
  }
  async updateProject(id, data) {
    const [project] = await db.update(projects).set(data).where(eq(projects.id, id)).returning();
    return project || void 0;
  }
  async deleteProject(id) {
    await db.delete(projects).where(eq(projects.id, id));
  }
  // Applications
  async getApplication(id) {
    const [app] = await db.select().from(applications).where(eq(applications.id, id));
    return app || void 0;
  }
  async getApplicationsByProject(projectId) {
    return db.select().from(applications).where(eq(applications.projectId, projectId));
  }
  async getApplicationsByOrg(orgId) {
    return db.select().from(applications).where(eq(applications.orgId, orgId));
  }
  async createApplication(insertApp) {
    const [app] = await db.insert(applications).values(insertApp).returning();
    return app;
  }
  async updateApplication(id, data) {
    const [app] = await db.update(applications).set(data).where(eq(applications.id, id)).returning();
    return app || void 0;
  }
  async deleteApplication(id) {
    await db.delete(applications).where(eq(applications.id, id));
  }
  // Services
  async getService(id) {
    const [service] = await db.select().from(services).where(eq(services.id, id));
    return service || void 0;
  }
  async getServicesByProject(projectId) {
    return db.select().from(services).where(eq(services.projectId, projectId));
  }
  async getServicesByOrg(orgId) {
    return db.select().from(services).where(eq(services.orgId, orgId));
  }
  async createService(insertService) {
    const [service] = await db.insert(services).values(insertService).returning();
    return service;
  }
  async updateService(id, data) {
    const [service] = await db.update(services).set(data).where(eq(services.id, id)).returning();
    return service || void 0;
  }
  async deleteService(id) {
    await db.delete(services).where(eq(services.id, id));
  }
  // Application-Service Links
  async linkApplicationService(appId, serviceId) {
    const [link] = await db.insert(applicationServices).values({
      applicationId: appId,
      serviceId
    }).returning();
    return link;
  }
  async unlinkApplicationService(appId, serviceId) {
    await db.delete(applicationServices).where(
      and(eq(applicationServices.applicationId, appId), eq(applicationServices.serviceId, serviceId))
    );
  }
  async getServicesByApplication(appId) {
    const links = await db.select({ serviceId: applicationServices.serviceId }).from(applicationServices).where(eq(applicationServices.applicationId, appId));
    if (links.length === 0) return [];
    const serviceIds = links.map((l) => l.serviceId);
    const result = [];
    for (const serviceId of serviceIds) {
      const [service] = await db.select().from(services).where(eq(services.id, serviceId));
      if (service) result.push(service);
    }
    return result;
  }
  // Entitlement Tranches
  async getEntitlementTranche(id) {
    const [tranche] = await db.select().from(entitlementTranches).where(eq(entitlementTranches.id, id));
    return tranche || void 0;
  }
  async getEntitlementTranchesByPlan(planId) {
    return db.select().from(entitlementTranches).where(eq(entitlementTranches.planId, planId));
  }
  async createEntitlementTranche(insertTranche) {
    const [tranche] = await db.insert(entitlementTranches).values(insertTranche).returning();
    return tranche;
  }
  // Scoped Entitlements
  async getScopedEntitlement(id) {
    const [entitlement] = await db.select().from(scopedEntitlements).where(eq(scopedEntitlements.id, id));
    return entitlement || void 0;
  }
  async getScopedEntitlementsByScope(scopeType, scopeId) {
    return db.select().from(scopedEntitlements).where(
      and(eq(scopedEntitlements.scopeType, scopeType), eq(scopedEntitlements.scopeId, scopeId))
    );
  }
  async getScopedEntitlementsByOrg(orgId) {
    return db.select().from(scopedEntitlements).where(eq(scopedEntitlements.orgId, orgId));
  }
  async createScopedEntitlement(insertEntitlement) {
    const [entitlement] = await db.insert(scopedEntitlements).values(insertEntitlement).returning();
    return entitlement;
  }
  async updateScopedEntitlement(id, data) {
    const [entitlement] = await db.update(scopedEntitlements).set(data).where(eq(scopedEntitlements.id, id)).returning();
    return entitlement || void 0;
  }
  async deleteScopedEntitlement(id) {
    await db.delete(scopedEntitlements).where(eq(scopedEntitlements.id, id));
  }
  // Password Reset Tokens
  async createPasswordResetToken(insertToken) {
    const [token] = await db.insert(passwordResetTokens).values(insertToken).returning();
    return token;
  }
  async getPasswordResetToken(token) {
    const [result] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, token));
    return result || void 0;
  }
  async markPasswordResetTokenUsed(token) {
    await db.update(passwordResetTokens).set({ usedAt: /* @__PURE__ */ new Date() }).where(eq(passwordResetTokens.token, token));
  }
  // User Entitlements
  async getUserEntitlements(userId) {
    return db.select().from(userEntitlements).where(eq(userEntitlements.userId, userId));
  }
  async getUserEntitlementKeys(userId) {
    const result = await db.select({ key: userEntitlements.entitlementKey }).from(userEntitlements).where(eq(userEntitlements.userId, userId));
    return result.map((r) => r.key);
  }
  async createUserEntitlement(entitlement) {
    const [result] = await db.insert(userEntitlements).values(entitlement).returning();
    return result;
  }
  async deleteUserEntitlement(id) {
    await db.delete(userEntitlements).where(eq(userEntitlements.id, id));
  }
  async deleteUserEntitlementByKey(userId, entitlementKey) {
    await db.delete(userEntitlements).where(
      and(eq(userEntitlements.userId, userId), eq(userEntitlements.entitlementKey, entitlementKey))
    );
  }
  // User Roles
  async getUserRoles(userId) {
    return db.select().from(userRoles).where(eq(userRoles.userId, userId));
  }
  async getUserRoleKeys(userId) {
    const result = await db.select({ key: userRoles.roleKey }).from(userRoles).where(eq(userRoles.userId, userId));
    return result.map((r) => r.key);
  }
  async createUserRole(role) {
    const [result] = await db.insert(userRoles).values(role).returning();
    return result;
  }
  async deleteUserRole(id) {
    await db.delete(userRoles).where(eq(userRoles.id, id));
  }
  async deleteUserRoleByKey(userId, roleKey) {
    await db.delete(userRoles).where(
      and(eq(userRoles.userId, userId), eq(userRoles.roleKey, roleKey))
    );
  }
  // Enriched user data for external services (Object Service integration)
  async getEnrichedUser(userId) {
    const user = await this.getUser(userId);
    if (!user) return void 0;
    const userMemberships = await db.select({
      orgId: memberships.orgId,
      role: memberships.role,
      orgName: organizations.name,
      orgSlug: organizations.slug
    }).from(memberships).innerJoin(organizations, eq(memberships.orgId, organizations.id)).where(eq(memberships.userId, userId));
    const entitlementKeys = await this.getUserEntitlementKeys(userId);
    const roleKeys = await this.getUserRoleKeys(userId);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
      organizations: userMemberships.map((m) => ({
        id: m.orgId,
        name: m.orgName,
        slug: m.orgSlug,
        role: m.role
      })),
      entitlements: entitlementKeys,
      roles: roleKeys
    };
  }
  // API Keys
  async createApiKey(insertApiKey) {
    const normalizedApiKey = {
      ...insertApiKey,
      scopes: insertApiKey.scopes ? [...insertApiKey.scopes] : []
    };
    const [apiKey] = await db.insert(apiKeys).values(normalizedApiKey).returning();
    return apiKey;
  }
  async getApiKey(id) {
    const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
    return apiKey || void 0;
  }
  async getApiKeyByHash(keyHash) {
    const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash));
    return apiKey || void 0;
  }
  async getApiKeysByUser(userId) {
    return db.select().from(apiKeys).where(eq(apiKeys.createdBy, userId));
  }
  async getApiKeysByOrg(orgId) {
    return db.select().from(apiKeys).where(eq(apiKeys.orgId, orgId));
  }
  async updateApiKeyLastUsed(id) {
    await db.update(apiKeys).set({ lastUsedAt: /* @__PURE__ */ new Date() }).where(eq(apiKeys.id, id));
  }
  async revokeApiKey(id) {
    await db.update(apiKeys).set({ revokedAt: /* @__PURE__ */ new Date() }).where(eq(apiKeys.id, id));
  }
  async deleteApiKey(id) {
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
  }
  // Agents (parallel to Users)
  async getAgent(id) {
    const [agent] = await db.select().from(agents).where(eq(agents.id, id));
    return agent || void 0;
  }
  async getAgentByAgentId(agentId) {
    const [agent] = await db.select().from(agents).where(eq(agents.agentId, agentId));
    return agent || void 0;
  }
  async getAgentsByOrg(orgId) {
    return db.select().from(agents).where(eq(agents.orgId, orgId));
  }
  async getAllAgents() {
    return db.select().from(agents);
  }
  async createAgent(insertAgent) {
    const [agent] = await db.insert(agents).values(insertAgent).returning();
    return agent;
  }
  async updateAgent(id, data) {
    const [agent] = await db.update(agents).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(agents.id, id)).returning();
    return agent || void 0;
  }
  async updateAgentLastSeen(id) {
    await db.update(agents).set({ lastSeenAt: /* @__PURE__ */ new Date() }).where(eq(agents.id, id));
  }
  async deleteAgent(id) {
    await db.delete(agents).where(eq(agents.id, id));
  }
  // User Credentials (third-party API keys)
  async getUserCredential(id) {
    const [credential] = await db.select().from(userCredentials).where(eq(userCredentials.id, id));
    return credential || void 0;
  }
  async getUserCredentialsByUser(userId) {
    return db.select().from(userCredentials).where(eq(userCredentials.userId, userId));
  }
  async getUserCredentialsByUserAndProvider(userId, provider) {
    const [credential] = await db.select().from(userCredentials).where(
      and(eq(userCredentials.userId, userId), eq(userCredentials.provider, provider))
    );
    return credential || void 0;
  }
  async getCredentialForUserOrOrg(userId, orgId, provider) {
    console.log(`[storage] getCredentialForUserOrOrg - userId: ${userId}, orgId: ${orgId}, provider: ${provider}`);
    const userCred = await this.getUserCredentialsByUserAndProvider(userId, provider);
    console.log(`[storage] User-specific credential: ${userCred ? `found (id: ${userCred.id})` : "not found"}`);
    if (userCred) return userCred;
    if (orgId) {
      console.log(`[storage] Looking for org-wide credential - orgId: ${orgId}, provider: ${provider}`);
      const [orgCred] = await db.select().from(userCredentials).where(
        and(
          eq(userCredentials.orgId, orgId),
          eq(userCredentials.provider, provider),
          eq(userCredentials.isOrgWide, true)
        )
      );
      console.log(`[storage] Org-wide credential: ${orgCred ? `found (id: ${orgCred.id})` : "not found"}`);
      if (orgCred) return orgCred;
    }
    return void 0;
  }
  async getUserCredentialsByOrg(orgId) {
    return db.select().from(userCredentials).where(eq(userCredentials.orgId, orgId));
  }
  async createUserCredential(credential) {
    const [created] = await db.insert(userCredentials).values(credential).returning();
    return created;
  }
  async updateUserCredential(id, updates) {
    const [updated] = await db.update(userCredentials).set(updates).where(eq(userCredentials.id, id)).returning();
    return updated || void 0;
  }
  async updateUserCredentialLastUsed(id) {
    await db.update(userCredentials).set({ lastUsedAt: /* @__PURE__ */ new Date() }).where(eq(userCredentials.id, id));
  }
  async deleteUserCredential(id) {
    await db.delete(userCredentials).where(eq(userCredentials.id, id));
  }
  // =============================================================================
  // Entity Directory - UUID-based addressing for all principals
  // =============================================================================
  async getEntity(id) {
    const [entity] = await db.select().from(entities).where(eq(entities.id, id));
    return entity || void 0;
  }
  async getEntityBySlugOrgInstance(slug, orgId, instanceId) {
    const conditions = [eq(entities.slug, slug)];
    if (orgId) {
      conditions.push(eq(entities.orgId, orgId));
    } else {
      conditions.push(isNull(entities.orgId));
    }
    if (instanceId) {
      conditions.push(eq(entities.instanceId, instanceId));
    } else {
      conditions.push(isNull(entities.instanceId));
    }
    const [entity] = await db.select().from(entities).where(and(...conditions));
    return entity || void 0;
  }
  async getEntityBySourceId(sourceTable, sourceId) {
    const [entity] = await db.select().from(entities).where(
      and(eq(entities.sourceTable, sourceTable), eq(entities.sourceId, sourceId))
    );
    return entity || void 0;
  }
  async getEntityByNodeId(nodeId) {
    const [entity] = await db.select().from(entities).where(eq(entities.boundNodeId, nodeId));
    return entity || void 0;
  }
  async listEntities(filters) {
    const conditions = [];
    if (filters.type) {
      conditions.push(eq(entities.type, filters.type));
    }
    if (filters.orgId) {
      conditions.push(eq(entities.orgId, filters.orgId));
    }
    if (filters.slug) {
      conditions.push(eq(entities.slug, filters.slug));
    }
    if (filters.status) {
      conditions.push(eq(entities.status, filters.status));
    }
    let query = db.select().from(entities);
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    const results = await query;
    if (filters.allowedOrgIds) {
      return results.filter(
        (e) => !e.orgId || filters.allowedOrgIds.includes(e.orgId)
      );
    }
    return results;
  }
  async createEntity(entity) {
    const [created] = await db.insert(entities).values({
      ...entity,
      registeredAt: /* @__PURE__ */ new Date(),
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    }).returning();
    return created;
  }
  async updateEntity(id, updates) {
    const [updated] = await db.update(entities).set({ ...updates, updatedAt: /* @__PURE__ */ new Date() }).where(eq(entities.id, id)).returning();
    return updated || void 0;
  }
  async bindEntityToNode(entityId, nodeId) {
    const [updated] = await db.update(entities).set({
      boundNodeId: nodeId,
      boundAt: /* @__PURE__ */ new Date(),
      lastSeenAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(entities.id, entityId)).returning();
    return updated || void 0;
  }
  async unbindEntityFromNode(entityId) {
    const [updated] = await db.update(entities).set({
      boundNodeId: null,
      boundAt: null,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(entities.id, entityId)).returning();
    return updated || void 0;
  }
  async resolveEntityAddress(address, contextOrgId) {
    const cleanAddress = address.startsWith("@") ? address.slice(1) : address;
    if (cleanAddress.startsWith("ent_")) {
      const entity = await this.getEntity(cleanAddress);
      return entity ? [entity] : [];
    }
    const instanceMatch = cleanAddress.match(/^([^#]+)#(.+)$/);
    if (instanceMatch) {
      const [, slug, instanceId] = instanceMatch;
      const entity = await this.getEntityBySlugOrgInstance(slug, contextOrgId, instanceId);
      return entity ? [entity] : [];
    }
    const qualifiedMatch = cleanAddress.match(/^([^:]+):(.+)$/);
    if (qualifiedMatch) {
      const [, type, slug] = qualifiedMatch;
      const conditions = [eq(entities.type, type), eq(entities.slug, slug)];
      if (contextOrgId) {
        conditions.push(or(eq(entities.orgId, contextOrgId), isNull(entities.orgId)));
      }
      return db.select().from(entities).where(and(...conditions));
    }
    const aliasConditions = [eq(entityAliases.aliasValue, cleanAddress)];
    if (contextOrgId) {
      aliasConditions.push(or(eq(entityAliases.orgId, contextOrgId), isNull(entityAliases.orgId)));
    }
    const aliasResults = await db.select().from(entityAliases).where(and(...aliasConditions)).orderBy(entityAliases.priority);
    if (aliasResults.length > 0) {
      const entityIds = [...new Set(aliasResults.map((a) => a.entityId))];
      return db.select().from(entities).where(inArray(entities.id, entityIds));
    }
    const slugConditions = [eq(entities.slug, cleanAddress)];
    if (contextOrgId) {
      slugConditions.push(or(eq(entities.orgId, contextOrgId), isNull(entities.orgId)));
    }
    return db.select().from(entities).where(and(...slugConditions));
  }
  async getSimilarEntities(address, contextOrgId) {
    const cleanAddress = address.startsWith("@") ? address.slice(1) : address;
    const pattern = `%${cleanAddress}%`;
    const conditions = [like(entities.slug, pattern)];
    if (contextOrgId) {
      conditions.push(or(eq(entities.orgId, contextOrgId), isNull(entities.orgId)));
    }
    const results = await db.select({ slug: entities.slug }).from(entities).where(and(...conditions)).limit(5);
    return results.map((r) => r.slug);
  }
  // Entity Aliases
  async createEntityAlias(alias) {
    const [created] = await db.insert(entityAliases).values(alias).returning();
    return created;
  }
  async getEntityAliases(entityId) {
    return db.select().from(entityAliases).where(eq(entityAliases.entityId, entityId));
  }
  async deleteEntityAlias(id) {
    await db.delete(entityAliases).where(eq(entityAliases.id, id));
  }
  // Entity Instances
  async createEntityInstance(instance) {
    const [created] = await db.insert(entityInstances).values(instance).returning();
    return created;
  }
  async getEntityInstances(entityId) {
    return db.select().from(entityInstances).where(eq(entityInstances.entityId, entityId));
  }
  async updateEntityInstanceStatus(id, status, nodeId) {
    const updates = {
      status,
      lastHeartbeat: /* @__PURE__ */ new Date()
    };
    if (nodeId !== void 0) {
      updates.nodeId = nodeId;
    }
    const [updated] = await db.update(entityInstances).set(updates).where(eq(entityInstances.id, id)).returning();
    return updated || void 0;
  }
  // Stats
  async getStats() {
    const allUsers = await db.select().from(users);
    const allOrgs = await db.select().from(organizations);
    const allAgents = await db.select().from(agents);
    return {
      totalUsers: allUsers.length,
      totalOrgs: allOrgs.length,
      totalAgents: allAgents.length
    };
  }
};
var storage = new DatabaseStorage();
var SYSTEM_SECRET = null;
var SYSTEM_ORG_ID = DEFAULT_ORG_IDS.SYMBIA_SYSTEM;
var SYSTEM_ORG_NAME = "Symbia System";
var SYSTEM_ORG_SLUG = "symbia-system";
async function initSystemBootstrap() {
  SYSTEM_SECRET = crypto.randomBytes(32).toString("hex");
  console.log("[identity] System bootstrap secret generated (in-memory only)");
  const existingOrg = await storage.getOrganization(SYSTEM_ORG_ID);
  if (!existingOrg) {
    await storage.createOrganizationWithId({
      id: SYSTEM_ORG_ID,
      name: SYSTEM_ORG_NAME,
      slug: SYSTEM_ORG_SLUG
    });
    console.log("[identity] Created symbia-system organization");
  } else {
    console.log("[identity] symbia-system organization already exists");
  }
}
function getBootstrapConfig() {
  if (!SYSTEM_SECRET) return null;
  return {
    secret: SYSTEM_SECRET,
    orgId: SYSTEM_ORG_ID,
    orgName: SYSTEM_ORG_NAME,
    serviceId: "system"
  };
}
async function addUserToSystemOrg(userId) {
  const memberships2 = await storage.getMembershipsByUser(userId);
  const alreadyMember = memberships2.some((m) => m.orgId === SYSTEM_ORG_ID);
  if (!alreadyMember) {
    await storage.createMembership({
      userId,
      orgId: SYSTEM_ORG_ID,
      role: "admin"
    });
    console.log(`[identity] Added user ${userId} to symbia-system org`);
  }
}
var DEFAULT_ADMIN_EMAIL = "dev@example.com";
function resolveAdminPassword() {
  const fromEnv = process.env.IDENTITY_DEFAULT_ADMIN_PASSWORD;
  if (fromEnv && fromEnv.length > 0) return { password: fromEnv, source: "environment" };
  return { password: randomBytes(24).toString("base64url"), source: "generated" };
}
function adminSeedNotice(created, pw) {
  if (!created) {
    return `\u2713 Default admin already present (${DEFAULT_ADMIN_EMAIL}) in org symbia-labs \u2014 password unchanged`;
  }
  if (pw.source === "environment") {
    return `\u2713 Default admin created (${DEFAULT_ADMIN_EMAIL}) in org symbia-labs \u2014 password from IDENTITY_DEFAULT_ADMIN_PASSWORD`;
  }
  return [
    `\u2713 Default admin created (${DEFAULT_ADMIN_EMAIL}) in org symbia-labs`,
    ``,
    `    Generated password, shown once and not stored in plaintext:`,
    ``,
    `        ${pw.password}`,
    ``,
    `    Set IDENTITY_DEFAULT_ADMIN_PASSWORD to choose your own.`,
    ``
  ].join("\n");
}
var connectionSettings;
async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY ? "repl " + process.env.REPL_IDENTITY : process.env.WEB_REPL_RENEWAL ? "depl " + process.env.WEB_REPL_RENEWAL : null;
  if (!xReplitToken) {
    throw new Error("X_REPLIT_TOKEN not found for repl/depl");
  }
  const response = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=google-mail",
    {
      headers: {
        "Accept": "application/json",
        "X_REPLIT_TOKEN": xReplitToken
      }
    }
  );
  const data = await response.json();
  connectionSettings = data.items?.[0];
  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;
  if (!connectionSettings || !accessToken) {
    throw new Error("Gmail not connected");
  }
  return accessToken;
}
async function getGmailClient() {
  const accessToken = await getAccessToken();
  let google;
  try {
    ({ google } = await import("googleapis"));
  } catch {
    throw new Error(
      "Sending mail needs the googleapis package, which is an optional dependency and is not installed. Install it in the plugin directory (npm install googleapis) if this stack should send mail. It is optional because it is 114 MB and an ephemeral local stack never reaches this path."
    );
  }
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });
  return google.gmail({ version: "v1", auth: oauth2Client });
}
function createEmailMessage(to, subject, body) {
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    body
  ].join("\n");
  return Buffer.from(message).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function sendPasswordResetEmail(to, resetToken, userName) {
  try {
    const gmail = await getGmailClient();
    const { resolveServiceUrl, ServiceId } = await import("../chunks/dist-HAEKQQP7.mjs");
    const baseUrl = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : process.env.REPLIT_DEPLOYMENT_URL || resolveServiceUrl(ServiceId.SERVER);
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Password Reset Request</h2>
          <p>Hi ${userName},</p>
          <p>We received a request to reset your password for your Symbia account. Click the button below to set a new password:</p>
          <a href="${resetLink}" class="button">Reset Password</a>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #0066cc;">${resetLink}</p>
          <p>This link will expire in 1 hour for security reasons.</p>
          <p>If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.</p>
          <div class="footer">
            <p>This is an automated message from Symbia Identity Service.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    const encodedMessage = createEmailMessage(to, "Reset Your Symbia Password", htmlBody);
    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage
      }
    });
    console.log(`Password reset email sent to ${to}`);
    return true;
  } catch (error) {
    console.error("Failed to send password reset email:", error);
    return false;
  }
}
var seen = /* @__PURE__ */ new Set();
function reportUnknownKeys(route, body, known) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return;
  const knownSet = new Set(known);
  const extra = Object.keys(body).filter((k) => !knownSet.has(k));
  if (!extra.length) return;
  const signature = `${route}:${extra.sort().join(",")}`;
  if (seen.has(signature)) return;
  seen.add(signature);
  console.warn(
    `[unknown-keys] ${route} received ${extra.length} key(s) this schema does not know: ${extra.join(", ")} \u2014 accepted and dropped. Names only; no values are logged.`
  );
}
var apiDocumentation = {
  openapi: "3.0.3",
  info: {
    title: "Symbia Identity Service API",
    version: "1.0.0",
    description: "Authentication, authorization, and entitlements API for the Symbia ecosystem. Use this service to manage users, organizations, projects, applications, services, and feature entitlements.\n\n**Scope Headers (optional)**: X-Org-Id, X-Service-Id, X-Env, X-Data-Class, X-Policy-Ref."
  },
  servers: [
    {
      url: "/api",
      description: "API Base URL"
    }
  ],
  paths: {
    "/auth/register": {
      post: {
        tags: ["Authentication"],
        summary: "Register a new user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password", "name"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 8 },
                  name: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "User registered successfully" },
          "400": { description: "Invalid input or email already exists" }
        }
      }
    },
    "/auth/login": {
      post: {
        tags: ["Authentication"],
        summary: "Login user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Login successful, returns user data and sets auth cookie" },
          "401": { description: "Invalid credentials" }
        }
      }
    },
    "/auth/logout": {
      post: {
        tags: ["Authentication"],
        summary: "Logout user",
        security: [{ cookieAuth: [] }],
        responses: {
          "200": { description: "Logged out successfully" }
        }
      }
    },
    "/auth/refresh": {
      post: {
        tags: ["Authentication"],
        summary: "Refresh authentication token",
        security: [{ cookieAuth: [] }],
        responses: {
          "200": { description: "Token refreshed" },
          "401": { description: "Invalid or expired token" }
        }
      }
    },
    "/auth/introspect": {
      post: {
        tags: ["Authentication", "Service-to-Service"],
        summary: "Validate token and get user principal (RFC 7662)",
        description: "Token introspection endpoint for service-to-service auth. Returns user principal with organizations, entitlements, and roles if token is valid.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["token"],
                properties: {
                  token: { type: "string", description: "JWT token to validate" }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Token introspection response",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    active: { type: "boolean", description: "Whether the token is valid" },
                    sub: { type: "string", format: "uuid", description: "User ID" },
                    email: { type: "string", format: "email" },
                    name: { type: "string" },
                    isSuperAdmin: { type: "boolean" },
                    organizations: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", format: "uuid" },
                          name: { type: "string" },
                          slug: { type: "string" },
                          role: { type: "string", enum: ["admin", "member", "viewer"] }
                        }
                      }
                    },
                    entitlements: { type: "array", items: { type: "string" } },
                    roles: { type: "array", items: { type: "string" } },
                    token_type: { type: "string", enum: ["Bearer"] },
                    iat: { type: "integer", description: "Issued at timestamp" },
                    exp: { type: "integer", description: "Expiration timestamp" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/auth/verify-api-key": {
      post: {
        tags: ["Authentication", "API Keys"],
        summary: "Verify an API key (for service-to-service auth)",
        description: "Validates an API key and returns the associated user/org principal if valid. Use this for service-to-service authentication.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["apiKey"],
                properties: {
                  apiKey: { type: "string", description: "API key to validate (e.g., sk_...)" }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Verification result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    valid: { type: "boolean" },
                    error: { type: "string", description: "Error message if not valid" },
                    keyId: { type: "string", format: "uuid" },
                    name: { type: "string" },
                    orgId: { type: "string", format: "uuid", nullable: true },
                    scopes: { type: "array", items: { type: "string" } },
                    creator: {
                      type: "object",
                      description: "Enriched user data of the key creator",
                      properties: {
                        id: { type: "string", format: "uuid" },
                        email: { type: "string", format: "email" },
                        entitlements: { type: "array", items: { type: "string" } },
                        roles: { type: "array", items: { type: "string" } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api-keys": {
      post: {
        tags: ["API Keys"],
        summary: "Create a new API key",
        description: "Mints a new API key for service-to-service authentication. The full key is returned only once.",
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", description: "Human-readable name for the key" },
                  orgId: { type: "string", format: "uuid", description: "Optional org to scope the key to" },
                  scopes: { type: "array", items: { type: "string" }, description: "Permission scopes" },
                  expiresAt: { type: "string", format: "date-time", description: "Optional expiration date" }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "API key created - includes the full key (shown only once)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiKeyCreated" }
              }
            }
          },
          "403": { description: "Insufficient permissions" }
        }
      },
      get: {
        tags: ["API Keys"],
        summary: "List your API keys",
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: {
          "200": {
            description: "List of API keys (without the actual key values)",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/ApiKey" }
                }
              }
            }
          }
        }
      }
    },
    "/api-keys/{id}": {
      get: {
        tags: ["API Keys"],
        summary: "Get API key details",
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "API key details" },
          "404": { description: "API key not found" }
        }
      },
      delete: {
        tags: ["API Keys"],
        summary: "Delete an API key permanently",
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "API key deleted" },
          "404": { description: "API key not found" }
        }
      }
    },
    "/api-keys/{id}/revoke": {
      post: {
        tags: ["API Keys"],
        summary: "Revoke an API key",
        description: "Marks the key as revoked. It can no longer be used but remains in history.",
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "API key revoked" },
          "400": { description: "API key already revoked" }
        }
      }
    },
    "/api-keys/{id}/rotate": {
      post: {
        tags: ["API Keys"],
        summary: "Rotate an API key",
        description: "Revokes the old key and creates a new one with the same settings.",
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": {
            description: "New API key created (old key revoked)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiKeyCreated" }
              }
            }
          }
        }
      }
    },
    "/users/me": {
      get: {
        tags: ["Users"],
        summary: "Get current user profile",
        security: [{ cookieAuth: [] }],
        responses: {
          "200": {
            description: "User profile",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/User" }
              }
            }
          }
        }
      },
      patch: {
        tags: ["Users"],
        summary: "Update current user profile",
        security: [{ cookieAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Profile updated" }
        }
      }
    },
    "/orgs": {
      get: {
        tags: ["Organizations"],
        summary: "List user's organizations",
        security: [{ cookieAuth: [] }],
        responses: {
          "200": {
            description: "List of organizations",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    organizations: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Organization" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ["Organizations"],
        summary: "Create a new organization",
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "slug"],
                properties: {
                  name: { type: "string" },
                  slug: { type: "string", pattern: "^[a-z0-9-]+$" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Organization created" }
        }
      }
    },
    "/orgs/{orgId}": {
      get: {
        tags: ["Organizations"],
        summary: "Get organization details",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "orgId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": {
            description: "Organization details with members and entitlements"
          }
        }
      }
    },
    "/orgs/{orgId}/projects": {
      get: {
        tags: ["Projects"],
        summary: "List projects in an organization",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "orgId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": {
            description: "List of projects",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    projects: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Project" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ["Projects"],
        summary: "Create a new project",
        description: "Requires admin or member role",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "orgId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "slug"],
                properties: {
                  name: { type: "string" },
                  slug: { type: "string", pattern: "^[a-z0-9-]+$" },
                  description: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Project created" },
          "403": { description: "Insufficient permissions" }
        }
      }
    },
    "/projects/{projectId}": {
      get: {
        tags: ["Projects"],
        summary: "Get project details",
        description: "Returns project with its applications, services, and entitlements",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": {
            description: "Project details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    project: { $ref: "#/components/schemas/Project" },
                    applications: { type: "array", items: { $ref: "#/components/schemas/Application" } },
                    services: { type: "array", items: { $ref: "#/components/schemas/Service" } },
                    entitlements: { type: "array", items: { $ref: "#/components/schemas/ScopedEntitlement" } }
                  }
                }
              }
            }
          }
        }
      },
      patch: {
        tags: ["Projects"],
        summary: "Update project",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  status: { type: "string", enum: ["active", "archived", "suspended"] }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Project updated" }
        }
      },
      delete: {
        tags: ["Projects"],
        summary: "Delete project",
        description: "Admin only",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Project deleted" },
          "403": { description: "Only admins can delete projects" }
        }
      }
    },
    "/projects/{projectId}/applications": {
      get: {
        tags: ["Applications"],
        summary: "List applications in a project",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "List of applications" }
        }
      },
      post: {
        tags: ["Applications"],
        summary: "Create a new application",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "slug", "environment", "appType"],
                properties: {
                  name: { type: "string" },
                  slug: { type: "string", pattern: "^[a-z0-9-]+$" },
                  environment: { type: "string", enum: ["development", "staging", "production"] },
                  appType: { type: "string", enum: ["web", "mobile", "api", "cli"] },
                  repoUrl: { type: "string", format: "uri" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Application created" }
        }
      }
    },
    "/applications/{appId}": {
      get: {
        tags: ["Applications"],
        summary: "Get application details",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "appId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": {
            description: "Application with services and entitlements",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    application: { $ref: "#/components/schemas/Application" },
                    services: { type: "array", items: { $ref: "#/components/schemas/Service" } },
                    entitlements: { type: "array", items: { $ref: "#/components/schemas/ScopedEntitlement" } }
                  }
                }
              }
            }
          }
        }
      },
      patch: {
        tags: ["Applications"],
        summary: "Update application",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "appId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Application updated" }
        }
      },
      delete: {
        tags: ["Applications"],
        summary: "Delete application",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "appId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Application deleted" }
        }
      }
    },
    "/projects/{projectId}/services": {
      get: {
        tags: ["Services"],
        summary: "List services in a project",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "List of services" }
        }
      },
      post: {
        tags: ["Services"],
        summary: "Create a new service",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "serviceType"],
                properties: {
                  name: { type: "string" },
                  serviceType: { type: "string", enum: ["database", "api", "auth", "storage", "messaging", "analytics"] },
                  provider: { type: "string" },
                  endpointUrl: { type: "string", format: "uri" },
                  externalId: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Service created" }
        }
      }
    },
    "/services/{serviceId}": {
      get: {
        tags: ["Services"],
        summary: "Get service details",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "serviceId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Service with entitlements" }
        }
      },
      patch: {
        tags: ["Services"],
        summary: "Update service",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "serviceId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Service updated" }
        }
      },
      delete: {
        tags: ["Services"],
        summary: "Delete service",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "serviceId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Service deleted" }
        }
      }
    },
    "/applications/{appId}/services/{serviceId}": {
      post: {
        tags: ["Applications", "Services"],
        summary: "Link a service to an application",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "appId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "serviceId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Service linked to application" }
        }
      },
      delete: {
        tags: ["Applications", "Services"],
        summary: "Unlink a service from an application",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "appId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "serviceId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Service unlinked" }
        }
      }
    },
    "/scoped-entitlements/{scopeType}/{scopeId}": {
      get: {
        tags: ["Entitlements"],
        summary: "Get entitlements for a specific scope",
        description: "Retrieve entitlements scoped to an org, project, application, or service",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "scopeType", in: "path", required: true, schema: { type: "string", enum: ["org", "project", "application", "service"] } },
          { name: "scopeId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": {
            description: "List of scoped entitlements",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    entitlements: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ScopedEntitlement" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/scoped-entitlements": {
      post: {
        tags: ["Entitlements"],
        summary: "Create a scoped entitlement",
        description: "Admin only. Create an entitlement for org, project, application, or service scope.",
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["scopeType", "scopeId", "featureKey", "enabled"],
                properties: {
                  scopeType: { type: "string", enum: ["org", "project", "application", "service"] },
                  scopeId: { type: "string", format: "uuid" },
                  featureKey: { type: "string" },
                  quota: { type: "integer" },
                  enabled: { type: "boolean" },
                  expiresAt: { type: "string", format: "date-time" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Entitlement created" },
          "403": { description: "Only admins can manage entitlements" }
        }
      }
    },
    "/scoped-entitlements/{id}": {
      patch: {
        tags: ["Entitlements"],
        summary: "Update a scoped entitlement",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  quota: { type: "integer" },
                  consumed: { type: "integer" },
                  enabled: { type: "boolean" },
                  expiresAt: { type: "string", format: "date-time" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Entitlement updated" }
        }
      },
      delete: {
        tags: ["Entitlements"],
        summary: "Delete a scoped entitlement",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Entitlement deleted" }
        }
      }
    },
    "/entitlements/{orgId}": {
      get: {
        tags: ["Entitlements"],
        summary: "Get organization entitlements (legacy)",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "orgId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": { description: "Organization entitlements" }
        }
      }
    },
    "/license/{orgId}": {
      get: {
        tags: ["License"],
        summary: "Get organization license status",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "orgId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": {
            description: "License status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    valid: { type: "boolean" },
                    plan: { $ref: "#/components/schemas/Plan" },
                    features: { type: "object" },
                    limits: { type: "object" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/dashboard": {
      get: {
        tags: ["Dashboard"],
        summary: "Get dashboard data",
        security: [{ cookieAuth: [] }],
        responses: {
          "200": { description: "Dashboard data with stats and recent activity" }
        }
      }
    },
    "/admin/users/{userId}/entitlements": {
      get: {
        tags: ["Super Admin"],
        summary: "Get user's capability entitlements",
        description: "Requires super admin privileges",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": {
            description: "List of user entitlements",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    entitlements: { type: "array", items: { $ref: "#/components/schemas/UserEntitlement" } }
                  }
                }
              }
            }
          },
          "403": { description: "Super admin access required" }
        }
      },
      post: {
        tags: ["Super Admin"],
        summary: "Grant a capability entitlement to a user",
        description: "Requires super admin privileges",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["entitlementKey"],
                properties: {
                  entitlementKey: { type: "string", description: "e.g., cap:registry.write" },
                  expiresAt: { type: "string", format: "date-time" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Entitlement granted" },
          "400": { description: "User already has this entitlement" },
          "403": { description: "Super admin access required" }
        }
      }
    },
    "/admin/users/{userId}/entitlements/{entitlementKey}": {
      delete: {
        tags: ["Super Admin"],
        summary: "Revoke a capability entitlement from a user",
        description: "Requires super admin privileges",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "entitlementKey", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          "200": { description: "Entitlement revoked" },
          "403": { description: "Super admin access required" },
          "404": { description: "Entitlement not found" }
        }
      }
    },
    "/admin/users/{userId}/roles": {
      get: {
        tags: ["Super Admin"],
        summary: "Get user's global roles",
        description: "Requires super admin privileges",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        responses: {
          "200": {
            description: "List of user roles",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    roles: { type: "array", items: { $ref: "#/components/schemas/UserRole" } }
                  }
                }
              }
            }
          },
          "403": { description: "Super admin access required" }
        }
      },
      post: {
        tags: ["Super Admin"],
        summary: "Grant a global role to a user",
        description: "Requires super admin privileges",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["roleKey"],
                properties: {
                  roleKey: { type: "string", description: "e.g., role:publisher" },
                  expiresAt: { type: "string", format: "date-time" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Role granted" },
          "400": { description: "User already has this role" },
          "403": { description: "Super admin access required" }
        }
      }
    },
    "/admin/users/{userId}/roles/{roleKey}": {
      delete: {
        tags: ["Super Admin"],
        summary: "Revoke a global role from a user",
        description: "Requires super admin privileges",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "roleKey", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          "200": { description: "Role revoked" },
          "403": { description: "Super admin access required" },
          "404": { description: "Role not found" }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "auth_token",
        description: "JWT token stored in httpOnly cookie"
      }
    },
    parameters: {
      OrgIdHeader: {
        name: "X-Org-Id",
        in: "header",
        required: false,
        description: "Optional organization scope override.",
        schema: { type: "string" }
      },
      ServiceIdHeader: {
        name: "X-Service-Id",
        in: "header",
        required: false,
        description: "Optional service scope identifier.",
        schema: { type: "string" }
      },
      EnvHeader: {
        name: "X-Env",
        in: "header",
        required: false,
        description: "Optional environment scope (dev|stage|prod).",
        schema: { type: "string" }
      },
      DataClassHeader: {
        name: "X-Data-Class",
        in: "header",
        required: false,
        description: "Optional data classification (none|pii|phi|secret).",
        schema: { type: "string", enum: ["none", "pii", "phi", "secret"] }
      },
      PolicyRefHeader: {
        name: "X-Policy-Ref",
        in: "header",
        required: false,
        description: "Optional policy reference for auditing.",
        schema: { type: "string" }
      }
    },
    schemas: {
      User: {
        type: "object",
        description: "User profile with organizations, entitlements, and roles for Object Service integration",
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          name: { type: "string" },
          isSuperAdmin: { type: "boolean" },
          organizations: {
            type: "array",
            description: "Organizations the user belongs to with their role",
            items: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                name: { type: "string" },
                slug: { type: "string" },
                role: { type: "string", enum: ["admin", "member", "viewer"] }
              }
            }
          },
          entitlements: {
            type: "array",
            description: "Capability entitlements (e.g., cap:registry.write, cap:registry.publish)",
            items: { type: "string" }
          },
          roles: {
            type: "array",
            description: "Global roles (e.g., role:publisher, role:admin)",
            items: { type: "string" }
          },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      UserEntitlement: {
        type: "object",
        description: "A capability grant for a user",
        properties: {
          id: { type: "string", format: "uuid" },
          userId: { type: "string", format: "uuid" },
          entitlementKey: { type: "string", description: "e.g., cap:registry.write" },
          grantedBy: { type: "string", format: "uuid", nullable: true },
          expiresAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      UserRole: {
        type: "object",
        description: "A global role for a user",
        properties: {
          id: { type: "string", format: "uuid" },
          userId: { type: "string", format: "uuid" },
          roleKey: { type: "string", description: "e.g., role:publisher" },
          grantedBy: { type: "string", format: "uuid", nullable: true },
          expiresAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      Organization: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          slug: { type: "string" },
          planId: { type: "string", format: "uuid", nullable: true },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      Project: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          orgId: { type: "string", format: "uuid" },
          name: { type: "string" },
          slug: { type: "string" },
          description: { type: "string", nullable: true },
          status: { type: "string", enum: ["active", "archived", "suspended"] },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      Application: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          projectId: { type: "string", format: "uuid" },
          orgId: { type: "string", format: "uuid" },
          name: { type: "string" },
          slug: { type: "string" },
          environment: { type: "string", enum: ["development", "staging", "production"] },
          appType: { type: "string", enum: ["web", "mobile", "api", "cli"] },
          repoUrl: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      Service: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          projectId: { type: "string", format: "uuid" },
          orgId: { type: "string", format: "uuid" },
          name: { type: "string" },
          serviceType: { type: "string", enum: ["database", "api", "auth", "storage", "messaging", "analytics"] },
          provider: { type: "string", nullable: true },
          endpointUrl: { type: "string", nullable: true },
          externalId: { type: "string", nullable: true },
          status: { type: "string", enum: ["active", "inactive", "error"] },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      ScopedEntitlement: {
        type: "object",
        description: "Polymorphic entitlement that can be scoped to org, project, application, or service",
        properties: {
          id: { type: "string", format: "uuid" },
          orgId: { type: "string", format: "uuid" },
          scopeType: { type: "string", enum: ["org", "project", "application", "service"] },
          scopeId: { type: "string", format: "uuid" },
          featureKey: { type: "string" },
          quota: { type: "integer", nullable: true, description: "Maximum allowed usage" },
          consumed: { type: "integer", description: "Current usage count" },
          enabled: { type: "boolean" },
          expiresAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      Plan: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          featuresJson: { type: "object" },
          limitsJson: { type: "object" },
          priceCents: { type: "integer" }
        }
      },
      ApiKey: {
        type: "object",
        description: "API key metadata (excludes actual key value)",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          keyPrefix: { type: "string", description: "First 8 chars of the key for identification" },
          orgId: { type: "string", format: "uuid", nullable: true },
          scopes: { type: "array", items: { type: "string" } },
          expiresAt: { type: "string", format: "date-time", nullable: true },
          lastUsedAt: { type: "string", format: "date-time", nullable: true },
          revokedAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      ApiKeyCreated: {
        type: "object",
        description: "API key response when creating or rotating (includes full key)",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          key: { type: "string", description: "The full API key - only shown once, store securely" },
          keyPrefix: { type: "string" },
          orgId: { type: "string", format: "uuid", nullable: true },
          scopes: { type: "array", items: { type: "string" } },
          expiresAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          _warning: { type: "string" }
        }
      },
      HealthCheck: {
        type: "object",
        description: "System health status including database connectivity",
        properties: {
          status: { type: "string", enum: ["ok", "degraded", "error"] },
          timestamp: { type: "string", format: "date-time" },
          database: {
            type: "object",
            properties: {
              connected: { type: "boolean" },
              latencyMs: { type: "integer", description: "DB query latency in ms" },
              error: { type: "string", description: "Error message if not connected" }
            }
          },
          email: {
            type: "object",
            properties: {
              enabled: { type: "boolean" }
            }
          },
          version: { type: "string" }
        }
      }
    }
  }
};
var scopeParameters = [
  { $ref: "#/components/parameters/OrgIdHeader" },
  { $ref: "#/components/parameters/ServiceIdHeader" },
  { $ref: "#/components/parameters/EnvHeader" },
  { $ref: "#/components/parameters/DataClassHeader" },
  { $ref: "#/components/parameters/PolicyRefHeader" }
];
var scopeRefs = new Set(scopeParameters.map((param) => param.$ref));
if (apiDocumentation.paths) {
  Object.values(apiDocumentation.paths).forEach((pathItem) => {
    const existing = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    const merged = [...scopeParameters, ...existing.filter((param) => !scopeRefs.has(param?.$ref))];
    pathItem.parameters = merged;
  });
}
{
  const __autoDocumentedPaths = {
    "/admin/orgs/{id}": {
      "delete": {
        "tags": [
          "Admin"
        ],
        "summary": "Delete orgs",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "204": {
            "description": "Deleted"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      },
      "patch": {
        "tags": [
          "Admin"
        ],
        "summary": "Update orgs",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/admin/users/{id}": {
      "delete": {
        "tags": [
          "Admin"
        ],
        "summary": "Delete users",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "204": {
            "description": "Deleted"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      },
      "patch": {
        "tags": [
          "Admin"
        ],
        "summary": "Update users",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/auth/keys/{id}": {
      "delete": {
        "tags": [
          "Auth"
        ],
        "summary": "Delete keys",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "204": {
            "description": "Deleted"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      },
      "get": {
        "tags": [
          "Auth"
        ],
        "summary": "Get keys",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/credentials/{id}": {
      "delete": {
        "tags": [
          "Credentials"
        ],
        "summary": "Delete credentials",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "204": {
            "description": "Deleted"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/orgs/{orgId}/members/{memberId}": {
      "delete": {
        "tags": [
          "Orgs"
        ],
        "summary": "Delete members",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "orgId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "memberId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "204": {
            "description": "Deleted"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      },
      "patch": {
        "tags": [
          "Orgs"
        ],
        "summary": "Update members",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "orgId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "memberId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/admin/audit-logs": {
      "get": {
        "tags": [
          "Admin"
        ],
        "summary": "List audit logs",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/admin/orgs": {
      "get": {
        "tags": [
          "Admin"
        ],
        "summary": "List orgs",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/admin/plans": {
      "get": {
        "tags": [
          "Admin"
        ],
        "summary": "List plans",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      },
      "post": {
        "tags": [
          "Admin"
        ],
        "summary": "Create plans",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/admin/users": {
      "get": {
        "tags": [
          "Admin"
        ],
        "summary": "List users",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/agent/me": {
      "get": {
        "tags": [
          "Auth"
        ],
        "summary": "Get me",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/config": {
      "get": {
        "tags": [
          "Auth"
        ],
        "summary": "Get config",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/keys": {
      "get": {
        "tags": [
          "Auth"
        ],
        "summary": "List keys",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      },
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Create keys",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/me": {
      "get": {
        "tags": [
          "Auth"
        ],
        "summary": "Get me",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/user/me": {
      "get": {
        "tags": [
          "Auth"
        ],
        "summary": "Get me",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/bootstrap/service": {
      "get": {
        "tags": [
          "Bootstrap"
        ],
        "summary": "Get service",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/credentials": {
      "get": {
        "tags": [
          "Credentials"
        ],
        "summary": "List credentials",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      },
      "post": {
        "tags": [
          "Credentials"
        ],
        "summary": "Create credentials",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/entities": {
      "get": {
        "tags": [
          "Entities"
        ],
        "summary": "List entities",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      },
      "post": {
        "tags": [
          "Entities"
        ],
        "summary": "Create entities",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/entities/by-node/{nodeId}": {
      "get": {
        "tags": [
          "Entities"
        ],
        "summary": "Get by node",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "nodeId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/entities/{id}": {
      "get": {
        "tags": [
          "Entities"
        ],
        "summary": "Get entities",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      },
      "patch": {
        "tags": [
          "Entities"
        ],
        "summary": "Update entities",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/stats": {
      "get": {
        "tags": [
          "Stats"
        ],
        "summary": "List stats",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/admin/plans/{id}": {
      "patch": {
        "tags": [
          "Admin"
        ],
        "summary": "Update plans",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/auth/agent/login": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Login auth agent login",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/agent/refresh": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Refresh auth agent refresh",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/agent/register": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Register auth agent register",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/forgot-password": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Create forgot password",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/keys/{id}/revoke": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Revoke auth keys revoke",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/auth/keys/{id}/rotate": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Rotate auth keys rotate",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/auth/reset-password": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Create reset password",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/user/login": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Login auth user login",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/user/refresh": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Refresh auth user refresh",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/user/register": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Register auth user register",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/entities/resolve": {
      "post": {
        "tags": [
          "Entities"
        ],
        "summary": "Resolve entities resolve",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/entities/sync": {
      "post": {
        "tags": [
          "Entities"
        ],
        "summary": "Sync entities sync",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/entities/{id}/bind": {
      "post": {
        "tags": [
          "Entities"
        ],
        "summary": "Bind entities bind",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/entities/{id}/unbind": {
      "post": {
        "tags": [
          "Entities"
        ],
        "summary": "Unbind entities unbind",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/orgs/{id}/members/invite": {
      "post": {
        "tags": [
          "Orgs"
        ],
        "summary": "Invite orgs members invite",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/users/me/password": {
      "post": {
        "tags": [
          "Users"
        ],
        "summary": "Create password",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    }
  };
  const __paths = apiDocumentation.paths;
  for (const [key, ops] of Object.entries(__autoDocumentedPaths)) {
    __paths[key] = { ...__paths[key] || {}, ...ops };
  }
}
var docsRoot = path.resolve(process.cwd(), "docs");
function sendDocFile(res, filename, contentType) {
  const filePath = path.join(docsRoot, filename);
  if (fs.existsSync(filePath)) {
    res.type(contentType).sendFile(filePath);
  } else {
    res.status(404).json({ error: "Document not found. Run build to generate docs." });
  }
}
function registerDocRoutes(app) {
  app.get("/", (_req, res) => {
    res.redirect(302, "/docs/llms.txt");
  });
  app.get("/docs/openapi.json", (_req, res) => {
    const filePath = path.join(docsRoot, "openapi.json");
    if (fs.existsSync(filePath)) {
      res.type("application/json").sendFile(filePath);
    } else {
      res.type("application/json").json(apiDocumentation);
    }
  });
  app.get("/api/docs/openapi.json", (_req, res) => {
    res.redirect(302, "/docs/openapi.json");
  });
  app.get("/openapi.json", (_req, res) => {
    res.redirect(302, "/docs/openapi.json");
  });
  app.get("/.well-known/openapi.json", (_req, res) => {
    res.redirect(302, "/docs/openapi.json");
  });
  app.get("/api/docs", (_req, res) => {
    res.redirect(302, "/docs/openapi.json");
  });
  app.get("/docs/llms.txt", (_req, res) => {
    sendDocFile(res, "llms.txt", "text/plain");
  });
  app.get("/llms.txt", (_req, res) => {
    res.redirect(302, "/docs/llms.txt");
  });
  app.get("/llm.txt", (_req, res) => {
    res.redirect(302, "/docs/llms.txt");
  });
  app.get("/docs/llms-full.txt", (_req, res) => {
    sendDocFile(res, "llms-full.txt", "text/plain");
  });
  app.get("/llms-full.txt", (_req, res) => {
    res.redirect(302, "/docs/llms-full.txt");
  });
  app.get("/.well-known/jwks.json", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("application/json").json({
      keys: [],
      _note: "This service uses HS256 symmetric tokens. Use POST /api/auth/introspect for token validation.",
      introspect_endpoint: "/api/auth/introspect"
    });
  });
}
function getParam(params, key) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value ?? "";
}
var updateUserAdminSchema = external_exports.object({
  name: external_exports.string().min(1).optional(),
  email: external_exports.string().email().optional(),
  isSuperAdmin: external_exports.boolean().optional()
}).strict();
var updateOrgAdminSchema = external_exports.object({
  name: external_exports.string().min(1).optional(),
  slug: external_exports.string().regex(/^[a-z0-9-]+$/).optional(),
  planId: external_exports.string().nullable().optional()
}).strict();
var createPlanAdminSchema = external_exports.object({
  name: external_exports.string().min(1, "Plan name is required"),
  featuresJson: external_exports.array(external_exports.string()).optional(),
  limitsJson: external_exports.record(external_exports.string(), external_exports.number()).optional(),
  priceCents: external_exports.number().int().min(0).optional()
}).strict();
var updatePlanAdminSchema = external_exports.object({
  name: external_exports.string().min(1).optional(),
  featuresJson: external_exports.array(external_exports.string()).optional(),
  limitsJson: external_exports.record(external_exports.string(), external_exports.number()).optional(),
  priceCents: external_exports.number().int().min(0).optional()
}).strict();
function runRequestWithRLS(context, res, next) {
  try {
    runWithRLSContext(context, () => next());
  } catch (error) {
    console.error("[identity-service] Failed to establish RLS context:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Failed to establish request security context" });
    }
  }
}
if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}
var JWT_SECRET = process.env.SESSION_SECRET;
var JWT_EXPIRES_IN = "7d";
var SALT_ROUNDS = 10;
function signToken(user) {
  return import_jsonwebtoken.default.sign(
    { sub: user.id, type: "user", email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}
function signAgentToken(agent) {
  return import_jsonwebtoken.default.sign(
    { sub: agent.id, type: "agent", agentId: agent.agentId, name: agent.name, orgId: agent.orgId || void 0 },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}
function verifyToken(token) {
  try {
    const payload = import_jsonwebtoken.default.verify(token, JWT_SECRET);
    if (!payload.type) {
      payload.type = "user";
    }
    return payload;
  } catch {
    return null;
  }
}
var DEV_NO_AUTH = process.env.DEV_NO_AUTH === "true";
if (DEV_NO_AUTH) {
  console.warn(
    "\n  ############################################################\n  #  DEV_NO_AUTH=true \u2014 UNTOKENED REQUESTS ARE ACCEPTED       #\n  #  Every request without a token runs as the first user.    #\n  #  Development only. Never on a reachable stack.            #\n  ############################################################\n"
  );
}
async function authMiddleware(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    if (DEV_NO_AUTH) {
      const [firstUser] = await storage.getAllUsers();
      if (!firstUser) {
        return res.status(503).json({
          message: "DEV_NO_AUTH is enabled but there are no users to attach to",
          hint: "seed the database or register a user"
        });
      }
      req.user = {
        id: firstUser.id,
        email: firstUser.email,
        name: firstUser.name,
        isSuperAdmin: firstUser.isSuperAdmin
      };
      req.principal = { id: firstUser.id, type: "user", name: firstUser.name };
      return runRequestWithRLS(
        {
          orgId: "",
          userId: firstUser.id,
          isSuperAdmin: firstUser.isSuperAdmin,
          capabilities: [],
          serviceId: "identity"
        },
        res,
        next
      );
    }
    return res.status(401).json({ message: "Authentication required" });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
  if (payload.type === "agent") {
    const agent = await storage.getAgent(payload.sub);
    if (!agent) {
      return res.status(401).json({ message: "Agent not found" });
    }
    if (!agent.isActive) {
      return res.status(401).json({ message: "Agent is inactive" });
    }
    req.agent = {
      id: agent.id,
      agentId: agent.agentId,
      name: agent.name,
      orgId: agent.orgId || void 0,
      capabilities: agent.capabilities || []
    };
    req.principal = { id: agent.id, type: "agent", name: agent.name };
    storage.updateAgentLastSeen(agent.id).catch(() => {
    });
    return runRequestWithRLS(
      {
        orgId: agent.orgId || "",
        userId: agent.id,
        isSuperAdmin: false,
        capabilities: agent.capabilities || [],
        serviceId: "identity"
      },
      res,
      next
    );
  } else {
    const user = await storage.getUser(payload.sub);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    req.user = { id: user.id, email: user.email, name: user.name, isSuperAdmin: user.isSuperAdmin };
    req.principal = { id: user.id, type: "user", name: user.name };
    return runRequestWithRLS(
      {
        orgId: "",
        // Identity service operates cross-org; specific org context set per-query
        userId: user.id,
        isSuperAdmin: user.isSuperAdmin,
        capabilities: [],
        serviceId: "identity"
      },
      res,
      next
    );
  }
}
async function superAdminMiddleware(req, res, next) {
  if (!req.user?.isSuperAdmin) {
    return res.status(403).json({
      message: "Super admin access required",
      code: "SUPERADMIN_REQUIRED",
      hint: "This action requires super admin privileges. Contact your system administrator."
    });
  }
  next();
}
var rateLimitStore = /* @__PURE__ */ new Map();
var RATE_LIMIT_WINDOW_MS = 60 * 1e3;
var SUPERADMIN_RATE_LIMIT = 30;
var AUTH_RATE_LIMIT = 10;
function createRateLimitMiddleware(limit, windowMs = RATE_LIMIT_WINDOW_MS) {
  return (req, res, next) => {
    const key = `${req.ip || "unknown"}_${req.path}`;
    const now = Date.now();
    const entry = rateLimitStore.get(key);
    if (!entry || now > entry.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (entry.count >= limit) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1e3);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        message: "Too many requests. Please try again later.",
        code: "RATE_LIMIT_EXCEEDED",
        retryAfter
      });
    }
    entry.count++;
    next();
  };
}
var superAdminRateLimit = createRateLimitMiddleware(SUPERADMIN_RATE_LIMIT);
var authRateLimit = createRateLimitMiddleware(AUTH_RATE_LIMIT);
function isEmailEnabled() {
  if (process.env.EMAIL_ENABLED === "false") return false;
  if (process.env.EMAIL_ENABLED === "true") return true;
  const hasConnector = !!(process.env.REPLIT_CONNECTORS_HOSTNAME && (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL));
  return hasConnector;
}
async function registerRoutes(httpServer, app) {
  const cookieParser = await import("../chunks/cookie-parser-MRHS4DC7.mjs");
  app.use(cookieParser.default());
  registerDocRoutes(app);
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "identity" });
  });
  app.get("/health/ready", async (req, res) => {
    const healthCheck = {
      status: "ok",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      database: { connected: false },
      email: { enabled: isEmailEnabled() },
      version: "1.0.0"
    };
    try {
      const start = Date.now();
      await storage.getAllPlans();
      const latencyMs = Date.now() - start;
      healthCheck.database = { connected: true, latencyMs };
    } catch (error) {
      healthCheck.status = "error";
      healthCheck.database = {
        connected: false,
        error: error.message || "Database connection failed"
      };
    }
    const statusCode = healthCheck.status === "ok" ? 200 : 503;
    res.status(statusCode).json(healthCheck);
  });
  app.get("/api/bootstrap/service", (_req, res) => {
    res.json({
      service: "identity",
      version: "1.0.0",
      description: "Authentication, authorization, and identity management service",
      docsUrls: {
        openapi: "/docs/openapi.json",
        llms: "/docs/llms.txt",
        llmsFull: "/docs/llms-full.txt",
        openapiDirect: "/api/docs/openapi.json"
      },
      endpoints: {
        auth: "/api/auth",
        users: "/api/users",
        orgs: "/api/orgs",
        projects: "/api/projects",
        applications: "/api/applications",
        services: "/api/services",
        entitlements: "/api/entitlements",
        apiKeys: "/api/auth/keys",
        admin: "/api/admin"
      },
      authentication: [
        "Bearer token (JWT)",
        "Session cookie (token)"
      ],
      jwks: "/.well-known/jwks.json"
    });
  });
  app.get("/api/bootstrap/internal", (req, res) => {
    const forwarded = req.headers["x-forwarded-for"];
    const remoteIp = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.socket.remoteAddress;
    const isInternal = remoteIp && (remoteIp === "127.0.0.1" || remoteIp === "::1" || remoteIp.startsWith("172.") || remoteIp.startsWith("10.") || remoteIp.startsWith("192.168.") || remoteIp === "::ffff:127.0.0.1");
    if (!isInternal && process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Internal endpoint only" });
    }
    const config = getBootstrapConfig();
    if (!config) {
      return res.status(503).json({ error: "Bootstrap not initialized" });
    }
    res.json(config);
  });
  app.get("/api/stats", async (_req, res) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error getting stats:", error);
      res.status(500).json({ error: "Failed to get stats" });
    }
  });
  app.get("/api/auth/config", (_req, res) => {
    const baseUrl = process.env.IDENTITY_BASE_URL || "";
    res.json({
      identityServiceUrl: baseUrl,
      loginUrl: `${baseUrl}/login`,
      logoutUrl: `${baseUrl}/api/auth/logout`
    });
  });
  app.get("/api/auth/me", authMiddleware, async (req, res) => {
    if (req.agent) {
      const agent = await storage.getAgent(req.agent.id);
      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }
      return res.json({
        type: "agent",
        agent: {
          id: agent.id,
          agentId: agent.agentId,
          name: agent.name,
          orgId: agent.orgId,
          capabilities: agent.capabilities
        }
      });
    }
    const enrichedUser = await storage.getEnrichedUser(req.user.id);
    if (!enrichedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    const issuedToken = !req.headers.authorization && !req.cookies?.token && DEV_NO_AUTH ? signToken({ id: enrichedUser.id, email: enrichedUser.email, name: enrichedUser.name }) : void 0;
    res.json({
      type: "user",
      user: enrichedUser,
      organizations: enrichedUser.organizations || [],
      ...issuedToken ? { token: issuedToken, tokenIssuedBy: "DEV_NO_AUTH" } : {}
    });
  });
  app.get("/api/auth/user/me", authMiddleware, async (req, res) => {
    if (!req.user) {
      return res.status(403).json({ message: "This endpoint is for users only" });
    }
    const enrichedUser = await storage.getEnrichedUser(req.user.id);
    if (!enrichedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({
      user: enrichedUser,
      organizations: enrichedUser.organizations || []
    });
  });
  app.get("/", (_req, res) => {
    res.redirect(302, "/docs/llms.txt");
  });
  app.get("/api/docs", (req, res) => {
    res.json(apiDocumentation);
  });
  app.get("/api/docs/openapi.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json(apiDocumentation);
  });
  app.get("/docs/openapi.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json(apiDocumentation);
  });
  app.get("/llm.txt", (req, res) => {
    res.redirect("/llms.txt");
  });
  app.get("/llms.txt", (req, res) => {
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(`# Symbia Identity Service

> Authentication, authorization, and entitlements API for the Symbia ecosystem

## Overview

Symbia Identity Service provides:
- User authentication (register, login, password reset)
- Organization management with role-based access control
- Project, Application, and Service hierarchy
- Polymorphic scoped entitlements with quotas
- Audit logging

## Quick Start

1. **Authentication**: POST /api/auth/login with email/password, receive JWT token
2. **Create Organization**: POST /api/orgs with name
3. **Create Project**: POST /api/orgs/{orgId}/projects
4. **Check Entitlements**: GET /api/scoped-entitlements/{scopeType}/{scopeId}

## Authentication

All authenticated endpoints require either:
- Cookie: \`token\` (set automatically after login)
- Header: \`Authorization: Bearer <token>\`

## Scope Headers (optional)

- \`X-Org-Id\`
- \`X-Service-Id\`
- \`X-Env\`
- \`X-Data-Class\`
- \`X-Policy-Ref\`

## Key Endpoints

- POST /api/auth/register - Create new user
- POST /api/auth/login - Authenticate user
- GET /api/users/me - Get current user
- GET /api/orgs - List user's organizations
- POST /api/orgs - Create organization
- GET /api/orgs/{orgId}/projects - List projects
- GET /api/scoped-entitlements/{scopeType}/{scopeId} - Check entitlements
- GET /api/license/{orgId} - Get license status

## OpenAPI Spec

Full OpenAPI 3.0 specification: /docs/openapi.json

## More Info

See /llms-full.txt for complete API documentation.
`);
  });
  app.get("/docs/llms.txt", (req, res) => {
    res.redirect("/llms.txt");
  });
  app.get("/llms-full.txt", (req, res) => {
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Access-Control-Allow-Origin", "*");
    const doc = apiDocumentation;
    let content = `# ${doc.info.title} - Complete API Documentation

> ${doc.info.description}

## Base URL

${doc.servers?.[0]?.url || "/api"} - ${doc.servers?.[0]?.description || "API Base URL"}

## Authentication

All authenticated endpoints require either:
- Cookie: \`token\` (set automatically after login)
- Header: \`Authorization: Bearer <token>\`

## Scope Headers (optional)

- \`X-Org-Id\`
- \`X-Service-Id\`
- \`X-Env\`
- \`X-Data-Class\`
- \`X-Policy-Ref\`

## Endpoints

`;
    const endpointsByTag = {};
    for (const [path2, methods] of Object.entries(doc.paths || {})) {
      for (const [method, details] of Object.entries(methods)) {
        const d = details;
        const tag = d.tags?.[0] || "Other";
        if (!endpointsByTag[tag]) {
          endpointsByTag[tag] = [];
        }
        let endpoint = `### ${method.toUpperCase()} ${path2}

`;
        endpoint += `${d.summary || ""}

`;
        if (d.description) {
          endpoint += `${d.description}

`;
        }
        if (d.requestBody?.content?.["application/json"]?.schema) {
          const schema = d.requestBody.content["application/json"].schema;
          endpoint += `**Request Body:**
\`\`\`json
`;
          if (schema.properties) {
            const example = {};
            for (const [prop, propSchema] of Object.entries(schema.properties)) {
              const ps = propSchema;
              if (ps.type === "string") example[prop] = ps.example || "string";
              else if (ps.type === "integer" || ps.type === "number") example[prop] = ps.example || 0;
              else if (ps.type === "boolean") example[prop] = ps.example || false;
              else if (ps.type === "array") example[prop] = [];
              else example[prop] = ps.example || null;
            }
            endpoint += JSON.stringify(example, null, 2);
          }
          endpoint += `
\`\`\`

`;
        }
        if (d.responses) {
          endpoint += `**Responses:**
`;
          for (const [code, resp] of Object.entries(d.responses)) {
            const r = resp;
            endpoint += `- \`${code}\`: ${r.description || ""}
`;
          }
          endpoint += `
`;
        }
        endpointsByTag[tag].push(endpoint);
      }
    }
    for (const [tag, endpoints] of Object.entries(endpointsByTag)) {
      content += `## ${tag}

`;
      content += endpoints.join("\n---\n\n");
    }
    content += `
## Documentation

Full OpenAPI 3.0 specification available at:
- /docs/openapi.json
- /api/docs/openapi.json
- /openapi.json
- /.well-known/openapi.json

LLM summary available at:
- /docs/llms.txt

## Token Introspection

For service-to-service authentication, use POST /api/auth/introspect with { "token": "..." }
`;
    res.send(content);
  });
  app.get("/docs/llms-full.txt", (req, res) => {
    res.redirect("/llms-full.txt");
  });
  app.get("/openapi.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json(apiDocumentation);
  });
  app.get("/.well-known/openapi.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json(apiDocumentation);
  });
  app.get("/.well-known/jwks.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json({
      keys: [],
      _note: "This service uses HS256 symmetric tokens. Use POST /api/auth/introspect for token validation.",
      introspect_endpoint: "/api/auth/introspect"
    });
  });
  app.post("/api/auth/introspect", async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) {
        return res.json({ active: false });
      }
      const payload = verifyToken(token);
      if (!payload) {
        return res.json({ active: false });
      }
      if (payload.type === "agent") {
        const agent = await storage.getAgent(payload.sub);
        if (!agent || !agent.isActive) {
          return res.json({ active: false });
        }
        return res.json({
          active: true,
          type: "agent",
          sub: agent.id,
          agentId: agent.agentId,
          name: agent.name,
          orgId: agent.orgId,
          capabilities: agent.capabilities || [],
          token_type: "Bearer",
          iat: payload.iat,
          exp: payload.exp
        });
      }
      const enrichedUser = await storage.getEnrichedUser(payload.sub);
      if (!enrichedUser) {
        return res.json({ active: false });
      }
      res.json({
        active: true,
        type: "user",
        sub: enrichedUser.id,
        email: enrichedUser.email,
        name: enrichedUser.name,
        isSuperAdmin: enrichedUser.isSuperAdmin,
        organizations: enrichedUser.organizations,
        entitlements: enrichedUser.entitlements,
        roles: enrichedUser.roles,
        token_type: "Bearer",
        iat: payload.iat,
        exp: payload.exp
      });
    } catch (error) {
      console.error("Introspection error:", error);
      res.json({ active: false });
    }
  });
  async function handleUserRegister(req, res) {
    try {
      const data = registerSchema.parse(req.body);
      const existingUser = await storage.getUserByEmail(data.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already in use" });
      }
      const allUsers = await storage.getAllUsers();
      const isFirstUser = allUsers.length === 0;
      const passwordHash = await import_bcryptjs2.default.hash(data.password, SALT_ROUNDS);
      const user = await storage.createUser({
        email: data.email,
        passwordHash,
        name: data.name,
        isSuperAdmin: isFirstUser
      });
      if (isFirstUser) {
        await addUserToSystemOrg(user.id);
      }
      let org = null;
      if (data.orgName) {
        const slug = data.orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        org = await storage.createOrganization({
          name: data.orgName,
          slug: slug || "default"
        });
        await storage.createMembership({
          userId: user.id,
          orgId: org.id,
          role: "admin"
        });
        await storage.createAuditLog({
          userId: user.id,
          orgId: org.id,
          action: "org.created",
          resource: "organization",
          resourceId: org.id,
          metadataJson: { name: org.name, slug: org.slug }
        });
      }
      await storage.createAuditLog({
        userId: user.id,
        orgId: isFirstUser ? SYSTEM_ORG_ID : org?.id,
        action: isFirstUser ? "superadmin.created" : "user.registered",
        resource: "user",
        metadataJson: { email: user.email, orgName: data.orgName, isSuperAdmin: isFirstUser }
      });
      const token = signToken(user);
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1e3
        // 7 days
      });
      res.json({
        user: { id: user.id, email: user.email, name: user.name, isSuperAdmin: isFirstUser },
        organization: org ? { id: org.id, name: org.name, slug: org.slug } : null,
        token
      });
    } catch (error) {
      if (error instanceof external_exports.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  }
  app.post("/api/auth/user/register", handleUserRegister);
  app.post("/api/auth/register", handleUserRegister);
  async function handleUserLogin(req, res) {
    try {
      reportUnknownKeys("POST /api/auth/login", req.body, ["email", "password"]);
      const data = loginSchema.parse(req.body);
      const user = await storage.getUserByEmail(data.email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      const validPassword = await import_bcryptjs2.default.compare(data.password, user.passwordHash);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      await storage.createAuditLog({
        userId: user.id,
        action: "user.login",
        resource: "user",
        metadataJson: { email: user.email }
      });
      const token = signToken(user);
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1e3
      });
      const memberships2 = await storage.getMembershipsByUser(user.id);
      const organizations2 = [];
      for (const membership of memberships2) {
        const org = await storage.getOrganization(membership.orgId);
        if (org) {
          organizations2.push({
            id: org.id,
            name: org.name,
            slug: org.slug,
            role: membership.role
          });
        }
      }
      res.json({
        user: { id: user.id, email: user.email, name: user.name, organizations: organizations2 },
        token
      });
    } catch (error) {
      if (error instanceof external_exports.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  }
  app.post("/api/auth/user/login", handleUserLogin);
  app.post("/api/auth/login", handleUserLogin);
  const mcpSessions = /* @__PURE__ */ new Map();
  const pruneSessions = () => {
    const now = Math.floor(Date.now() / 1e3);
    for (const [h, s] of mcpSessions) if (now > s.session.expiresAt) mcpSessions.delete(h);
  };
  app.post("/api/auth/session", authMiddleware, async (req, res) => {
    try {
      const userId = req.user.id;
      const ttlSecs = Math.min(Math.max(Number(req.body?.ttlSecs) || 86400, 60), 7 * 86400);
      const scope = typeof req.body?.scope === "string" ? req.body.scope : "viewer";
      const masterKey = crypto2.randomBytes(32);
      const { session, token } = nodeCredentialCrypto.createSession(masterKey, ttlSecs);
      mcpSessions.set(session.tokenHash, { session, userId, scope });
      res.json({ token, sessionId: session.sessionId, expiresAt: session.expiresAt, scope });
    } catch (error) {
      console.error("Session mint error:", error);
      res.status(500).json({ message: "Failed to mint session" });
    }
  });
  app.post("/api/auth/session/resolve", async (req, res) => {
    try {
      pruneSessions();
      const presented = typeof req.body?.token === "string" ? req.body.token : "";
      if (!presented) return res.status(400).json({ message: "token required" });
      const hash = crypto2.createHash("sha256").update(presented).digest("hex");
      const entry = mcpSessions.get(hash);
      if (!entry) return res.status(401).json({ message: "invalid or expired session" });
      try {
        nodeCredentialCrypto.resolveSession(entry.session, presented);
      } catch {
        return res.status(401).json({ message: "invalid or expired session" });
      }
      const user = await storage.getUser(entry.userId);
      if (!user) return res.status(401).json({ message: "session principal no longer exists" });
      const jwt2 = signToken({ id: user.id, email: user.email, name: user.name });
      res.json({ token: jwt2, scope: entry.scope, expiresAt: entry.session.expiresAt });
    } catch (error) {
      console.error("Session resolve error:", error);
      res.status(500).json({ message: "Failed to resolve session" });
    }
  });
  app.delete("/api/auth/session/:sessionId", authMiddleware, async (req, res) => {
    const id = getParam(req.params, "sessionId");
    let revoked = false;
    for (const [h, s] of mcpSessions) if (s.session.sessionId === id) {
      mcpSessions.delete(h);
      revoked = true;
    }
    res.json({ revoked });
  });
  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("token");
    res.json({ message: "Logged out successfully" });
  });
  app.post("/api/auth/agent/register", async (req, res) => {
    try {
      const data = agentRegisterSchema.parse(req.body);
      const existingAgent = await storage.getAgentByAgentId(data.agentId);
      if (existingAgent) {
        return res.status(400).json({ message: "Agent ID already in use" });
      }
      if (data.orgId) {
        const org = await storage.getOrganization(data.orgId);
        if (!org) {
          return res.status(400).json({ message: "Organization not found" });
        }
      }
      const credentialHash = await import_bcryptjs2.default.hash(data.credential, SALT_ROUNDS);
      const agent = await storage.createAgent({
        agentId: data.agentId,
        credentialHash,
        name: data.name,
        orgId: data.orgId || null,
        capabilities: data.capabilities,
        metadata: data.metadata
      });
      await storage.createAuditLog({
        action: "agent.registered",
        resource: "agent",
        resourceId: agent.id,
        orgId: data.orgId,
        metadataJson: { agentId: agent.agentId }
      });
      const token = signAgentToken(agent);
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1e3
        // 7 days
      });
      res.json({
        agent: { id: agent.id, agentId: agent.agentId, name: agent.name, orgId: agent.orgId },
        token
      });
    } catch (error) {
      if (error instanceof external_exports.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Agent registration error:", error);
      res.status(500).json({ message: "Agent registration failed" });
    }
  });
  app.post("/api/auth/agent/login", async (req, res) => {
    try {
      const data = agentLoginSchema.parse(req.body);
      const agent = await storage.getAgentByAgentId(data.agentId);
      if (!agent) {
        return res.status(401).json({ message: "Invalid agent ID or credential" });
      }
      if (!agent.isActive) {
        return res.status(401).json({ message: "Agent is inactive" });
      }
      const validCredential = await import_bcryptjs2.default.compare(data.credential, agent.credentialHash);
      if (!validCredential) {
        return res.status(401).json({ message: "Invalid agent ID or credential" });
      }
      await storage.createAuditLog({
        action: "agent.login",
        resource: "agent",
        resourceId: agent.id,
        orgId: agent.orgId,
        metadataJson: { agentId: agent.agentId }
      });
      const token = signAgentToken(agent);
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1e3
      });
      res.json({
        agent: {
          id: agent.id,
          agentId: agent.agentId,
          name: agent.name,
          orgId: agent.orgId,
          capabilities: agent.capabilities
        },
        token
      });
    } catch (error) {
      if (error instanceof external_exports.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Agent login error:", error);
      res.status(500).json({ message: "Agent login failed" });
    }
  });
  app.get("/api/auth/agent/me", authMiddleware, async (req, res) => {
    if (!req.agent) {
      return res.status(403).json({ message: "This endpoint is for agents only" });
    }
    const agent = await storage.getAgent(req.agent.id);
    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }
    res.json({
      agent: {
        id: agent.id,
        agentId: agent.agentId,
        name: agent.name,
        orgId: agent.orgId,
        capabilities: agent.capabilities,
        metadata: agent.metadata,
        lastSeenAt: agent.lastSeenAt,
        createdAt: agent.createdAt
      }
    });
  });
  app.post("/api/auth/agent/refresh", authMiddleware, async (req, res) => {
    if (!req.agent) {
      return res.status(403).json({ message: "This endpoint is for agents only" });
    }
    try {
      const agent = await storage.getAgent(req.agent.id);
      if (!agent) {
        return res.status(401).json({ message: "Agent not found" });
      }
      if (!agent.isActive) {
        return res.status(401).json({ message: "Agent is inactive" });
      }
      const token = signAgentToken(agent);
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1e3
      });
      res.json({
        agent: { id: agent.id, agentId: agent.agentId, name: agent.name },
        token
      });
    } catch (error) {
      console.error("Agent token refresh error:", error);
      res.status(500).json({ message: "Failed to refresh token" });
    }
  });
  app.post("/api/auth/refresh", authMiddleware, async (req, res) => {
    try {
      const isProduction = process.env.NODE_ENV === "production";
      if (req.agent) {
        const agent = await storage.getAgent(req.agent.id);
        if (!agent || !agent.isActive) {
          return res.status(401).json({ message: "Agent not found or inactive" });
        }
        const token2 = signAgentToken(agent);
        res.cookie("token", token2, {
          httpOnly: true,
          secure: isProduction,
          sameSite: isProduction ? "none" : "lax",
          maxAge: 7 * 24 * 60 * 60 * 1e3
        });
        return res.json({
          type: "agent",
          agent: { id: agent.id, agentId: agent.agentId, name: agent.name },
          token: token2
        });
      }
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      const token = signToken(user);
      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1e3
      });
      res.json({
        type: "user",
        user: { id: user.id, email: user.email, name: user.name },
        token
      });
    } catch (error) {
      console.error("Token refresh error:", error);
      res.status(500).json({ message: "Failed to refresh token" });
    }
  });
  app.post("/api/auth/user/refresh", authMiddleware, async (req, res) => {
    if (!req.user) {
      return res.status(403).json({ message: "This endpoint is for users only" });
    }
    try {
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      const token = signToken(user);
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1e3
      });
      res.json({
        user: { id: user.id, email: user.email, name: user.name },
        token
      });
    } catch (error) {
      console.error("Token refresh error:", error);
      res.status(500).json({ message: "Failed to refresh token" });
    }
  });
  app.post("/api/auth/forgot-password", authRateLimit, async (req, res) => {
    try {
      const data = forgotPasswordSchema.parse(req.body);
      const emailEnabled = isEmailEnabled();
      if (!emailEnabled) {
        console.log("Password reset requested but email is not configured");
        return res.json({
          message: "Password reset is not available at this time. Please contact your administrator.",
          emailEnabled: false
        });
      }
      const user = await storage.getUserByEmail(data.email);
      if (user) {
        const resetToken = crypto2.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 60 * 60 * 1e3);
        await storage.createPasswordResetToken({
          userId: user.id,
          token: resetToken,
          expiresAt
        });
        const emailSent = await sendPasswordResetEmail(user.email, resetToken, user.name);
        await storage.createAuditLog({
          userId: user.id,
          action: "user.forgot_password",
          resource: "user",
          metadataJson: { email: user.email, emailSent, emailEnabled }
        });
      }
      res.json({ message: "If an account exists, a reset link has been sent" });
    } catch (error) {
      if (error instanceof external_exports.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Request failed" });
    }
  });
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return res.status(400).json({ message: "Token and password are required" });
      }
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }
      const resetToken = await storage.getPasswordResetToken(token);
      if (!resetToken) {
        return res.status(400).json({ message: "Invalid or expired reset link" });
      }
      if (resetToken.usedAt) {
        return res.status(400).json({ message: "This reset link has already been used" });
      }
      if (/* @__PURE__ */ new Date() > resetToken.expiresAt) {
        return res.status(400).json({ message: "This reset link has expired" });
      }
      const passwordHash = await import_bcryptjs2.default.hash(password, SALT_ROUNDS);
      await storage.updateUser(resetToken.userId, { passwordHash });
      await storage.markPasswordResetTokenUsed(token);
      await storage.deleteSessionsByUser(resetToken.userId);
      await storage.createAuditLog({
        userId: resetToken.userId,
        action: "user.password_reset",
        resource: "user",
        metadataJson: {}
      });
      res.json({ message: "Password has been reset successfully" });
    } catch (error) {
      console.error("Password reset error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });
  app.get("/api/users/me", authMiddleware, async (req, res) => {
    const enrichedUser = await storage.getEnrichedUser(req.user.id);
    if (!enrichedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(enrichedUser);
  });
  app.patch("/api/users/me", authMiddleware, async (req, res) => {
    try {
      const { name, email } = req.body;
      const updates = {};
      if (name) updates.name = name;
      if (email) {
        const existing = await storage.getUserByEmail(email);
        if (existing && existing.id !== req.user.id) {
          return res.status(400).json({ message: "Email already in use" });
        }
        updates.email = email;
      }
      const user = await storage.updateUser(req.user.id, updates);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ id: user.id, email: user.email, name: user.name });
    } catch (error) {
      console.error("Update user error:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });
  app.post("/api/users/me/password", authMiddleware, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const validPassword = await import_bcryptjs2.default.compare(currentPassword, user.passwordHash);
      if (!validPassword) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }
      const passwordHash = await import_bcryptjs2.default.hash(newPassword, SALT_ROUNDS);
      await storage.updateUser(user.id, { passwordHash });
      await storage.createAuditLog({
        userId: user.id,
        action: "user.password_changed",
        resource: "user"
      });
      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Password change error:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });
  app.get("/api/dashboard", authMiddleware, async (req, res) => {
    try {
      const memberships2 = await storage.getMembershipsByUser(req.user.id);
      const organizations2 = await Promise.all(
        memberships2.map(async (m) => {
          const org = await storage.getOrganization(m.orgId);
          if (!org) return null;
          const members = await storage.getMembershipsByOrg(m.orgId);
          const plan = org.planId ? await storage.getPlan(org.planId) : null;
          return {
            ...org,
            memberCount: members.length,
            role: m.role,
            planName: plan?.name
          };
        })
      );
      res.json({
        organizations: organizations2.filter(Boolean),
        recentActivity: []
      });
    } catch (error) {
      console.error("Dashboard error:", error);
      res.status(500).json({ message: "Failed to load dashboard" });
    }
  });
  app.get("/api/orgs", authMiddleware, async (req, res) => {
    try {
      const memberships2 = await storage.getMembershipsByUser(req.user.id);
      const organizations2 = await Promise.all(
        memberships2.map(async (m) => {
          const org = await storage.getOrganization(m.orgId);
          if (!org) return null;
          const members = await storage.getMembershipsByOrg(m.orgId);
          const plan = org.planId ? await storage.getPlan(org.planId) : null;
          return {
            ...org,
            memberCount: members.length,
            role: m.role,
            planName: plan?.name
          };
        })
      );
      res.json({ organizations: organizations2.filter(Boolean) });
    } catch (error) {
      console.error("Get orgs error:", error);
      res.status(500).json({ message: "Failed to load organizations" });
    }
  });
  app.post("/api/orgs", authMiddleware, async (req, res) => {
    try {
      const data = createOrgSchema.parse(req.body);
      const existingOrg = await storage.getOrganizationBySlug(data.slug);
      if (existingOrg) {
        return res.status(400).json({ message: "Organization slug already in use" });
      }
      let freePlan = await storage.getPlanByName("free");
      if (!freePlan) {
        freePlan = await storage.createPlan({
          name: "free",
          featuresJson: ["basic_access"],
          limitsJson: { members: 5, api_calls: 1e3 },
          priceCents: 0
        });
      }
      const org = await storage.createOrganization({
        name: data.name,
        slug: data.slug,
        planId: freePlan.id
      });
      await storage.createMembership({
        userId: req.user.id,
        orgId: org.id,
        role: "admin"
      });
      await storage.createAuditLog({
        userId: req.user.id,
        orgId: org.id,
        action: "org.created",
        resource: "organization",
        metadataJson: { name: org.name, slug: org.slug }
      });
      res.json(org);
    } catch (error) {
      if (error instanceof external_exports.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create org error:", error);
      res.status(500).json({ message: "Failed to create organization" });
    }
  });
  app.get("/api/orgs/:id", authMiddleware, async (req, res) => {
    try {
      const org = await storage.getOrganization(getParam(req.params, "id"));
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, org.id);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }
      const members = await storage.getMembershipsByOrg(org.id);
      const entitlements2 = await storage.getEntitlementsByOrg(org.id);
      const plan = org.planId ? await storage.getPlan(org.planId) : null;
      res.json({
        organization: { ...org, plan },
        members,
        entitlements: entitlements2
      });
    } catch (error) {
      console.error("Get org error:", error);
      res.status(500).json({ message: "Failed to load organization" });
    }
  });
  app.post("/api/orgs/:id/members/invite", authMiddleware, async (req, res) => {
    try {
      const data = inviteMemberSchema.parse(req.body);
      const orgId = getParam(req.params, "id");
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, orgId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only admins can invite members" });
      }
      const invitedUser = await storage.getUserByEmail(data.email);
      if (!invitedUser) {
        return res.status(400).json({ message: "User not found. They need to register first." });
      }
      const existingMembership = await storage.getMembershipByUserAndOrg(invitedUser.id, orgId);
      if (existingMembership) {
        return res.status(400).json({ message: "User is already a member" });
      }
      const newMembership = await storage.createMembership({
        userId: invitedUser.id,
        orgId,
        role: data.role
      });
      await storage.createAuditLog({
        userId: req.user.id,
        orgId,
        action: "member.invited",
        resource: "membership",
        metadataJson: { invitedEmail: data.email, role: data.role }
      });
      res.json(newMembership);
    } catch (error) {
      if (error instanceof external_exports.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Invite member error:", error);
      res.status(500).json({ message: "Failed to invite member" });
    }
  });
  app.patch("/api/orgs/:orgId/members/:memberId", authMiddleware, async (req, res) => {
    try {
      const orgId = getParam(req.params, "orgId");
      const memberId = getParam(req.params, "memberId");
      const { role } = req.body;
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, orgId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only admins can update roles" });
      }
      const targetMembership = await storage.getMembership(memberId);
      if (!targetMembership || targetMembership.orgId !== orgId) {
        return res.status(404).json({ message: "Member not found" });
      }
      const updated = await storage.updateMembership(memberId, { role });
      await storage.createAuditLog({
        userId: req.user.id,
        orgId,
        action: "member.role_updated",
        resource: "membership",
        metadataJson: { memberId, newRole: role }
      });
      res.json(updated);
    } catch (error) {
      console.error("Update member error:", error);
      res.status(500).json({ message: "Failed to update member" });
    }
  });
  app.delete("/api/orgs/:orgId/members/:memberId", authMiddleware, async (req, res) => {
    try {
      const orgId = getParam(req.params, "orgId");
      const memberId = getParam(req.params, "memberId");
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, orgId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only admins can remove members" });
      }
      const targetMembership = await storage.getMembership(memberId);
      if (!targetMembership || targetMembership.orgId !== orgId) {
        return res.status(404).json({ message: "Member not found" });
      }
      await storage.deleteMembership(memberId);
      await storage.createAuditLog({
        userId: req.user.id,
        orgId,
        action: "member.removed",
        resource: "membership",
        metadataJson: { memberId }
      });
      res.json({ message: "Member removed" });
    } catch (error) {
      console.error("Remove member error:", error);
      res.status(500).json({ message: "Failed to remove member" });
    }
  });
  app.get("/api/entitlements/:orgId", authMiddleware, async (req, res) => {
    try {
      const orgId = getParam(req.params, "orgId");
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }
      const entitlements2 = await storage.getEntitlementsByOrg(orgId);
      res.json({ entitlements: entitlements2 });
    } catch (error) {
      console.error("Get entitlements error:", error);
      res.status(500).json({ message: "Failed to load entitlements" });
    }
  });
  app.get("/api/license/:orgId", authMiddleware, async (req, res) => {
    try {
      const orgId = getParam(req.params, "orgId");
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }
      const org = await storage.getOrganization(orgId);
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }
      const plan = org.planId ? await storage.getPlan(org.planId) : null;
      res.json({
        organization: org.name,
        plan: plan?.name || "free",
        features: plan?.featuresJson || [],
        limits: plan?.limitsJson || {},
        status: "active"
      });
    } catch (error) {
      console.error("Get license error:", error);
      res.status(500).json({ message: "Failed to load license" });
    }
  });
  app.get("/api/admin/plans", authMiddleware, async (req, res) => {
    try {
      const plans2 = await storage.getAllPlans();
      res.json(plans2);
    } catch (error) {
      console.error("Get plans error:", error);
      res.status(500).json({ message: "Failed to load plans" });
    }
  });
  app.get("/api/orgs/:orgId/projects", authMiddleware, async (req, res) => {
    try {
      const orgId = getParam(req.params, "orgId");
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }
      const projects2 = await storage.getProjectsByOrg(orgId);
      res.json({ projects: projects2 });
    } catch (error) {
      console.error("Get projects error:", error);
      res.status(500).json({ message: "Failed to load projects" });
    }
  });
  app.post("/api/orgs/:orgId/projects", authMiddleware, async (req, res) => {
    try {
      const orgId = getParam(req.params, "orgId");
      const data = createProjectSchema.parse(req.body);
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, orgId);
      if (!membership || membership.role === "viewer") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      const project = await storage.createProject({
        orgId,
        name: data.name,
        slug: data.slug,
        description: data.description || null,
        status: "active"
      });
      await storage.createAuditLog({
        userId: req.user.id,
        orgId,
        action: "project.created",
        resource: "project",
        resourceId: project.id,
        metadataJson: { name: project.name, slug: project.slug }
      });
      res.json(project);
    } catch (error) {
      if (error instanceof external_exports.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create project error:", error);
      res.status(500).json({ message: "Failed to create project" });
    }
  });
  app.get("/api/projects/:projectId", authMiddleware, async (req, res) => {
    try {
      const project = await storage.getProject(getParam(req.params, "projectId"));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, project.orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }
      const applications2 = await storage.getApplicationsByProject(project.id);
      const services2 = await storage.getServicesByProject(project.id);
      const entitlements2 = await storage.getScopedEntitlementsByScope("project", project.id);
      res.json({ project, applications: applications2, services: services2, entitlements: entitlements2 });
    } catch (error) {
      console.error("Get project error:", error);
      res.status(500).json({ message: "Failed to load project" });
    }
  });
  app.patch("/api/projects/:projectId", authMiddleware, async (req, res) => {
    try {
      const project = await storage.getProject(getParam(req.params, "projectId"));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, project.orgId);
      if (!membership || membership.role === "viewer") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      const { name, description, status } = req.body;
      const updated = await storage.updateProject(project.id, { name, description, status });
      await storage.createAuditLog({
        userId: req.user.id,
        orgId: project.orgId,
        action: "project.updated",
        resource: "project",
        resourceId: project.id
      });
      res.json(updated);
    } catch (error) {
      console.error("Update project error:", error);
      res.status(500).json({ message: "Failed to update project" });
    }
  });
  app.delete("/api/projects/:projectId", authMiddleware, async (req, res) => {
    try {
      const project = await storage.getProject(getParam(req.params, "projectId"));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, project.orgId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only admins can delete projects" });
      }
      await storage.deleteProject(project.id);
      await storage.createAuditLog({
        userId: req.user.id,
        orgId: project.orgId,
        action: "project.deleted",
        resource: "project",
        resourceId: project.id
      });
      res.json({ message: "Project deleted" });
    } catch (error) {
      console.error("Delete project error:", error);
      res.status(500).json({ message: "Failed to delete project" });
    }
  });
  app.get("/api/projects/:projectId/applications", authMiddleware, async (req, res) => {
    try {
      const project = await storage.getProject(getParam(req.params, "projectId"));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, project.orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }
      const applications2 = await storage.getApplicationsByProject(project.id);
      res.json({ applications: applications2 });
    } catch (error) {
      console.error("Get applications error:", error);
      res.status(500).json({ message: "Failed to load applications" });
    }
  });
  app.post("/api/projects/:projectId/applications", authMiddleware, async (req, res) => {
    try {
      const project = await storage.getProject(getParam(req.params, "projectId"));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, project.orgId);
      if (!membership || membership.role === "viewer") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      const data = createApplicationSchema.parse(req.body);
      const application = await storage.createApplication({
        projectId: project.id,
        orgId: project.orgId,
        name: data.name,
        slug: data.slug,
        environment: data.environment,
        appType: data.appType,
        repoUrl: data.repoUrl || null
      });
      await storage.createAuditLog({
        userId: req.user.id,
        orgId: project.orgId,
        action: "application.created",
        resource: "application",
        resourceId: application.id,
        metadataJson: { name: application.name, projectId: project.id }
      });
      res.json(application);
    } catch (error) {
      if (error instanceof external_exports.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create application error:", error);
      res.status(500).json({ message: "Failed to create application" });
    }
  });
  app.get("/api/applications/:appId", authMiddleware, async (req, res) => {
    try {
      const app2 = await storage.getApplication(getParam(req.params, "appId"));
      if (!app2) {
        return res.status(404).json({ message: "Application not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, app2.orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }
      const services2 = await storage.getServicesByApplication(app2.id);
      const entitlements2 = await storage.getScopedEntitlementsByScope("application", app2.id);
      res.json({ application: app2, services: services2, entitlements: entitlements2 });
    } catch (error) {
      console.error("Get application error:", error);
      res.status(500).json({ message: "Failed to load application" });
    }
  });
  app.patch("/api/applications/:appId", authMiddleware, async (req, res) => {
    try {
      const app2 = await storage.getApplication(getParam(req.params, "appId"));
      if (!app2) {
        return res.status(404).json({ message: "Application not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, app2.orgId);
      if (!membership || membership.role === "viewer") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      const { name, environment, appType, repoUrl } = req.body;
      const updated = await storage.updateApplication(app2.id, { name, environment, appType, repoUrl });
      res.json(updated);
    } catch (error) {
      console.error("Update application error:", error);
      res.status(500).json({ message: "Failed to update application" });
    }
  });
  app.delete("/api/applications/:appId", authMiddleware, async (req, res) => {
    try {
      const app2 = await storage.getApplication(getParam(req.params, "appId"));
      if (!app2) {
        return res.status(404).json({ message: "Application not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, app2.orgId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only admins can delete applications" });
      }
      await storage.deleteApplication(app2.id);
      res.json({ message: "Application deleted" });
    } catch (error) {
      console.error("Delete application error:", error);
      res.status(500).json({ message: "Failed to delete application" });
    }
  });
  app.get("/api/projects/:projectId/services", authMiddleware, async (req, res) => {
    try {
      const project = await storage.getProject(getParam(req.params, "projectId"));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, project.orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }
      const services2 = await storage.getServicesByProject(project.id);
      res.json({ services: services2 });
    } catch (error) {
      console.error("Get services error:", error);
      res.status(500).json({ message: "Failed to load services" });
    }
  });
  app.post("/api/projects/:projectId/services", authMiddleware, async (req, res) => {
    try {
      const project = await storage.getProject(getParam(req.params, "projectId"));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, project.orgId);
      if (!membership || membership.role === "viewer") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      const data = createServiceSchema.parse(req.body);
      const service = await storage.createService({
        projectId: project.id,
        orgId: project.orgId,
        name: data.name,
        serviceType: data.serviceType,
        provider: data.provider || null,
        endpointUrl: data.endpointUrl || null,
        externalId: data.externalId || null,
        status: "active"
      });
      await storage.createAuditLog({
        userId: req.user.id,
        orgId: project.orgId,
        action: "service.created",
        resource: "service",
        resourceId: service.id,
        metadataJson: { name: service.name, type: service.serviceType, projectId: project.id }
      });
      res.json(service);
    } catch (error) {
      if (error instanceof external_exports.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create service error:", error);
      res.status(500).json({ message: "Failed to create service" });
    }
  });
  app.get("/api/services/:serviceId", authMiddleware, async (req, res) => {
    try {
      const service = await storage.getService(getParam(req.params, "serviceId"));
      if (!service) {
        return res.status(404).json({ message: "Service not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, service.orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }
      const entitlements2 = await storage.getScopedEntitlementsByScope("service", service.id);
      res.json({ service, entitlements: entitlements2 });
    } catch (error) {
      console.error("Get service error:", error);
      res.status(500).json({ message: "Failed to load service" });
    }
  });
  app.patch("/api/services/:serviceId", authMiddleware, async (req, res) => {
    try {
      const service = await storage.getService(getParam(req.params, "serviceId"));
      if (!service) {
        return res.status(404).json({ message: "Service not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, service.orgId);
      if (!membership || membership.role === "viewer") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      const { name, serviceType, provider, endpointUrl, externalId, status } = req.body;
      const updated = await storage.updateService(service.id, { name, serviceType, provider, endpointUrl, externalId, status });
      res.json(updated);
    } catch (error) {
      console.error("Update service error:", error);
      res.status(500).json({ message: "Failed to update service" });
    }
  });
  app.delete("/api/services/:serviceId", authMiddleware, async (req, res) => {
    try {
      const service = await storage.getService(getParam(req.params, "serviceId"));
      if (!service) {
        return res.status(404).json({ message: "Service not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, service.orgId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only admins can delete services" });
      }
      await storage.deleteService(service.id);
      res.json({ message: "Service deleted" });
    } catch (error) {
      console.error("Delete service error:", error);
      res.status(500).json({ message: "Failed to delete service" });
    }
  });
  app.post("/api/applications/:appId/services/:serviceId", authMiddleware, async (req, res) => {
    try {
      const app2 = await storage.getApplication(getParam(req.params, "appId"));
      const service = await storage.getService(getParam(req.params, "serviceId"));
      if (!app2 || !service) {
        return res.status(404).json({ message: "Application or service not found" });
      }
      if (app2.orgId !== service.orgId) {
        return res.status(400).json({ message: "Application and service must belong to the same organization" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, app2.orgId);
      if (!membership || membership.role === "viewer") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      const link = await storage.linkApplicationService(app2.id, service.id);
      await storage.createAuditLog({
        userId: req.user.id,
        orgId: app2.orgId,
        action: "application.service_linked",
        resource: "application_service",
        metadataJson: { applicationId: app2.id, serviceId: service.id }
      });
      res.json(link);
    } catch (error) {
      console.error("Link service error:", error);
      res.status(500).json({ message: "Failed to link service" });
    }
  });
  app.delete("/api/applications/:appId/services/:serviceId", authMiddleware, async (req, res) => {
    try {
      const app2 = await storage.getApplication(getParam(req.params, "appId"));
      if (!app2) {
        return res.status(404).json({ message: "Application not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, app2.orgId);
      if (!membership || membership.role === "viewer") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      await storage.unlinkApplicationService(getParam(req.params, "appId"), getParam(req.params, "serviceId"));
      res.json({ message: "Service unlinked" });
    } catch (error) {
      console.error("Unlink service error:", error);
      res.status(500).json({ message: "Failed to unlink service" });
    }
  });
  app.get("/api/scoped-entitlements/:scopeType/:scopeId", authMiddleware, async (req, res) => {
    try {
      const scopeType = getParam(req.params, "scopeType");
      const scopeId = getParam(req.params, "scopeId");
      const validScopeType = scopeTypeEnum.parse(scopeType);
      let orgId = null;
      switch (validScopeType) {
        case "org":
          orgId = scopeId;
          break;
        case "project": {
          const project = await storage.getProject(scopeId);
          if (!project) return res.status(404).json({ message: "Project not found" });
          orgId = project.orgId;
          break;
        }
        case "application": {
          const app2 = await storage.getApplication(scopeId);
          if (!app2) return res.status(404).json({ message: "Application not found" });
          orgId = app2.orgId;
          break;
        }
        case "service": {
          const service = await storage.getService(scopeId);
          if (!service) return res.status(404).json({ message: "Service not found" });
          orgId = service.orgId;
          break;
        }
      }
      if (!orgId) {
        return res.status(400).json({ message: "Invalid scope" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, orgId);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }
      const entitlements2 = await storage.getScopedEntitlementsByScope(validScopeType, scopeId);
      res.json({ entitlements: entitlements2 });
    } catch (error) {
      if (error instanceof external_exports.ZodError) {
        return res.status(400).json({ message: "Invalid scope type" });
      }
      console.error("Get scoped entitlements error:", error);
      res.status(500).json({ message: "Failed to load entitlements" });
    }
  });
  app.post("/api/scoped-entitlements", authMiddleware, async (req, res) => {
    try {
      const data = createScopedEntitlementSchema.parse(req.body);
      let orgId = null;
      switch (data.scopeType) {
        case "org":
          orgId = data.scopeId;
          break;
        case "project": {
          const project = await storage.getProject(data.scopeId);
          if (!project) return res.status(404).json({ message: "Project not found" });
          orgId = project.orgId;
          break;
        }
        case "application": {
          const app2 = await storage.getApplication(data.scopeId);
          if (!app2) return res.status(404).json({ message: "Application not found" });
          orgId = app2.orgId;
          break;
        }
        case "service": {
          const service = await storage.getService(data.scopeId);
          if (!service) return res.status(404).json({ message: "Service not found" });
          orgId = service.orgId;
          break;
        }
      }
      if (!orgId) {
        return res.status(400).json({ message: "Invalid scope" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, orgId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only admins can manage entitlements" });
      }
      const entitlement = await storage.createScopedEntitlement({
        orgId,
        scopeType: data.scopeType,
        scopeId: data.scopeId,
        featureKey: data.featureKey,
        quota: data.quota ?? 0,
        enabled: data.enabled,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null
      });
      await storage.createAuditLog({
        userId: req.user.id,
        orgId,
        action: "entitlement.created",
        resource: "scoped_entitlement",
        resourceId: entitlement.id,
        metadataJson: { scopeType: data.scopeType, scopeId: data.scopeId, featureKey: data.featureKey }
      });
      res.json(entitlement);
    } catch (error) {
      if (error instanceof external_exports.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create scoped entitlement error:", error);
      res.status(500).json({ message: "Failed to create entitlement" });
    }
  });
  app.patch("/api/scoped-entitlements/:id", authMiddleware, async (req, res) => {
    try {
      const entitlement = await storage.getScopedEntitlement(getParam(req.params, "id"));
      if (!entitlement) {
        return res.status(404).json({ message: "Entitlement not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, entitlement.orgId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only admins can manage entitlements" });
      }
      const { quota, consumed, enabled, expiresAt } = req.body;
      const updated = await storage.updateScopedEntitlement(entitlement.id, {
        quota,
        consumed,
        enabled,
        expiresAt: expiresAt ? new Date(expiresAt) : null
      });
      res.json(updated);
    } catch (error) {
      console.error("Update scoped entitlement error:", error);
      res.status(500).json({ message: "Failed to update entitlement" });
    }
  });
  app.delete("/api/scoped-entitlements/:id", authMiddleware, async (req, res) => {
    try {
      const entitlement = await storage.getScopedEntitlement(getParam(req.params, "id"));
      if (!entitlement) {
        return res.status(404).json({ message: "Entitlement not found" });
      }
      const membership = await storage.getMembershipByUserAndOrg(req.user.id, entitlement.orgId);
      if (!membership || membership.role !== "admin") {
        return res.status(403).json({ message: "Only admins can manage entitlements" });
      }
      await storage.deleteScopedEntitlement(entitlement.id);
      res.json({ message: "Entitlement deleted" });
    } catch (error) {
      console.error("Delete scoped entitlement error:", error);
      res.status(500).json({ message: "Failed to delete entitlement" });
    }
  });
  function generateApiKeyPrefix() {
    return crypto2.randomBytes(4).toString("hex");
  }
  function generateApiKey() {
    const prefix = generateApiKeyPrefix();
    const suffix = crypto2.randomBytes(28).toString("hex");
    return { key: `sk_${prefix}${suffix}`, prefix: `sk_${prefix}` };
  }
  async function hashApiKey(key) {
    return crypto2.createHash("sha256").update(key).digest("hex");
  }
  app.post("/api/api-keys", authMiddleware, async (req, res) => {
    try {
      reportUnknownKeys("POST /api/api-keys", req.body, ["name", "scopes", "expiresAt"]);
      const data = createApiKeySchema.parse(req.body);
      if (data.orgId) {
        const membership = await storage.getMembershipByUserAndOrg(req.user.id, data.orgId);
        if (!membership || membership.role !== "admin") {
          return res.status(403).json({
            message: "Only organization admins can create API keys scoped to an organization"
          });
        }
      }
      const { key, prefix } = generateApiKey();
      const keyHash = await hashApiKey(key);
      const apiKey = await storage.createApiKey({
        name: data.name,
        keyHash,
        keyPrefix: prefix,
        orgId: data.orgId || null,
        createdBy: req.user.id,
        scopes: data.scopes || [],
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null
      });
      await storage.createAuditLog({
        userId: req.user.id,
        orgId: data.orgId || null,
        action: "api_key.created",
        resource: "api_key",
        resourceId: apiKey.id,
        metadataJson: { name: data.name, keyPrefix: prefix, scopes: data.scopes }
      });
      res.json({
        id: apiKey.id,
        name: apiKey.name,
        key,
        // Only returned on creation
        keyPrefix: apiKey.keyPrefix,
        orgId: apiKey.orgId,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
        _warning: "Store this key securely. It will not be shown again."
      });
    } catch (error) {
      if (error instanceof external_exports.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create API key error:", error);
      res.status(500).json({ message: "Failed to create API key" });
    }
  });
  app.get("/api/api-keys", authMiddleware, async (req, res) => {
    try {
      const apiKeys2 = await storage.getApiKeysByUser(req.user.id);
      res.json(apiKeys2.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        orgId: k.orgId,
        scopes: k.scopes,
        expiresAt: k.expiresAt,
        lastUsedAt: k.lastUsedAt,
        revokedAt: k.revokedAt,
        createdAt: k.createdAt
      })));
    } catch (error) {
      console.error("List API keys error:", error);
      res.status(500).json({ message: "Failed to list API keys" });
    }
  });
  app.get("/api/api-keys/:id", authMiddleware, async (req, res) => {
    try {
      const apiKey = await storage.getApiKey(getParam(req.params, "id"));
      if (!apiKey) {
        return res.status(404).json({ message: "API key not found" });
      }
      if (apiKey.createdBy !== req.user.id && !req.user.isSuperAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json({
        id: apiKey.id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        orgId: apiKey.orgId,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt,
        lastUsedAt: apiKey.lastUsedAt,
        revokedAt: apiKey.revokedAt,
        createdAt: apiKey.createdAt
      });
    } catch (error) {
      console.error("Get API key error:", error);
      res.status(500).json({ message: "Failed to get API key" });
    }
  });
  app.post("/api/api-keys/:id/revoke", authMiddleware, async (req, res) => {
    try {
      const apiKey = await storage.getApiKey(getParam(req.params, "id"));
      if (!apiKey) {
        return res.status(404).json({ message: "API key not found" });
      }
      if (apiKey.createdBy !== req.user.id && !req.user.isSuperAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (apiKey.revokedAt) {
        return res.status(400).json({ message: "API key is already revoked" });
      }
      await storage.revokeApiKey(apiKey.id);
      await storage.createAuditLog({
        userId: req.user.id,
        orgId: apiKey.orgId,
        action: "api_key.revoked",
        resource: "api_key",
        resourceId: apiKey.id,
        metadataJson: { name: apiKey.name, keyPrefix: apiKey.keyPrefix }
      });
      res.json({ message: "API key revoked successfully" });
    } catch (error) {
      console.error("Revoke API key error:", error);
      res.status(500).json({ message: "Failed to revoke API key" });
    }
  });
  app.post("/api/api-keys/:id/rotate", authMiddleware, async (req, res) => {
    try {
      const oldApiKey = await storage.getApiKey(getParam(req.params, "id"));
      if (!oldApiKey) {
        return res.status(404).json({ message: "API key not found" });
      }
      if (oldApiKey.createdBy !== req.user.id && !req.user.isSuperAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (oldApiKey.revokedAt) {
        return res.status(400).json({ message: "Cannot rotate a revoked API key" });
      }
      await storage.revokeApiKey(oldApiKey.id);
      const { key, prefix } = generateApiKey();
      const keyHash = await hashApiKey(key);
      const newApiKey = await storage.createApiKey({
        name: oldApiKey.name,
        keyHash,
        keyPrefix: prefix,
        orgId: oldApiKey.orgId,
        createdBy: req.user.id,
        scopes: oldApiKey.scopes || [],
        expiresAt: oldApiKey.expiresAt
      });
      await storage.createAuditLog({
        userId: req.user.id,
        orgId: oldApiKey.orgId,
        action: "api_key.rotated",
        resource: "api_key",
        resourceId: newApiKey.id,
        metadataJson: {
          oldKeyId: oldApiKey.id,
          newKeyPrefix: prefix,
          name: oldApiKey.name
        }
      });
      res.json({
        id: newApiKey.id,
        name: newApiKey.name,
        key,
        // Only returned on creation
        keyPrefix: newApiKey.keyPrefix,
        orgId: newApiKey.orgId,
        scopes: newApiKey.scopes,
        expiresAt: newApiKey.expiresAt,
        createdAt: newApiKey.createdAt,
        _warning: "Store this key securely. It will not be shown again.",
        rotatedFrom: oldApiKey.id
      });
    } catch (error) {
      console.error("Rotate API key error:", error);
      res.status(500).json({ message: "Failed to rotate API key" });
    }
  });
  app.delete("/api/api-keys/:id", authMiddleware, async (req, res) => {
    try {
      const apiKey = await storage.getApiKey(getParam(req.params, "id"));
      if (!apiKey) {
        return res.status(404).json({ message: "API key not found" });
      }
      if (apiKey.createdBy !== req.user.id && !req.user.isSuperAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }
      await storage.deleteApiKey(apiKey.id);
      await storage.createAuditLog({
        userId: req.user.id,
        orgId: apiKey.orgId,
        action: "api_key.deleted",
        resource: "api_key",
        resourceId: apiKey.id,
        metadataJson: { name: apiKey.name, keyPrefix: apiKey.keyPrefix }
      });
      res.json({ message: "API key deleted successfully" });
    } catch (error) {
      console.error("Delete API key error:", error);
      res.status(500).json({ message: "Failed to delete API key" });
    }
  });
  app.get("/api/auth/keys", (req, res, next) => {
    req.url = "/api/api-keys";
    app._router.handle(req, res, next);
  });
  app.post("/api/auth/keys", (req, res, next) => {
    req.url = "/api/api-keys";
    app._router.handle(req, res, next);
  });
  app.get("/api/auth/keys/:id", (req, res, next) => {
    req.url = `/api/api-keys/${getParam(req.params, "id")}`;
    app._router.handle(req, res, next);
  });
  app.delete("/api/auth/keys/:id", (req, res, next) => {
    req.url = `/api/api-keys/${getParam(req.params, "id")}`;
    app._router.handle(req, res, next);
  });
  app.post("/api/auth/keys/:id/revoke", (req, res, next) => {
    req.url = `/api/api-keys/${getParam(req.params, "id")}/revoke`;
    app._router.handle(req, res, next);
  });
  app.post("/api/auth/keys/:id/rotate", (req, res, next) => {
    req.url = `/api/api-keys/${getParam(req.params, "id")}/rotate`;
    app._router.handle(req, res, next);
  });
  app.post("/api/auth/verify-api-key", async (req, res) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey || typeof apiKey !== "string") {
        return res.json({ valid: false, error: "API key is required" });
      }
      const keyHash = await hashApiKey(apiKey);
      const storedKey = await storage.getApiKeyByHash(keyHash);
      if (!storedKey) {
        return res.json({ valid: false, error: "Invalid API key" });
      }
      if (storedKey.revokedAt) {
        return res.json({ valid: false, error: "API key has been revoked" });
      }
      if (storedKey.expiresAt && /* @__PURE__ */ new Date() > storedKey.expiresAt) {
        return res.json({ valid: false, error: "API key has expired" });
      }
      await storage.updateApiKeyLastUsed(storedKey.id);
      const creator = await storage.getEnrichedUser(storedKey.createdBy);
      res.json({
        valid: true,
        keyId: storedKey.id,
        name: storedKey.name,
        orgId: storedKey.orgId,
        scopes: storedKey.scopes,
        createdBy: storedKey.createdBy,
        creator: creator ? {
          id: creator.id,
          email: creator.email,
          name: creator.name,
          isSuperAdmin: creator.isSuperAdmin,
          organizations: creator.organizations,
          entitlements: creator.entitlements,
          roles: creator.roles
        } : null
      });
    } catch (error) {
      console.error("Verify API key error:", error);
      res.json({ valid: false, error: "Verification failed" });
    }
  });
  app.get("/api/admin/users", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      res.json(allUsers.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        isSuperAdmin: u.isSuperAdmin,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt
      })));
    } catch (error) {
      console.error("Get all users error:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });
  app.patch("/api/admin/users/:id", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const data = updateUserAdminSchema.parse(req.body);
      const targetUser = await storage.getUser(getParam(req.params, "id"));
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      if (getParam(req.params, "id") === req.user.id && data.isSuperAdmin === false) {
        return res.status(400).json({ message: "Cannot remove super admin status from yourself" });
      }
      const updates = {};
      if (data.name !== void 0) updates.name = data.name;
      if (data.email !== void 0) {
        const existing = await storage.getUserByEmail(data.email);
        if (existing && existing.id !== getParam(req.params, "id")) {
          return res.status(400).json({ message: "Email already in use" });
        }
        updates.email = data.email;
      }
      if (data.isSuperAdmin !== void 0) updates.isSuperAdmin = data.isSuperAdmin;
      const user = await storage.updateUser(getParam(req.params, "id"), updates);
      await storage.createAuditLog({
        userId: req.user.id,
        action: "admin.user.updated",
        resource: "user",
        resourceId: getParam(req.params, "id"),
        metadataJson: updates
      });
      res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        isSuperAdmin: user.isSuperAdmin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      });
    } catch (error) {
      if (error instanceof external_exports.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Update user error:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });
  app.delete("/api/admin/users/:id", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const targetUser = await storage.getUser(getParam(req.params, "id"));
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      if (getParam(req.params, "id") === req.user.id) {
        return res.status(400).json({ message: "Cannot delete yourself" });
      }
      await storage.deleteSessionsByUser(getParam(req.params, "id"));
      await storage.deleteUser(getParam(req.params, "id"));
      await storage.createAuditLog({
        userId: req.user.id,
        action: "admin.user.deleted",
        resource: "user",
        resourceId: getParam(req.params, "id"),
        metadataJson: { email: targetUser.email }
      });
      res.json({ message: "User deleted" });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });
  app.get("/api/admin/orgs", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const allOrgs = await storage.getAllOrganizations();
      const orgsWithDetails = await Promise.all(
        allOrgs.map(async (org) => {
          const members = await storage.getMembershipsByOrg(org.id);
          const plan = org.planId ? await storage.getPlan(org.planId) : null;
          return {
            ...org,
            memberCount: members.length,
            planName: plan?.name
          };
        })
      );
      res.json(orgsWithDetails);
    } catch (error) {
      console.error("Get all orgs error:", error);
      res.status(500).json({ message: "Failed to fetch organizations" });
    }
  });
  app.patch("/api/admin/orgs/:id", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const data = updateOrgAdminSchema.parse(req.body);
      const org = await storage.getOrganization(getParam(req.params, "id"));
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }
      const updates = {};
      if (data.name !== void 0) updates.name = data.name;
      if (data.slug !== void 0) {
        const existing = await storage.getOrganizationBySlug(data.slug);
        if (existing && existing.id !== getParam(req.params, "id")) {
          return res.status(400).json({ message: "Slug already in use" });
        }
        updates.slug = data.slug;
      }
      if (data.planId !== void 0) updates.planId = data.planId;
      const updated = await storage.updateOrganization(getParam(req.params, "id"), updates);
      await storage.createAuditLog({
        userId: req.user.id,
        action: "admin.org.updated",
        resource: "organization",
        resourceId: getParam(req.params, "id"),
        metadataJson: updates
      });
      res.json(updated);
    } catch (error) {
      if (error instanceof external_exports.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Update org error:", error);
      res.status(500).json({ message: "Failed to update organization" });
    }
  });
  app.delete("/api/admin/orgs/:id", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const org = await storage.getOrganization(getParam(req.params, "id"));
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }
      await storage.deleteOrganization(getParam(req.params, "id"));
      await storage.createAuditLog({
        userId: req.user.id,
        action: "admin.org.deleted",
        resource: "organization",
        resourceId: getParam(req.params, "id"),
        metadataJson: { name: org.name, slug: org.slug }
      });
      res.json({ message: "Organization deleted" });
    } catch (error) {
      console.error("Delete org error:", error);
      res.status(500).json({ message: "Failed to delete organization" });
    }
  });
  app.get("/api/admin/audit-logs", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const allLogs = await storage.getAllAuditLogs();
      res.json(allLogs);
    } catch (error) {
      console.error("Get all audit logs error:", error);
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });
  app.post("/api/admin/plans", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const data = createPlanAdminSchema.parse(req.body);
      const existingPlan = await storage.getPlanByName(data.name);
      if (existingPlan) {
        return res.status(400).json({ message: "Plan with this name already exists" });
      }
      const plan = await storage.createPlan({
        name: data.name,
        featuresJson: data.featuresJson || [],
        limitsJson: data.limitsJson || {},
        priceCents: data.priceCents || 0
      });
      await storage.createAuditLog({
        userId: req.user.id,
        action: "admin.plan.created",
        resource: "plan",
        resourceId: plan.id,
        metadataJson: { name: data.name }
      });
      res.json(plan);
    } catch (error) {
      if (error instanceof external_exports.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create plan error:", error);
      res.status(500).json({ message: "Failed to create plan" });
    }
  });
  app.patch("/api/admin/plans/:id", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const data = updatePlanAdminSchema.parse(req.body);
      const plan = await storage.getPlan(getParam(req.params, "id"));
      if (!plan) {
        return res.status(404).json({ message: "Plan not found" });
      }
      if (data.name && data.name !== plan.name) {
        const existingPlan = await storage.getPlanByName(data.name);
        if (existingPlan) {
          return res.status(400).json({ message: "Plan with this name already exists" });
        }
      }
      const updated = await storage.updatePlan(getParam(req.params, "id"), {
        name: data.name,
        featuresJson: data.featuresJson,
        limitsJson: data.limitsJson,
        priceCents: data.priceCents
      });
      await storage.createAuditLog({
        userId: req.user.id,
        action: "admin.plan.updated",
        resource: "plan",
        resourceId: getParam(req.params, "id"),
        metadataJson: { name: data.name }
      });
      res.json(updated);
    } catch (error) {
      if (error instanceof external_exports.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Update plan error:", error);
      res.status(500).json({ message: "Failed to update plan" });
    }
  });
  app.get("/api/admin/users/:userId/entitlements", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const userId = getParam(req.params, "userId");
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const entitlements2 = await storage.getUserEntitlements(userId);
      res.json({ entitlements: entitlements2 });
    } catch (error) {
      console.error("Get user entitlements error:", error);
      res.status(500).json({ message: "Failed to load user entitlements" });
    }
  });
  app.post("/api/admin/users/:userId/entitlements", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const userId = getParam(req.params, "userId");
      const { entitlementKey } = req.body;
      if (!entitlementKey || typeof entitlementKey !== "string") {
        return res.status(400).json({ message: "entitlementKey is required" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const existingEntitlements = await storage.getUserEntitlementKeys(userId);
      if (existingEntitlements.includes(entitlementKey)) {
        return res.status(400).json({ message: "User already has this entitlement" });
      }
      const entitlement = await storage.createUserEntitlement({
        userId,
        entitlementKey,
        grantedBy: req.user.id
      });
      await storage.createAuditLog({
        userId: req.user.id,
        action: "admin.user_entitlement.granted",
        resource: "user_entitlement",
        resourceId: entitlement.id,
        metadataJson: { targetUserId: userId, entitlementKey }
      });
      res.json(entitlement);
    } catch (error) {
      console.error("Grant user entitlement error:", error);
      res.status(500).json({ message: "Failed to grant entitlement" });
    }
  });
  app.delete("/api/admin/users/:userId/entitlements/:entitlementKey", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const userId = getParam(req.params, "userId");
      const entitlementKey = getParam(req.params, "entitlementKey");
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      await storage.deleteUserEntitlementByKey(userId, entitlementKey);
      await storage.createAuditLog({
        userId: req.user.id,
        action: "admin.user_entitlement.revoked",
        resource: "user_entitlement",
        metadataJson: { targetUserId: userId, entitlementKey }
      });
      res.json({ message: "Entitlement revoked" });
    } catch (error) {
      console.error("Revoke user entitlement error:", error);
      res.status(500).json({ message: "Failed to revoke entitlement" });
    }
  });
  app.get("/api/admin/users/:userId/roles", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const userId = getParam(req.params, "userId");
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const roles = await storage.getUserRoles(userId);
      res.json({ roles });
    } catch (error) {
      console.error("Get user roles error:", error);
      res.status(500).json({ message: "Failed to load user roles" });
    }
  });
  app.post("/api/admin/users/:userId/roles", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const userId = getParam(req.params, "userId");
      const { roleKey } = req.body;
      if (!roleKey || typeof roleKey !== "string") {
        return res.status(400).json({ message: "roleKey is required" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const existingRoles = await storage.getUserRoleKeys(userId);
      if (existingRoles.includes(roleKey)) {
        return res.status(400).json({ message: "User already has this role" });
      }
      const role = await storage.createUserRole({
        userId,
        roleKey,
        grantedBy: req.user.id
      });
      await storage.createAuditLog({
        userId: req.user.id,
        action: "admin.user_role.granted",
        resource: "user_role",
        resourceId: role.id,
        metadataJson: { targetUserId: userId, roleKey }
      });
      res.json(role);
    } catch (error) {
      console.error("Grant user role error:", error);
      res.status(500).json({ message: "Failed to grant role" });
    }
  });
  app.delete("/api/admin/users/:userId/roles/:roleKey", authMiddleware, superAdminMiddleware, superAdminRateLimit, async (req, res) => {
    try {
      const userId = getParam(req.params, "userId");
      const roleKey = getParam(req.params, "roleKey");
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      await storage.deleteUserRoleByKey(userId, roleKey);
      await storage.createAuditLog({
        userId: req.user.id,
        action: "admin.user_role.revoked",
        resource: "user_role",
        metadataJson: { targetUserId: userId, roleKey }
      });
      res.json({ message: "Role revoked" });
    } catch (error) {
      console.error("Revoke user role error:", error);
      res.status(500).json({ message: "Failed to revoke role" });
    }
  });
  app.post("/api/credentials", authMiddleware, async (req, res) => {
    try {
      reportUnknownKeys(
        "POST /api/credentials",
        req.body,
        ["provider", "name", "apiKey", "isOrgWide", "metadata"]
      );
      const data = createUserCredentialSchema.parse(req.body);
      const encryptedCredential = encryptSecret(data.apiKey);
      const prefix = data.apiKey.slice(0, Math.min(8, data.apiKey.length));
      const orgId = req.headers["x-org-id"];
      const credential = await storage.createUserCredential({
        userId: req.user.id,
        orgId: orgId || null,
        provider: data.provider,
        name: data.name,
        credentialEncrypted: encryptedCredential,
        credentialPrefix: prefix,
        isOrgWide: data.isOrgWide,
        metadata: data.metadata
      });
      await storage.createAuditLog({
        userId: req.user.id,
        orgId: orgId || null,
        action: "credential.created",
        resource: "user_credential",
        resourceId: credential.id,
        metadataJson: { provider: data.provider, name: data.name }
      });
      res.json({
        id: credential.id,
        provider: credential.provider,
        name: credential.name,
        credentialPrefix: credential.credentialPrefix,
        isOrgWide: credential.isOrgWide,
        createdAt: credential.createdAt
      });
    } catch (error) {
      if (error instanceof external_exports.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Create credential error:", error);
      res.status(500).json({ message: "Failed to store credential" });
    }
  });
  app.get("/api/credentials", authMiddleware, async (req, res) => {
    try {
      const credentials = await storage.getUserCredentialsByUser(req.user.id);
      res.json(credentials.map((c) => ({
        id: c.id,
        provider: c.provider,
        name: c.name,
        credentialPrefix: c.credentialPrefix,
        isOrgWide: c.isOrgWide,
        lastUsedAt: c.lastUsedAt,
        createdAt: c.createdAt
      })));
    } catch (error) {
      console.error("List credentials error:", error);
      res.status(500).json({ message: "Failed to list credentials" });
    }
  });
  app.delete("/api/credentials/:id", authMiddleware, async (req, res) => {
    try {
      const credential = await storage.getUserCredential(getParam(req.params, "id"));
      if (!credential) {
        return res.status(404).json({ message: "Credential not found" });
      }
      if (credential.userId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      await storage.deleteUserCredential(credential.id);
      await storage.createAuditLog({
        userId: req.user.id,
        orgId: credential.orgId,
        action: "credential.deleted",
        resource: "user_credential",
        resourceId: credential.id,
        metadataJson: { provider: credential.provider, name: credential.name }
      });
      res.json({ message: "Credential deleted successfully" });
    } catch (error) {
      console.error("Delete credential error:", error);
      res.status(500).json({ message: "Failed to delete credential" });
    }
  });
  app.get("/api/debug/credentials", async (req, res) => {
    if (process.env.NODE_ENV !== "development" && process.env.IDENTITY_USE_MEMORY_DB !== "true") {
      return res.status(404).json({ message: "Not found" });
    }
    const superAdminCreds = await storage.getUserCredentialsByUser("650e8400-e29b-41d4-a716-446655440000");
    const orgCreds = await storage.getUserCredentialsByOrg("550e8400-e29b-41d4-a716-446655440000");
    const mapCred = (c) => ({
      id: c.id,
      userId: c.userId,
      orgId: c.orgId,
      provider: c.provider,
      isOrgWide: c.isOrgWide,
      prefix: c.credentialPrefix
    });
    res.json({
      superAdminCredentials: superAdminCreds.map(mapCred),
      orgCredentials: orgCreds.map(mapCred)
    });
  });
  app.get("/api/internal/credentials/:userId/:provider", async (req, res, next) => {
    if (getParam(req.params, "userId") === "by-id") return next();
    try {
      const serviceId = req.headers["x-service-id"];
      const isService = serviceId && ["integrations", "assistants", "runtime"].includes(serviceId);
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token && !isService) {
        return res.status(401).json({
          message: "Authentication required",
          accepts: "a bearer token, or X-Service-Id for service-to-service reads \u2014 the same admission POST /api/internal/credentials/oauth already grants"
        });
      }
      if (!isService) {
        const payload = verifyToken(token);
        if (!payload) {
          return res.status(401).json({ message: "Invalid token" });
        }
        if (payload.sub !== getParam(req.params, "userId")) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      const userId = getParam(req.params, "userId");
      const provider = getParam(req.params, "provider");
      const orgId = req.headers["x-org-id"];
      console.log(`[identity] Internal credential lookup - userId: ${userId}, orgId: ${orgId}, provider: ${provider}`);
      const credential = await storage.getCredentialForUserOrOrg(userId, orgId || null, provider);
      console.log(`[identity] Credential lookup result: ${credential ? `found (id: ${credential.id})` : "not found"}`);
      if (!credential) {
        return res.status(404).json({ message: "Credential not found" });
      }
      const apiKey = decryptSecret(credential.credentialEncrypted);
      await storage.updateUserCredentialLastUsed(credential.id);
      const isProxy = credential.isOrgWide && credential.userId !== userId;
      res.json({
        apiKey,
        metadata: credential.metadata,
        // Proxy info for usage tracking
        credentialId: credential.id,
        isProxy,
        ownerId: credential.userId,
        // Who owns this credential
        isOrgWide: credential.isOrgWide
      });
    } catch (error) {
      console.error("Internal credential lookup error:", error);
      res.status(500).json({ message: "Failed to retrieve credential" });
    }
  });
  app.post("/api/internal/credentials/oauth", async (req, res) => {
    try {
      const serviceId = req.headers["x-service-id"];
      if (!serviceId || !["integrations", "assistants", "runtime"].includes(serviceId)) {
        return res.status(403).json({ message: "Service access denied" });
      }
      const {
        userId,
        orgId,
        provider,
        accessToken,
        refreshToken,
        expiresAt,
        oauthUserId,
        oauthUserEmail,
        oauthUserName,
        // AN ASSISTANT PRINCIPAL CAN NEVER OWN AN API KEY.
        //
        // Assistants call integrations as `assistant:<key>`, which is not a
        // uuid and cannot hold a credential row. getCredentialForUserOrOrg
        // falls back to an org-wide credential for exactly this case, but this
        // route hardcoded isOrgWide:false, so nothing an operator added through
        // Settings was ever visible to an assistant.
        //
        // Measured 24 Aug on air: an anthropic key was present under the admin
        // principal and resolvable there, while the coordinator resolved to the
        // local model and timed out on every reply. The chat window said
        // "aborted due to timeout", which describes the symptom and hides the
        // cause completely.
        //
        // Defaults false. Sharing a credential with a whole org is a decision
        // the caller states.
        isOrgWide
      } = req.body;
      if (!userId || !provider || !accessToken) {
        return res.status(400).json({ message: "Missing required fields: userId, provider, accessToken" });
      }
      const encryptedAccessToken = encryptSecret(accessToken);
      const encryptedRefreshToken = refreshToken ? encryptSecret(refreshToken) : null;
      const prefix = accessToken.slice(0, Math.min(8, accessToken.length));
      const existingCredential = await storage.getCredentialForUserOrOrg(userId, orgId || null, provider);
      let credential;
      if (existingCredential) {
        credential = await storage.updateUserCredential(existingCredential.id, {
          credentialEncrypted: encryptedAccessToken,
          credentialPrefix: prefix,
          credentialType: "oauth_token",
          refreshTokenEncrypted: encryptedRefreshToken,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          oauthUserId: oauthUserId || null,
          oauthUserEmail: oauthUserEmail || null,
          oauthUserName: oauthUserName || null,
          ...isOrgWide === void 0 ? {} : { isOrgWide: Boolean(isOrgWide), orgId: orgId || null }
        });
        credential = { ...existingCredential, ...credential };
      } else {
        credential = await storage.createUserCredential({
          userId,
          orgId: orgId || null,
          provider,
          name: `${provider} OAuth`,
          credentialEncrypted: encryptedAccessToken,
          credentialPrefix: prefix,
          isOrgWide: Boolean(isOrgWide),
          metadata: {},
          credentialType: "oauth_token",
          refreshTokenEncrypted: encryptedRefreshToken,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          oauthUserId: oauthUserId || null,
          oauthUserEmail: oauthUserEmail || null,
          oauthUserName: oauthUserName || null
        });
      }
      await storage.createAuditLog({
        userId,
        orgId: orgId || null,
        action: existingCredential ? "oauth.token_refreshed" : "oauth.token_stored",
        resource: "user_credential",
        resourceId: credential.id,
        metadataJson: { provider, oauthUserId, oauthUserEmail }
      });
      res.json({
        credentialId: credential.id,
        provider: credential.provider,
        expiresAt: expiresAt || null
      });
    } catch (error) {
      console.error("Store OAuth token error:", error);
      res.status(500).json({ message: "Failed to store OAuth token" });
    }
  });
  app.get("/api/internal/credentials/by-id/:credentialId", async (req, res) => {
    try {
      const serviceId = req.headers["x-service-id"];
      if (!serviceId || !["integrations", "assistants", "runtime"].includes(serviceId)) {
        return res.status(403).json({ message: "Service access denied" });
      }
      const credential = await storage.getUserCredential(getParam(req.params, "credentialId"));
      if (!credential) {
        return res.status(404).json({ message: "Credential not found" });
      }
      const apiKey = decryptSecret(credential.credentialEncrypted);
      res.json({
        apiKey,
        metadata: credential.metadata,
        credentialId: credential.id,
        isProxy: false,
        ownerId: credential.userId,
        isOrgWide: credential.isOrgWide,
        // EXPIRY IS METADATA, NOT A SECRET, AND NOTHING COULD SEE IT.
        //
        // A caller holding a live connection on this credential has no way to
        // know it is about to stop working, so the only possible strategy was
        // to wait for the failure. Measured 24 Aug: a Twitch token expires in
        // roughly four hours and the chat socket dies with it; the supervisor
        // then takes up to a sweep interval to notice. Every message a viewer
        // sends in that window is lost.
        //
        // Returning the timestamp lets a caller refresh before the cliff
        // instead of after it. It reveals when a token dies, not what it is.
        expiresAt: credential.expiresAt ? credential.expiresAt.toISOString() : null,
        hasRefreshToken: Boolean(credential.refreshTokenEncrypted)
      });
    } catch (error) {
      console.error("Get credential by ID error:", error);
      res.status(500).json({ message: "Failed to retrieve credential" });
    }
  });
  app.post("/api/internal/credentials/:userId/:provider/refresh", async (req, res) => {
    try {
      const serviceId = req.headers["x-service-id"];
      if (!serviceId || !["integrations", "assistants", "runtime"].includes(serviceId)) {
        return res.status(403).json({ message: "Service access denied" });
      }
      const userId = getParam(req.params, "userId");
      const provider = getParam(req.params, "provider");
      const orgId = req.headers["x-org-id"] || req.body?.orgId || null;
      const { tokenUrl, clientId, clientSecret } = req.body || {};
      if (!tokenUrl || !clientId) {
        return res.status(400).json({ message: "tokenUrl and clientId are required" });
      }
      const credential = await storage.getCredentialForUserOrOrg(userId, orgId, provider);
      if (!credential) return res.status(404).json({ message: "Credential not found" });
      if (!credential.refreshTokenEncrypted) {
        return res.status(409).json({
          message: "This credential carries no refresh token; it must be re-authorised interactively"
        });
      }
      const refreshToken = decryptSecret(credential.refreshTokenEncrypted);
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        ...clientSecret ? { client_secret: clientSecret } : {}
      });
      const r = await fetch(tokenUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.access_token) {
        return res.status(502).json({
          message: "Refresh rejected by the provider",
          providerStatus: r.status,
          providerError: data.message || data.error_description || data.error || null
        });
      }
      const newToken = String(data.access_token);
      const previous = decryptSecret(credential.credentialEncrypted);
      const sep = previous.indexOf(":");
      const accessToken = sep > 0 && !previous.slice(0, sep).includes(" ") ? `${previous.slice(0, sep)}:${newToken}` : newToken;
      const expiresAt = typeof data.expires_in === "number" ? new Date(Date.now() + data.expires_in * 1e3) : null;
      await storage.updateUserCredential(credential.id, {
        credentialEncrypted: encryptSecret(accessToken),
        credentialPrefix: accessToken.slice(0, Math.min(8, accessToken.length)),
        credentialType: "oauth_token",
        // Twitch rotates the refresh token on every use. Keeping the old one
        // would make the NEXT refresh fail, an hour later, somewhere else.
        ...data.refresh_token ? { refreshTokenEncrypted: encryptSecret(String(data.refresh_token)) } : {},
        expiresAt
      });
      console.log(`[identity] refreshed ${provider} for ${userId}; expires ${expiresAt?.toISOString() ?? "unknown"}`);
      res.json({ apiKey: accessToken, expiresAt: expiresAt?.toISOString() ?? null, credentialId: credential.id });
    } catch (error) {
      console.error("Credential refresh error:", error);
      res.status(500).json({ message: "Failed to refresh credential" });
    }
  });
  app.get("/api/internal/orgs/:orgId/limits", async (req, res) => {
    try {
      const serviceId = req.headers["x-service-id"];
      if (!serviceId || !["integrations", "assistants", "runtime"].includes(serviceId)) {
        return res.status(403).json({ message: "Service access denied" });
      }
      const orgId = getParam(req.params, "orgId");
      const org = await storage.getOrganization(orgId);
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }
      if (!org.planId) {
        return res.json({ orgId, planId: null, limits: null, reason: "organization has no plan assigned" });
      }
      const plan = await storage.getPlan(org.planId);
      if (!plan) {
        return res.status(404).json({ message: "Plan referenced by this organization does not exist" });
      }
      res.json({ orgId, planId: plan.id, planName: plan.name, limits: plan.limitsJson ?? {} });
    } catch (error) {
      console.error("Internal org limits lookup error:", error);
      res.status(500).json({ message: "Failed to retrieve organization limits" });
    }
  });
  app.delete("/api/internal/credentials/:credentialId", async (req, res) => {
    try {
      const serviceId = req.headers["x-service-id"];
      const requestUserId = req.headers["x-user-id"];
      if (!serviceId || !["integrations", "assistants", "runtime"].includes(serviceId)) {
        return res.status(403).json({ message: "Service access denied" });
      }
      const credential = await storage.getUserCredential(getParam(req.params, "credentialId"));
      if (!credential) {
        return res.status(404).json({ message: "Credential not found" });
      }
      if (requestUserId && credential.userId !== requestUserId) {
        return res.status(403).json({ message: "Access denied" });
      }
      await storage.deleteUserCredential(credential.id);
      await storage.createAuditLog({
        userId: requestUserId || credential.userId,
        orgId: credential.orgId,
        action: "credential.deleted",
        resource: "user_credential",
        resourceId: credential.id,
        metadataJson: { provider: credential.provider, name: credential.name }
      });
      res.json({ success: true, message: "Credential deleted" });
    } catch (error) {
      console.error("Delete credential error:", error);
      res.status(500).json({ message: "Failed to delete credential" });
    }
  });
  app.get("/api/entities/:id", authMiddleware, async (req, res) => {
    try {
      const entity = await storage.getEntity(getParam(req.params, "id"));
      if (!entity) {
        return res.status(404).json({ message: "Entity not found" });
      }
      if (entity.orgId && req.user && !req.user.isSuperAdmin) {
        const membership = await storage.getMembershipByUserAndOrg(req.user.id, entity.orgId);
        if (!membership) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      res.json(entity);
    } catch (error) {
      console.error("Get entity error:", error);
      res.status(500).json({ message: "Failed to fetch entity" });
    }
  });
  app.get("/api/entities", authMiddleware, async (req, res) => {
    try {
      const { type, orgId, slug, status } = req.query;
      let allowedOrgIds;
      if (req.user && !req.user.isSuperAdmin) {
        const memberships2 = await storage.getMembershipsByUser(req.user.id);
        allowedOrgIds = memberships2.map((m) => m.orgId);
      }
      const entities2 = await storage.listEntities({
        type,
        orgId,
        slug,
        status,
        allowedOrgIds
      });
      res.json({ entities: entities2, count: entities2.length });
    } catch (error) {
      console.error("List entities error:", error);
      res.status(500).json({ message: "Failed to list entities" });
    }
  });
  app.post("/api/entities/resolve", authMiddleware, async (req, res) => {
    try {
      const { address, orgId } = req.body;
      if (!address || typeof address !== "string") {
        return res.status(400).json({ message: "Address is required" });
      }
      const contextOrgId = orgId || req.headers["x-org-id"];
      const result = await storage.resolveEntityAddress(address, contextOrgId);
      if (!result || result.length === 0) {
        return res.status(404).json({
          message: "Entity not found",
          address,
          suggestions: await storage.getSimilarEntities(address, contextOrgId)
        });
      }
      res.json({
        resolved: result.length === 1 ? result[0] : result,
        count: result.length,
        address
      });
    } catch (error) {
      console.error("Resolve entity error:", error);
      res.status(500).json({ message: "Failed to resolve entity" });
    }
  });
  app.post("/api/entities", authMiddleware, async (req, res) => {
    try {
      const { type, slug, displayName, instanceId, orgId, networkId, capabilities, tags, sourceTable, sourceId, metadata } = req.body;
      if (!type || !slug || !displayName) {
        return res.status(400).json({ message: "type, slug, and displayName are required" });
      }
      const existing = await storage.getEntityBySlugOrgInstance(slug, orgId, instanceId);
      if (existing) {
        return res.status(409).json({
          message: "Entity with this slug already exists",
          existingId: existing.id
        });
      }
      const entity = await storage.createEntity({
        type,
        slug,
        displayName,
        instanceId,
        orgId,
        networkId,
        capabilities: capabilities || [],
        tags: tags || [],
        sourceTable,
        sourceId,
        metadata: metadata || {},
        status: "active"
      });
      await storage.createEntityAlias({
        entityId: entity.id,
        aliasType: "slug",
        aliasValue: slug,
        orgId,
        priority: 100
      });
      if (type && slug) {
        await storage.createEntityAlias({
          entityId: entity.id,
          aliasType: "qualified",
          aliasValue: `${type}:${slug}`,
          orgId,
          priority: 90
        });
      }
      res.status(201).json(entity);
    } catch (error) {
      console.error("Create entity error:", error);
      res.status(500).json({ message: "Failed to create entity" });
    }
  });
  app.patch("/api/entities/:id", authMiddleware, async (req, res) => {
    try {
      const entity = await storage.getEntity(getParam(req.params, "id"));
      if (!entity) {
        return res.status(404).json({ message: "Entity not found" });
      }
      if (entity.orgId && req.user && !req.user.isSuperAdmin) {
        const membership = await storage.getMembershipByUserAndOrg(req.user.id, entity.orgId);
        if (!membership || membership.role === "viewer") {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      const { displayName, capabilities, tags, status, metadata } = req.body;
      const updates = {};
      if (displayName !== void 0) updates.displayName = displayName;
      if (capabilities !== void 0) updates.capabilities = capabilities;
      if (tags !== void 0) updates.tags = tags;
      if (status !== void 0) updates.status = status;
      if (metadata !== void 0) updates.metadata = metadata;
      const updated = await storage.updateEntity(getParam(req.params, "id"), updates);
      res.json(updated);
    } catch (error) {
      console.error("Update entity error:", error);
      res.status(500).json({ message: "Failed to update entity" });
    }
  });
  app.post("/api/entities/:id/bind", authMiddleware, async (req, res) => {
    try {
      const { nodeId } = req.body;
      if (!nodeId) {
        return res.status(400).json({ message: "nodeId is required" });
      }
      const entity = await storage.getEntity(getParam(req.params, "id"));
      if (!entity) {
        return res.status(404).json({ message: "Entity not found" });
      }
      const updated = await storage.bindEntityToNode(getParam(req.params, "id"), nodeId);
      res.json(updated);
    } catch (error) {
      console.error("Bind entity error:", error);
      res.status(500).json({ message: "Failed to bind entity" });
    }
  });
  app.post("/api/entities/:id/unbind", authMiddleware, async (req, res) => {
    try {
      const entity = await storage.getEntity(getParam(req.params, "id"));
      if (!entity) {
        return res.status(404).json({ message: "Entity not found" });
      }
      const updated = await storage.unbindEntityFromNode(getParam(req.params, "id"));
      res.json(updated);
    } catch (error) {
      console.error("Unbind entity error:", error);
      res.status(500).json({ message: "Failed to unbind entity" });
    }
  });
  app.get("/api/entities/by-node/:nodeId", authMiddleware, async (req, res) => {
    try {
      const entity = await storage.getEntityByNodeId(getParam(req.params, "nodeId"));
      if (!entity) {
        return res.status(404).json({ message: "No entity bound to this node" });
      }
      res.json(entity);
    } catch (error) {
      console.error("Get entity by node error:", error);
      res.status(500).json({ message: "Failed to fetch entity" });
    }
  });
  app.post("/api/entities/sync", authMiddleware, superAdminMiddleware, async (req, res) => {
    try {
      const { source } = req.body;
      const results = { users: 0, agents: 0 };
      if (source === "users" || source === "all") {
        const users2 = await storage.getAllUsers();
        for (const user of users2) {
          const existing = await storage.getEntityBySourceId("users", user.id);
          if (!existing) {
            await storage.createEntity({
              type: "user",
              slug: user.email.split("@")[0].toLowerCase().replace(/[^a-z0-9-_]/g, "-"),
              displayName: user.name,
              sourceTable: "users",
              sourceId: user.id,
              status: "active",
              capabilities: [],
              tags: [],
              metadata: { email: user.email }
            });
            results.users++;
          }
        }
      }
      if (source === "agents" || source === "all") {
        const agents2 = await storage.getAllAgents();
        for (const agent of agents2) {
          const existing = await storage.getEntityBySourceId("agents", agent.id);
          if (!existing) {
            const [agentType, agentKey] = agent.agentId.split(":");
            await storage.createEntity({
              type: agentType === "assistant" ? "assistant" : "service",
              slug: agentKey || agent.agentId,
              displayName: agent.name,
              orgId: agent.orgId || void 0,
              sourceTable: "agents",
              sourceId: agent.id,
              status: agent.isActive ? "active" : "inactive",
              capabilities: agent.capabilities || [],
              tags: [],
              metadata: { agentId: agent.agentId }
            });
            results.agents++;
          }
        }
      }
      res.json({
        message: "Sync completed",
        created: results
      });
    } catch (error) {
      console.error("Sync entities error:", error);
      res.status(500).json({ message: "Failed to sync entities" });
    }
  });
  app.get("/symbia-namespace", async (_req, res) => {
    res.json({
      namespace: "identity",
      version: "1.0.0",
      description: "Authentication, users, and organizations",
      properties: {
        "users.count": { type: "number", description: "Total user count" },
        "orgs.count": { type: "number", description: "Total organization count" },
        "agents.count": { type: "number", description: "Total agent count" },
        "entities.count": { type: "number", description: "Total entity count" }
      }
    });
  });
  return httpServer;
}
async function bootstrap() {
  await initSystemBootstrap();
  if (process.env.IDENTITY_SEED_DEFAULT_ADMIN !== "false") {
    try {
      const pw = resolveAdminPassword();
      const created = await db.insert(users).values({
        id: DEFAULT_USER_IDS.SUPER_ADMIN,
        email: DEFAULT_ADMIN_EMAIL,
        passwordHash: import_bcryptjs.default.hashSync(pw.password, 10),
        name: "Dev Admin",
        isSuperAdmin: true
      }).onConflictDoNothing().returning({ id: users.id });
      await db.insert(organizations).values({
        id: DEFAULT_ORG_IDS.SYMBIA_LABS,
        name: "Symbia Labs",
        slug: "symbia-labs"
      }).onConflictDoNothing();
      await db.insert(memberships).values({
        userId: DEFAULT_USER_IDS.SUPER_ADMIN,
        orgId: DEFAULT_ORG_IDS.SYMBIA_LABS,
        role: "admin"
      }).onConflictDoNothing();
      console.log(adminSeedNotice(created.length > 0, pw));
    } catch (error) {
      console.error("Failed to ensure default admin:", error);
    }
  }
}
export {
  bootstrap,
  registerRoutes
};
