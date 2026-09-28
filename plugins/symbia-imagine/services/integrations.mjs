import { createRequire as __symbiaCreateRequire } from "node:module";globalThis.require ??= __symbiaCreateRequire(import.meta.url);
import {
  require_dist
} from "../chunks/chunk-242E7XRN.mjs";
import {
  createModelsClient,
  outbound_exports
} from "../chunks/chunk-26D4SBW3.mjs";
import {
  emitEvent,
  emitHttpRequest,
  emitHttpResponse,
  observabilityMiddleware
} from "../chunks/chunk-L3PULR7W.mjs";
import {
  EgressError,
  safeFetch
} from "../chunks/chunk-ZNW4YLHV.mjs";
import "../chunks/chunk-DC2WQTDC.mjs";
import {
  require_express
} from "../chunks/chunk-WXJ3LX3E.mjs";
import "../chunks/chunk-SG5E4KLZ.mjs";
import "../chunks/chunk-QB3Z7RRP.mjs";
import "../chunks/chunk-MXWCS3YP.mjs";
import {
  createTelemetryClient
} from "../chunks/chunk-AXIMLSIR.mjs";
import {
  require_main
} from "../chunks/chunk-EWQDMZT4.mjs";
import {
  createAuthMiddleware
} from "../chunks/chunk-P2CNEUXS.mjs";
import {
  ServiceId,
  ServicePorts,
  resolveOwnPort,
  resolveServiceUrl
} from "../chunks/chunk-B6I54FM5.mjs";
import {
  ZodIssueCode,
  external_exports
} from "../chunks/chunk-TCCFD4DK.mjs";
import {
  and,
  boolean,
  clearSessionContext,
  desc,
  eq,
  gte,
  index,
  initializeDatabase,
  integer,
  isNull,
  json,
  lte,
  or,
  pgTable,
  real,
  runWithRLSContext,
  setSessionContext,
  sql,
  text,
  timestamp,
  varchar
} from "../chunks/chunk-DSXICZVV.mjs";
import "../chunks/chunk-572SKMOA.mjs";
import {
  __commonJS,
  __require,
  __toESM
} from "../chunks/chunk-JCYRGLK6.mjs";

// build/plugin/symbia-imagine/node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "build/plugin/symbia-imagine/node_modules/ws/lib/constants.js"(exports, module) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: Symbol("kIsForOnEventAttribute"),
      kListener: Symbol("kListener"),
      kStatusCode: Symbol("status-code"),
      kWebSocket: Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// build/plugin/symbia-imagine/node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "build/plugin/symbia-imagine/node_modules/ws/lib/buffer-util.js"(exports, module) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = __require("bufferutil");
        module.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// build/plugin/symbia-imagine/node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "build/plugin/symbia-imagine/node_modules/ws/lib/limiter.js"(exports, module) {
    "use strict";
    var kDone = Symbol("kDone");
    var kRun = Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module.exports = Limiter;
  }
});

// build/plugin/symbia-imagine/node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "build/plugin/symbia-imagine/node_modules/ws/lib/permessage-deflate.js"(exports, module) {
    "use strict";
    var zlib = __require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = Symbol("permessage-deflate");
    var kTotalLength = Symbol("total-length");
    var kCallback = Symbol("callback");
    var kBuffers = Symbol("buffers");
    var kError = Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate2 = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {Boolean} [options.isServer=false] Create the instance in either
       *     server or client mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       */
      constructor(options) {
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._maxPayload = this._options.maxPayload | 0;
        this._isServer = !!this._options.isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && (typeof params.client_max_window_bits === "number" ? opts.clientMaxWindowBits > params.client_max_window_bits : !params.client_max_window_bits)) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module.exports = PerMessageDeflate2;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// build/plugin/symbia-imagine/node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "build/plugin/symbia-imagine/node_modules/ws/lib/validation.js"(exports, module) {
    "use strict";
    var { isUtf8 } = __require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = __require("utf-8-validate");
        module.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// build/plugin/symbia-imagine/node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "build/plugin/symbia-imagine/node_modules/ws/lib/receiver.js"(exports, module) {
    "use strict";
    var { Writable } = __require("stream");
    var PerMessageDeflate2 = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxBufferedChunks = options.maxBufferedChunks | 0;
        this._maxFragments = options.maxFragments | 0;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._numFragments = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        if (this._maxBufferedChunks > 0 && this._buffers.length >= this._maxBufferedChunks) {
          cb(
            this.createError(
              RangeError,
              "Too many buffered chunks",
              false,
              1008,
              "WS_ERR_TOO_MANY_BUFFERED_PARTS"
            )
          );
          return;
        }
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate2.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._maxFragments > 0 && ++this._numFragments > this._maxFragments) {
          const error = this.createError(
            RangeError,
            "Too many message fragments",
            false,
            1008,
            "WS_ERR_TOO_MANY_BUFFERED_PARTS"
          );
          cb(error);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._numFragments = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module.exports = Receiver2;
  }
});

// build/plugin/symbia-imagine/node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "build/plugin/symbia-imagine/node_modules/ws/lib/sender.js"(exports, module) {
    "use strict";
    var { Duplex } = __require("stream");
    var { randomFillSync } = __require("crypto");
    var {
      types: { isUint8Array }
    } = __require("util");
    var PerMessageDeflate2 = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else if (isUint8Array(data)) {
            buf.set(data, 2);
          } else {
            throw new TypeError("Second argument must be a string or a Uint8Array");
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module.exports = Sender2;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// build/plugin/symbia-imagine/node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "build/plugin/symbia-imagine/node_modules/ws/lib/event-target.js"(exports, module) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = Symbol("kCode");
    var kData = Symbol("kData");
    var kError = Symbol("kError");
    var kMessage = Symbol("kMessage");
    var kReason = Symbol("kReason");
    var kTarget = Symbol("kTarget");
    var kType = Symbol("kType");
    var kWasClean = Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// build/plugin/symbia-imagine/node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "build/plugin/symbia-imagine/node_modules/ws/lib/extension.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension2) => {
        let configurations = extensions[extension2];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension2].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module.exports = { format, parse };
  }
});

// build/plugin/symbia-imagine/node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "build/plugin/symbia-imagine/node_modules/ws/lib/websocket.js"(exports, module) {
    "use strict";
    var EventEmitter = __require("events");
    var https = __require("https");
    var http = __require("http");
    var net = __require("net");
    var tls = __require("tls");
    var { randomBytes, createHash } = __require("crypto");
    var { Duplex, Readable } = __require("stream");
    var { URL: URL2 } = __require("url");
    var PerMessageDeflate2 = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            if (!options || options.protocols === void 0) {
              protocols = [];
            } else if (Array.isArray(options.protocols)) {
              protocols = options.protocols;
            } else {
              protocols = [options.protocols];
            }
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              if (options.protocols === void 0) {
                protocols = [];
              } else if (Array.isArray(options.protocols)) {
                protocols = options.protocols;
              } else {
                protocols = [options.protocols];
              }
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._closeTimeout = options.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxBufferedChunks: options.maxBufferedChunks,
          maxFragments: options.maxFragments,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate2.extensionName]) {
          this._extensions[PerMessageDeflate2.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        this._readyState = _WebSocket.CLOSING;
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate2.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module.exports = WebSocket2;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxBufferedChunks: 256 * 1024,
        maxFragments: 16 * 1024,
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        protocols: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      websocket._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL2) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL2(address);
        } catch {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes(16).toString("base64");
      const request = isSecure ? https.request : http.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate2({
          ...opts.perMessageDeflate,
          isServer: false,
          maxPayload: opts.maxPayload
        });
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate2.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL2(location, address);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate2.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate2.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxBufferedChunks: opts.maxBufferedChunks,
          maxFragments: opts.maxFragments,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket2.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        websocket._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket2.CLOSING;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// build/plugin/symbia-imagine/node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "build/plugin/symbia-imagine/node_modules/ws/lib/stream.js"(exports, module) {
    "use strict";
    var WebSocket2 = require_websocket();
    var { Duplex } = __require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream2(ws, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws.pause();
      });
      ws.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws.once("close", function close2() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws.once("close", function close2() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null) return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused) ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module.exports = createWebSocketStream2;
  }
});

// build/plugin/symbia-imagine/node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "build/plugin/symbia-imagine/node_modules/ws/lib/subprotocol.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module.exports = { parse };
  }
});

// build/plugin/symbia-imagine/node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "build/plugin/symbia-imagine/node_modules/ws/lib/websocket-server.js"(exports, module) {
    "use strict";
    var EventEmitter = __require("events");
    var http = __require("http");
    var { Duplex } = __require("stream");
    var { createHash } = __require("crypto");
    var extension2 = require_extension();
    var PerMessageDeflate2 = require_permessage_deflate();
    var subprotocol2 = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxBufferedChunks=262144] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=16384] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxBufferedChunks: 256 * 1024,
          maxFragments: 16 * 1024,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket2,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http.createServer((req, res) => {
            const body = http.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index2 = req.url.indexOf("?");
          const pathname = index2 !== -1 ? req.url.slice(0, index2) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol2.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate2({
            ...this.options.perMessageDeflate,
            isServer: true,
            maxPayload: this.options.maxPayload
          });
          try {
            const offers = extension2.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate2.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate2.extensionName]);
              extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate2.extensionName]) {
          const params = extensions[PerMessageDeflate2.extensionName].params;
          const value = extension2.format({
            [PerMessageDeflate2.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxBufferedChunks: this.options.maxBufferedChunks,
          maxFragments: this.options.maxFragments,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req);
      }
    };
    module.exports = WebSocketServer2;
    function addListeners(server, map) {
      for (const event of Object.keys(map)) server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers) {
      if (server.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// build/plugin/symbia-imagine/services/integrations.mjs
import { randomUUID as randomUUID3 } from "crypto";
var import_dotenv = __toESM(require_main(), 1);
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
var import_yaml = __toESM(require_dist(), 1);
import { spawn } from "child_process";
var import_express = __toESM(require_express(), 1);

// build/plugin/symbia-imagine/node_modules/zod-validation-error/v3/index.mjs
function isZodErrorLike(err) {
  return err instanceof Error && err.name === "ZodError" && "issues" in err && Array.isArray(err.issues);
}
var ValidationError = class extends Error {
  name;
  details;
  constructor(message, options) {
    super(message, options);
    this.name = "ZodValidationError";
    this.details = getIssuesFromErrorOptions(options);
  }
  toString() {
    return this.message;
  }
};
function getIssuesFromErrorOptions(options) {
  if (options) {
    const cause = options.cause;
    if (isZodErrorLike(cause)) {
      return cause.issues;
    }
  }
  return [];
}
function isNonEmptyArray(value) {
  return value.length !== 0;
}
function stringifySymbol(symbol) {
  return symbol.description ?? "";
}
var identifierRegex = /[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*/u;
function joinPath(path) {
  if (path.length === 1) {
    let propertyKey = path[0];
    if (typeof propertyKey === "symbol") {
      propertyKey = stringifySymbol(propertyKey);
    }
    return propertyKey.toString() || '""';
  }
  return path.reduce((acc, propertyKey) => {
    if (typeof propertyKey === "number") {
      return acc + "[" + propertyKey.toString() + "]";
    }
    if (typeof propertyKey === "symbol") {
      propertyKey = stringifySymbol(propertyKey);
    }
    if (propertyKey.includes('"')) {
      return acc + '["' + escapeQuotes(propertyKey) + '"]';
    }
    if (!identifierRegex.test(propertyKey)) {
      return acc + '["' + propertyKey + '"]';
    }
    const separator = acc.length === 0 ? "" : ".";
    return acc + separator + propertyKey;
  }, "");
}
function escapeQuotes(str) {
  return str.replace(/"/g, '\\"');
}
var ISSUE_SEPARATOR = "; ";
var MAX_ISSUES_IN_MESSAGE = 99;
var PREFIX = "Validation error";
var PREFIX_SEPARATOR = ": ";
var UNION_SEPARATOR = ", or ";
function createMessageBuilder(props = {}) {
  const {
    issueSeparator = ISSUE_SEPARATOR,
    unionSeparator = UNION_SEPARATOR,
    prefixSeparator = PREFIX_SEPARATOR,
    prefix = PREFIX,
    includePath = true,
    maxIssuesInMessage = MAX_ISSUES_IN_MESSAGE
  } = props;
  return (issues) => {
    const message = issues.slice(0, maxIssuesInMessage).map(
      (issue) => getMessageFromZodIssue({
        issue,
        issueSeparator,
        unionSeparator,
        includePath
      })
    ).join(issueSeparator);
    return prefixMessage(message, prefix, prefixSeparator);
  };
}
function getMessageFromZodIssue(props) {
  const { issue, issueSeparator, unionSeparator, includePath } = props;
  if (issue.code === ZodIssueCode.invalid_union) {
    return issue.unionErrors.reduce((acc, zodError) => {
      const newIssues = zodError.issues.map(
        (issue2) => getMessageFromZodIssue({
          issue: issue2,
          issueSeparator,
          unionSeparator,
          includePath
        })
      ).join(issueSeparator);
      if (!acc.includes(newIssues)) {
        acc.push(newIssues);
      }
      return acc;
    }, []).join(unionSeparator);
  }
  if (issue.code === ZodIssueCode.invalid_arguments) {
    return [
      issue.message,
      ...issue.argumentsError.issues.map(
        (issue2) => getMessageFromZodIssue({
          issue: issue2,
          issueSeparator,
          unionSeparator,
          includePath
        })
      )
    ].join(issueSeparator);
  }
  if (issue.code === ZodIssueCode.invalid_return_type) {
    return [
      issue.message,
      ...issue.returnTypeError.issues.map(
        (issue2) => getMessageFromZodIssue({
          issue: issue2,
          issueSeparator,
          unionSeparator,
          includePath
        })
      )
    ].join(issueSeparator);
  }
  if (includePath && isNonEmptyArray(issue.path)) {
    if (issue.path.length === 1) {
      const identifier = issue.path[0];
      if (typeof identifier === "number") {
        return `${issue.message} at index ${identifier}`;
      }
    }
    return `${issue.message} at "${joinPath(issue.path)}"`;
  }
  return issue.message;
}
function prefixMessage(message, prefix, prefixSeparator) {
  if (prefix !== null) {
    if (message.length > 0) {
      return [prefix, message].join(prefixSeparator);
    }
    return prefix;
  }
  if (message.length > 0) {
    return message;
  }
  return PREFIX;
}
function fromZodErrorWithoutRuntimeCheck(zodError, options = {}) {
  const zodIssues = zodError.errors;
  let message;
  if (isNonEmptyArray(zodIssues)) {
    const messageBuilder = createMessageBuilderFromOptions2(options);
    message = messageBuilder(zodIssues);
  } else {
    message = zodError.message;
  }
  return new ValidationError(message, { cause: zodError });
}
function createMessageBuilderFromOptions2(options) {
  if ("messageBuilder" in options) {
    return options.messageBuilder;
  }
  return createMessageBuilder(options);
}
var toValidationError = (options = {}) => (err) => {
  if (isZodErrorLike(err)) {
    return fromZodErrorWithoutRuntimeCheck(err, options);
  }
  if (err instanceof Error) {
    return new ValidationError(err.message, { cause: err });
  }
  return new ValidationError("Unknown error");
};
function fromError(err, options = {}) {
  return toValidationError(options)(err);
}

// build/plugin/symbia-imagine/services/integrations.mjs
var import_express2 = __toESM(require_express(), 1);
import { randomUUID as randomUUID2 } from "crypto";
import { createHmac, randomUUID } from "crypto";

// build/plugin/symbia-imagine/node_modules/ws/wrapper.mjs
var import_stream = __toESM(require_stream(), 1);
var import_extension = __toESM(require_extension(), 1);
var import_permessage_deflate = __toESM(require_permessage_deflate(), 1);
var import_receiver = __toESM(require_receiver(), 1);
var import_sender = __toESM(require_sender(), 1);
var import_subprotocol = __toESM(require_subprotocol(), 1);
var import_websocket = __toESM(require_websocket(), 1);
var import_websocket_server = __toESM(require_websocket_server(), 1);
var wrapper_default = import_websocket.default;

// build/plugin/symbia-imagine/services/integrations.mjs
import { spawn as spawn2 } from "child_process";
import crypto from "crypto";
import crypto2 from "crypto";
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var schema_exports = {};
__export(schema_exports, {
  capabilitiesResponseSchema: () => capabilitiesResponseSchema,
  channelAttachmentSchema: () => channelAttachmentSchema,
  channelCapabilitiesSchema: () => channelCapabilitiesSchema,
  channelChatSchema: () => channelChatSchema,
  channelConfigSchema: () => channelConfigSchema,
  channelConnectionModeSchema: () => channelConnectionModeSchema,
  channelConnectionStatusSchema: () => channelConnectionStatusSchema,
  channelConnections: () => channelConnections,
  channelFormattingSchema: () => channelFormattingSchema,
  channelInboundMessageSchema: () => channelInboundMessageSchema,
  channelMessageFormattingSchema: () => channelMessageFormattingSchema,
  channelOutboundMessageSchema: () => channelOutboundMessageSchema,
  channelSenderSchema: () => channelSenderSchema,
  channelStatusEventSchema: () => channelStatusEventSchema,
  channelTypeSchema: () => channelTypeSchema,
  credentialMetadataSchema: () => credentialMetadataSchema,
  executeParamsSchema: () => executeParamsSchema,
  executeRequestSchema: () => executeRequestSchema,
  executeResponseSchema: () => executeResponseSchema,
  executionLogs: () => executionLogs,
  finishReasonSchema: () => finishReasonSchema,
  integrationAuthSchema: () => integrationAuthSchema,
  integrationInvokeRequestSchema: () => integrationInvokeRequestSchema,
  integrationInvokeResponseSchema: () => integrationInvokeResponseSchema,
  integrationOperationSchema: () => integrationOperationSchema,
  integrationSchema: () => integrationSchema,
  integrations: () => integrations,
  mcpConfigSchema: () => mcpConfigSchema,
  modelCapabilitySchema: () => modelCapabilitySchema,
  modelConfigSchema: () => modelConfigSchema,
  normalizedEmbeddingResponseSchema: () => normalizedEmbeddingResponseSchema,
  normalizedLLMResponseSchema: () => normalizedLLMResponseSchema,
  oauthAuthorizeRequestSchema: () => oauthAuthorizeRequestSchema,
  oauthAuthorizeResponseSchema: () => oauthAuthorizeResponseSchema,
  oauthConnectionSchema: () => oauthConnectionSchema,
  oauthConnections: () => oauthConnections,
  oauthProviderConfigSchema: () => oauthProviderConfigSchema,
  oauthProviderConfigs: () => oauthProviderConfigs,
  oauthStates: () => oauthStates,
  oauthTokenResponseSchema: () => oauthTokenResponseSchema,
  oauthUserInfoSchema: () => oauthUserInfoSchema,
  openAPIConfigSchema: () => openAPIConfigSchema,
  operationParameterSchema: () => operationParameterSchema,
  operationSchema: () => operationSchema,
  parameterLocationSchema: () => parameterLocationSchema,
  providerCapabilitySchema: () => providerCapabilitySchema,
  providerConfigSchema: () => providerConfigSchema,
  providerSchema: () => providerSchema,
  proxyUsage: () => proxyUsage,
  proxyUsageSummarySchema: () => proxyUsageSummarySchema,
  rateLimitConfigSchema: () => rateLimitConfigSchema,
  toolCallSchema: () => toolCallSchema,
  usageSchema: () => usageSchema
});
var providerSchema;
var operationSchema;
var finishReasonSchema;
var usageSchema;
var toolCallSchema;
var normalizedLLMResponseSchema;
var normalizedEmbeddingResponseSchema;
var executeParamsSchema;
var executeRequestSchema;
var executeResponseSchema;
var providerConfigSchema;
var modelCapabilitySchema;
var modelConfigSchema;
var executionLogs;
var credentialMetadataSchema;
var integrationAuthSchema;
var parameterLocationSchema;
var operationParameterSchema;
var integrationOperationSchema;
var openAPIConfigSchema;
var mcpConfigSchema;
var rateLimitConfigSchema;
var integrationSchema;
var integrationInvokeRequestSchema;
var integrationInvokeResponseSchema;
var integrations;
var proxyUsage;
var proxyUsageSummarySchema;
var providerCapabilitySchema;
var capabilitiesResponseSchema;
var channelTypeSchema;
var channelConnectionModeSchema;
var channelConnectionStatusSchema;
var channelCapabilitiesSchema;
var channelFormattingSchema;
var channelConfigSchema;
var channelAttachmentSchema;
var channelSenderSchema;
var channelChatSchema;
var channelInboundMessageSchema;
var channelMessageFormattingSchema;
var channelOutboundMessageSchema;
var channelStatusEventSchema;
var channelConnections;
var oauthProviderConfigSchema;
var oauthTokenResponseSchema;
var oauthUserInfoSchema;
var oauthAuthorizeRequestSchema;
var oauthAuthorizeResponseSchema;
var oauthConnectionSchema;
var oauthProviderConfigs;
var oauthStates;
var oauthConnections;
var init_schema = __esm({
  "../integrations/shared/schema.ts"() {
    "use strict";
    providerSchema = external_exports.enum([
      "openai",
      "anthropic",
      "huggingface",
      "symbia-labs"
    ]);
    operationSchema = external_exports.enum([
      "chat.completions",
      "responses",
      // OpenAI Responses API (stateful)
      "messages",
      // Anthropic native
      "text.generation",
      // Vision. A distinct operation so a provider can reject a request that
      // carries no image, rather than returning a confident description of a
      // picture it never received — chat.completions cannot detect that, because
      // a text-only message is perfectly legal there.
      //
      // NOTE: this enum and each adapter's `supportedOperations` are two
      // independent lists of the same thing, and this one wins — it rejects the
      // request before any adapter is consulted. Measured 7 Aug 2026: adding
      // image.description to HuggingFaceProvider.supportedOperations had no
      // effect at all until it was added here as well. Anything added to one must
      // be added to the other.
      "image.description",
      "embeddings"
    ]);
    finishReasonSchema = external_exports.enum([
      "stop",
      "length",
      "content_filter",
      "tool_calls",
      "error",
      "incomplete"
      // OpenAI Responses API (request cut short)
    ]);
    usageSchema = external_exports.object({
      promptTokens: external_exports.number().int().min(0),
      completionTokens: external_exports.number().int().min(0),
      totalTokens: external_exports.number().int().min(0)
    });
    toolCallSchema = external_exports.object({
      id: external_exports.string(),
      type: external_exports.string(),
      function: external_exports.object({
        name: external_exports.string(),
        arguments: external_exports.string()
      })
    });
    normalizedLLMResponseSchema = external_exports.object({
      provider: external_exports.string(),
      model: external_exports.string(),
      content: external_exports.string(),
      usage: usageSchema,
      finishReason: finishReasonSchema,
      toolCalls: external_exports.array(toolCallSchema).optional(),
      metadata: external_exports.record(external_exports.unknown())
    });
    normalizedEmbeddingResponseSchema = external_exports.object({
      provider: external_exports.string(),
      model: external_exports.string(),
      embeddings: external_exports.array(external_exports.array(external_exports.number())),
      usage: external_exports.object({
        promptTokens: external_exports.number().int().min(0),
        totalTokens: external_exports.number().int().min(0)
      }),
      metadata: external_exports.record(external_exports.unknown())
    });
    executeParamsSchema = external_exports.object({
      model: external_exports.string(),
      // Input
      messages: external_exports.array(external_exports.object({
        role: external_exports.enum(["system", "user", "assistant", "tool"]),
        content: external_exports.union([external_exports.string(), external_exports.array(external_exports.unknown())]),
        name: external_exports.string().optional(),
        tool_call_id: external_exports.string().optional(),
        tool_calls: external_exports.array(external_exports.unknown()).optional()
      })).optional(),
      prompt: external_exports.string().optional(),
      input: external_exports.union([external_exports.string(), external_exports.array(external_exports.string()), external_exports.array(external_exports.number())]).optional(),
      text: external_exports.string().optional(),
      // Generation config
      temperature: external_exports.number().min(0).max(2).optional(),
      maxTokens: external_exports.number().int().positive().optional(),
      topP: external_exports.number().min(0).max(1).optional(),
      topK: external_exports.number().int().positive().optional(),
      stopSequences: external_exports.array(external_exports.string()).optional(),
      stop: external_exports.union([external_exports.string(), external_exports.array(external_exports.string())]).optional(),
      seed: external_exports.number().int().optional(),
      frequencyPenalty: external_exports.number().optional(),
      presencePenalty: external_exports.number().optional(),
      // System prompt (multiple aliases for cross-provider compat)
      system: external_exports.string().optional(),
      systemPrompt: external_exports.string().optional(),
      instructions: external_exports.string().optional(),
      // Tool use
      tools: external_exports.array(external_exports.unknown()).optional(),
      toolChoice: external_exports.unknown().optional(),
      // Response format
      responseFormat: external_exports.string().optional(),
      jsonSchema: external_exports.unknown().optional(),
      // OpenAI Responses API specific
      previousResponseId: external_exports.string().optional(),
      reasoningEffort: external_exports.enum(["none", "low", "medium", "high", "xhigh"]).optional(),
      showReasoning: external_exports.boolean().optional(),
      enablePreambles: external_exports.boolean().optional(),
      compactMode: external_exports.boolean().optional(),
      parallelToolCalls: external_exports.boolean().optional()
    }).strict();
    executeRequestSchema = external_exports.object({
      provider: providerSchema,
      operation: operationSchema,
      params: executeParamsSchema,
      credentialId: external_exports.string().optional()
    });
    executeResponseSchema = external_exports.object({
      success: external_exports.boolean(),
      data: external_exports.union([normalizedLLMResponseSchema, normalizedEmbeddingResponseSchema]).optional(),
      error: external_exports.string().optional(),
      requestId: external_exports.string(),
      durationMs: external_exports.number()
    });
    providerConfigSchema = external_exports.object({
      provider: external_exports.string(),
      baseUrl: external_exports.string().url(),
      authType: external_exports.enum(["bearer", "header", "query"]),
      endpoints: external_exports.record(external_exports.string()),
      rateLimits: external_exports.object({
        requestsPerMinute: external_exports.number().int().positive(),
        tokensPerMinute: external_exports.number().int().positive()
      }).optional(),
      defaultModel: external_exports.string(),
      supportedOperations: external_exports.array(external_exports.string())
    });
    modelCapabilitySchema = external_exports.enum([
      "chat",
      "completion",
      "embedding",
      "vision",
      "function_calling",
      "reasoning"
    ]);
    modelConfigSchema = external_exports.object({
      // Core fields
      id: external_exports.string(),
      name: external_exports.string(),
      description: external_exports.string().optional(),
      // Context limits
      contextWindow: external_exports.number().int().positive().optional(),
      maxOutputTokens: external_exports.number().int().positive().optional(),
      // Capabilities
      capabilities: external_exports.array(modelCapabilitySchema).default(["chat"]),
      // Pricing (per 1M tokens)
      inputPricing: external_exports.number().optional(),
      outputPricing: external_exports.number().optional(),
      // Status
      deprecated: external_exports.boolean().optional(),
      // Legacy field aliases for backwards compatibility
      provider: external_exports.string().optional(),
      modelId: external_exports.string().optional(),
      displayName: external_exports.string().optional(),
      inputPricePerMillion: external_exports.number().optional(),
      outputPricePerMillion: external_exports.number().optional(),
      supportedOperations: external_exports.array(external_exports.string()).optional()
    });
    executionLogs = pgTable("integration_execution_logs", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull(),
      orgId: varchar("org_id"),
      provider: text("provider").notNull(),
      operation: text("operation").notNull(),
      model: text("model"),
      requestId: varchar("request_id").notNull(),
      // Timing
      startedAt: timestamp("started_at").notNull(),
      completedAt: timestamp("completed_at"),
      durationMs: integer("duration_ms"),
      // Result
      success: boolean("success").notNull(),
      errorMessage: text("error_message"),
      // Usage
      promptTokens: integer("prompt_tokens"),
      completionTokens: integer("completion_tokens"),
      totalTokens: integer("total_tokens"),
      estimatedCostCents: integer("estimated_cost_cents"),
      // MICROS, BECAUSE CENTS ARE TOO COARSE TO BILL A TOKEN.
      //
      // estimated_cost_cents is an integer column. A 32-token claude-sonnet-5 call
      // costs about 0.02 cents, which stores as 0 — and a month of them stores as
      // free. proxy_usage already meters in micros; this makes the two paths agree
      // on units instead of converting between them at read time and hoping the
      // 10,000x factor is applied in both directions.
      estimatedCostMicros: integer("estimated_cost_micros"),
      // Metadata
      metadata: json("metadata").$type().default({}),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      userIdx: index("idx_execution_logs_user_id").on(table.userId),
      orgIdx: index("idx_execution_logs_org_id").on(table.orgId),
      providerIdx: index("idx_execution_logs_provider").on(table.provider),
      createdIdx: index("idx_execution_logs_created").on(table.createdAt)
    }));
    credentialMetadataSchema = external_exports.object({
      id: external_exports.string(),
      provider: external_exports.string(),
      name: external_exports.string(),
      createdAt: external_exports.string(),
      lastUsedAt: external_exports.string().nullable()
    });
    integrationAuthSchema = external_exports.discriminatedUnion("type", [
      external_exports.object({
        type: external_exports.literal("bearer"),
        credentialKey: external_exports.string()
        // Reference to stored credential
      }),
      external_exports.object({
        type: external_exports.literal("apiKey"),
        header: external_exports.string().default("X-API-Key"),
        credentialKey: external_exports.string()
      }),
      external_exports.object({
        type: external_exports.literal("basic"),
        credentialKey: external_exports.string()
        // Stored as base64(username:password)
      }),
      external_exports.object({
        type: external_exports.literal("oauth2"),
        tokenUrl: external_exports.string().url(),
        scopes: external_exports.array(external_exports.string()).optional(),
        credentialKey: external_exports.string()
        // client_id:client_secret
      }),
      external_exports.object({
        type: external_exports.literal("none")
      })
    ]);
    parameterLocationSchema = external_exports.enum(["path", "query", "header", "cookie", "body"]);
    operationParameterSchema = external_exports.object({
      name: external_exports.string(),
      location: parameterLocationSchema,
      required: external_exports.boolean().default(false),
      description: external_exports.string().optional(),
      schema: external_exports.record(external_exports.unknown()).optional(),
      // JSON Schema
      example: external_exports.unknown().optional()
    });
    integrationOperationSchema = external_exports.object({
      // Identity
      id: external_exports.string(),
      // e.g., "chat.completions.create"
      operationId: external_exports.string().optional(),
      // Original OpenAPI operationId
      // HTTP details (for OpenAPI)
      method: external_exports.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]).optional(),
      path: external_exports.string().optional(),
      // e.g., "/v1/chat/completions"
      // Metadata
      summary: external_exports.string().optional(),
      description: external_exports.string().optional(),
      tags: external_exports.array(external_exports.string()).optional(),
      deprecated: external_exports.boolean().optional(),
      // Parameters
      parameters: external_exports.array(operationParameterSchema).optional(),
      requestBody: external_exports.object({
        required: external_exports.boolean().optional(),
        contentType: external_exports.string().default("application/json"),
        schema: external_exports.record(external_exports.unknown()).optional()
        // JSON Schema
      }).optional(),
      // Response
      responseSchema: external_exports.record(external_exports.unknown()).optional(),
      // MCP-specific
      mcpTool: external_exports.object({
        name: external_exports.string(),
        inputSchema: external_exports.record(external_exports.unknown())
      }).optional()
    });
    openAPIConfigSchema = external_exports.object({
      specUrl: external_exports.string().url().optional(),
      // URL to fetch spec from
      spec: external_exports.record(external_exports.unknown()).optional(),
      // Or inline spec object
      version: external_exports.string().optional(),
      // Spec version detected
      serverUrl: external_exports.string().url().optional()
      // Override base URL
    });
    mcpConfigSchema = external_exports.object({
      transport: external_exports.enum(["stdio", "http", "websocket"]),
      // For stdio transport
      command: external_exports.string().optional(),
      args: external_exports.array(external_exports.string()).optional(),
      env: external_exports.record(external_exports.string()).optional(),
      // For http/websocket transport
      serverUrl: external_exports.string().url().optional(),
      // Discovered capabilities
      capabilities: external_exports.object({
        tools: external_exports.boolean().optional(),
        resources: external_exports.boolean().optional(),
        prompts: external_exports.boolean().optional()
      }).optional()
    });
    rateLimitConfigSchema = external_exports.object({
      requestsPerMinute: external_exports.number().int().positive().optional(),
      requestsPerSecond: external_exports.number().int().positive().optional(),
      tokensPerMinute: external_exports.number().int().positive().optional(),
      concurrentRequests: external_exports.number().int().positive().optional()
    });
    integrationSchema = external_exports.object({
      // Identity (from CatalogResource)
      id: external_exports.string(),
      key: external_exports.string(),
      // e.g., "openai", "stripe", "my-mcp-server"
      name: external_exports.string(),
      description: external_exports.string().optional(),
      // Type determines how operations are discovered
      type: external_exports.enum(["openapi", "mcp", "builtin", "custom"]),
      // Configuration based on type
      openapi: openAPIConfigSchema.optional(),
      mcp: mcpConfigSchema.optional(),
      // Authentication
      auth: integrationAuthSchema.optional(),
      // Rate limiting
      rateLimit: rateLimitConfigSchema.optional(),
      // Retry configuration
      retry: external_exports.object({
        maxRetries: external_exports.number().int().min(0).max(10).default(3),
        backoffMs: external_exports.number().int().positive().default(1e3),
        backoffMultiplier: external_exports.number().positive().default(2)
      }).optional(),
      // Discovered operations (populated after spec is parsed)
      operations: external_exports.array(integrationOperationSchema).optional(),
      // Operation namespace tree (for quick lookup)
      // e.g., { "chat": { "completions": { "create": operationRef } } }
      namespace: external_exports.record(external_exports.unknown()).optional(),
      // Status
      status: external_exports.enum(["pending", "active", "error", "disabled"]).default("pending"),
      lastSyncedAt: external_exports.string().datetime().optional(),
      syncError: external_exports.string().optional(),
      // Metadata
      version: external_exports.number().int().positive().default(1),
      tags: external_exports.array(external_exports.string()).optional(),
      metadata: external_exports.record(external_exports.unknown()).optional()
    });
    integrationInvokeRequestSchema = external_exports.object({
      // Target operation (dot-notation path)
      operation: external_exports.string(),
      // e.g., "integrations.openai.chat.completions.create"
      // Path and query parameters. Keys matching a `{token}` in the operation's
      // path, or a declared query parameter, are substituted into the URL.
      // Anything left over becomes the request body when `body` is not set and
      // the method takes one; on a body-less method it is reported back as
      // `ignoredParams` rather than discarded. Before 22 Aug leftovers were
      // dropped in silence, which turned a supplied image into a camera photo.
      params: external_exports.record(external_exports.unknown()).optional(),
      // The request body, sent as-is. Setting this AND leaving body-shaped keys
      // in `params` is refused: two sources for one body is a caller error.
      body: external_exports.unknown().optional(),
      headers: external_exports.record(external_exports.string()).optional(),
      // Options
      timeout: external_exports.number().int().positive().optional(),
      retries: external_exports.number().int().min(0).optional()
    });
    integrationInvokeResponseSchema = external_exports.object({
      success: external_exports.boolean(),
      data: external_exports.unknown().optional(),
      error: external_exports.string().optional(),
      // Execution metadata
      requestId: external_exports.string(),
      durationMs: external_exports.number(),
      operation: external_exports.string(),
      integration: external_exports.string(),
      // HTTP details (for OpenAPI)
      statusCode: external_exports.number().int().optional(),
      headers: external_exports.record(external_exports.string()).optional()
    });
    integrations = pgTable("integrations", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      key: varchar("key", { length: 255 }).notNull().unique(),
      orgId: varchar("org_id").notNull(),
      name: varchar("name", { length: 255 }).notNull(),
      description: text("description"),
      type: varchar("type", { length: 50 }).notNull(),
      // 'openapi' | 'mcp' | 'builtin' | 'custom'
      // Configuration (stored as JSON)
      config: json("config").$type().default({}),
      // Discovered operations (cached after spec parse)
      operations: json("operations").$type().default([]),
      namespace: json("namespace").$type().default({}),
      // Status
      status: varchar("status", { length: 50 }).default("pending").notNull(),
      lastSyncedAt: timestamp("last_synced_at"),
      syncError: text("sync_error"),
      // Metadata
      version: integer("version").default(1).notNull(),
      tags: json("tags").$type().default([]),
      metadata: json("metadata").$type().default({}),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      keyIdx: index("idx_integrations_key").on(table.key),
      orgIdx: index("idx_integrations_org_id").on(table.orgId),
      typeIdx: index("idx_integrations_type").on(table.type),
      statusIdx: index("idx_integrations_status").on(table.status)
    }));
    proxyUsage = pgTable("proxy_usage", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      // Who used it
      userId: varchar("user_id").notNull(),
      orgId: varchar("org_id").notNull(),
      // What was used
      integrationKey: varchar("integration_key", { length: 255 }).notNull(),
      operation: varchar("operation", { length: 500 }).notNull(),
      // Credential that was used (reference to userCredentials.id)
      credentialId: varchar("credential_id").notNull(),
      // Request details
      requestId: varchar("request_id", { length: 100 }),
      success: boolean("success").notNull().default(true),
      statusCode: integer("status_code"),
      errorMessage: text("error_message"),
      durationMs: integer("duration_ms"),
      // Token usage (for LLM operations)
      inputTokens: integer("input_tokens"),
      outputTokens: integer("output_tokens"),
      totalTokens: integer("total_tokens"),
      // Cost tracking (in microdollars for precision)
      estimatedCostMicros: integer("estimated_cost_micros"),
      // Metadata
      metadata: json("metadata").$type().default({}),
      timestamp: timestamp("timestamp").defaultNow().notNull()
    }, (table) => ({
      userIdx: index("idx_proxy_usage_user_id").on(table.userId),
      orgIdx: index("idx_proxy_usage_org_id").on(table.orgId),
      integrationIdx: index("idx_proxy_usage_integration").on(table.integrationKey),
      timestampIdx: index("idx_proxy_usage_timestamp").on(table.timestamp),
      orgTimestampIdx: index("idx_proxy_usage_org_timestamp").on(table.orgId, table.timestamp),
      credentialIdx: index("idx_proxy_usage_credential").on(table.credentialId)
    }));
    proxyUsageSummarySchema = external_exports.object({
      userId: external_exports.string(),
      orgId: external_exports.string(),
      integrationKey: external_exports.string(),
      // Time period
      periodStart: external_exports.string().datetime(),
      periodEnd: external_exports.string().datetime(),
      // Aggregated stats
      requestCount: external_exports.number().int(),
      successCount: external_exports.number().int(),
      errorCount: external_exports.number().int(),
      totalTokens: external_exports.number().int(),
      totalCostMicros: external_exports.number().int(),
      avgDurationMs: external_exports.number()
    });
    providerCapabilitySchema = external_exports.object({
      // Provider identity
      provider: external_exports.string(),
      name: external_exports.string(),
      description: external_exports.string().optional(),
      // API configuration
      baseUrl: external_exports.string().url(),
      defaultModel: external_exports.string(),
      // Supported operations
      supportedOperations: external_exports.array(external_exports.string()),
      // Models available for this provider
      models: external_exports.array(modelConfigSchema),
      // User's access status for this provider
      access: external_exports.object({
        hasCredential: external_exports.boolean(),
        credentialSource: external_exports.enum(["personal", "org-wide", "none"]),
        isEnabled: external_exports.boolean(),
        lastUsedAt: external_exports.string().datetime().nullable().optional()
      }),
      // Rate limits (if configured)
      rateLimits: external_exports.object({
        requestsPerMinute: external_exports.number().int().optional(),
        tokensPerMinute: external_exports.number().int().optional()
      }).optional(),
      // Status
      status: external_exports.enum(["available", "unavailable", "degraded", "disabled"]).default("available"),
      statusMessage: external_exports.string().optional()
    });
    capabilitiesResponseSchema = external_exports.object({
      // All providers with their capabilities
      providers: external_exports.array(providerCapabilitySchema),
      // Quick lookup maps
      byProvider: external_exports.record(providerCapabilitySchema),
      // Models grouped by purpose (for UI dropdowns)
      modelsByPurpose: external_exports.object({
        chat: external_exports.array(external_exports.object({
          provider: external_exports.string(),
          model: modelConfigSchema
        })),
        embedding: external_exports.array(external_exports.object({
          provider: external_exports.string(),
          model: modelConfigSchema
        })),
        vision: external_exports.array(external_exports.object({
          provider: external_exports.string(),
          model: modelConfigSchema
        })),
        reasoning: external_exports.array(external_exports.object({
          provider: external_exports.string(),
          model: modelConfigSchema
        }))
      }),
      // User's default provider preferences (if configured)
      defaults: external_exports.object({
        chatProvider: external_exports.string().optional(),
        chatModel: external_exports.string().optional(),
        embeddingProvider: external_exports.string().optional(),
        embeddingModel: external_exports.string().optional()
      }).optional(),
      // Timestamp for cache invalidation
      fetchedAt: external_exports.string().datetime()
    });
    channelTypeSchema = external_exports.enum([
      "telegram",
      "twitch"
    ]);
    channelConnectionModeSchema = external_exports.enum([
      "webhook",
      // Platform sends events to our webhook URL
      "websocket"
      // We hold a socket open to the platform (Twitch EventSub).
      // Added because a stack on localhost has no public callback URL
      // for a platform to POST to, so "webhook" was not a choice this
      // deployment could make.
    ]);
    channelConnectionStatusSchema = external_exports.enum([
      "pending",
      // Connection initiated but not yet established
      "connecting",
      // Connection in progress (e.g., waiting for QR scan)
      "connected",
      // Connection active and working
      "disconnected",
      // Connection terminated (graceful or timeout)
      "error"
      // Connection failed with error
    ]);
    channelCapabilitiesSchema = external_exports.object({
      directMessages: external_exports.boolean().default(true),
      groupChats: external_exports.boolean().default(false),
      threads: external_exports.boolean().default(false),
      reactions: external_exports.boolean().default(false),
      fileAttachments: external_exports.boolean().default(false),
      voiceMessages: external_exports.boolean().default(false),
      edits: external_exports.boolean().default(false),
      deletions: external_exports.boolean().default(false),
      typing: external_exports.boolean().default(false),
      readReceipts: external_exports.boolean().default(false)
    });
    channelFormattingSchema = external_exports.object({
      maxLength: external_exports.number().int().positive().optional(),
      supportsMarkdown: external_exports.boolean().default(false),
      supportsHtml: external_exports.boolean().default(false),
      supportsMentions: external_exports.boolean().default(false),
      supportsEmoji: external_exports.boolean().default(true)
    });
    channelConfigSchema = external_exports.object({
      channelType: channelTypeSchema.optional(),
      connectionMode: channelConnectionModeSchema.optional(),
      capabilities: channelCapabilitiesSchema.optional(),
      formatting: channelFormattingSchema.optional(),
      webhookBaseUrl: external_exports.string().url().optional(),
      webhookSecret: external_exports.string().optional(),
      dropPendingUpdates: external_exports.boolean().optional(),
      allowedUpdateTypes: external_exports.array(external_exports.string()).optional(),
      metadata: external_exports.record(external_exports.unknown()).optional()
    });
    channelAttachmentSchema = external_exports.object({
      type: external_exports.string(),
      // "image", "audio", "video", "file", "location"
      url: external_exports.string().url().optional(),
      mimeType: external_exports.string().optional(),
      filename: external_exports.string().optional(),
      size: external_exports.number().int().optional(),
      data: external_exports.string().optional()
      // base64 for inline data
    });
    channelSenderSchema = external_exports.object({
      id: external_exports.string(),
      name: external_exports.string().optional(),
      username: external_exports.string().optional(),
      isBot: external_exports.boolean().optional()
    });
    channelChatSchema = external_exports.object({
      id: external_exports.string(),
      type: external_exports.enum(["private", "group", "channel", "thread"]),
      name: external_exports.string().optional()
    });
    channelInboundMessageSchema = external_exports.object({
      id: external_exports.string(),
      channelType: channelTypeSchema,
      connectionId: external_exports.string(),
      contentType: external_exports.string().default("text"),
      text: external_exports.string().optional(),
      attachments: external_exports.array(channelAttachmentSchema).optional(),
      sender: channelSenderSchema,
      chat: channelChatSchema,
      replyToMessageId: external_exports.string().optional(),
      timestamp: external_exports.string().datetime(),
      editedAt: external_exports.string().datetime().optional(),
      raw: external_exports.record(external_exports.unknown()).optional()
    });
    channelMessageFormattingSchema = external_exports.object({
      parseMode: external_exports.enum(["plain", "markdown", "html"]).optional(),
      disablePreview: external_exports.boolean().optional(),
      silent: external_exports.boolean().optional()
    });
    channelOutboundMessageSchema = external_exports.object({
      channelType: channelTypeSchema,
      connectionId: external_exports.string(),
      chatId: external_exports.string(),
      contentType: external_exports.string().default("text"),
      text: external_exports.string().optional(),
      attachments: external_exports.array(channelAttachmentSchema).optional(),
      replyToMessageId: external_exports.string().optional(),
      formatting: channelMessageFormattingSchema.optional(),
      conversationId: external_exports.string().optional(),
      assistantId: external_exports.string().optional(),
      requestId: external_exports.string().optional()
    });
    channelStatusEventSchema = external_exports.object({
      connectionId: external_exports.string(),
      channelType: channelTypeSchema,
      previousStatus: channelConnectionStatusSchema,
      newStatus: channelConnectionStatusSchema,
      reason: external_exports.string().optional(),
      error: external_exports.string().optional(),
      timestamp: external_exports.string().datetime()
    });
    channelConnections = pgTable("channel_connections", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      integrationId: varchar("integration_id"),
      userId: varchar("user_id").notNull(),
      orgId: varchar("org_id"),
      // Channel info
      channelType: varchar("channel_type", { length: 50 }).notNull(),
      channelAccountId: varchar("channel_account_id"),
      channelAccountName: varchar("channel_account_name"),
      // Auth
      credentialId: varchar("credential_id"),
      // Status
      status: varchar("status", { length: 50 }).default("pending").notNull(),
      // Session data (for reconnection)
      sessionData: json("session_data").$type().default({}),
      // QR-link mode
      qrCode: text("qr_code"),
      qrExpiresAt: timestamp("qr_expires_at"),
      // Webhook mode
      webhookUrl: text("webhook_url"),
      webhookSecret: text("webhook_secret"),
      webhookVerified: boolean("webhook_verified").default(false),
      // Health tracking
      lastPingAt: timestamp("last_ping_at"),
      lastMessageAt: timestamp("last_message_at"),
      lastError: text("last_error"),
      errorCount: integer("error_count").default(0),
      consecutiveErrors: integer("consecutive_errors").default(0),
      // Stats
      messagesReceived: integer("messages_received").default(0),
      messagesSent: integer("messages_sent").default(0),
      // Timestamps
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull(),
      connectedAt: timestamp("connected_at"),
      disconnectedAt: timestamp("disconnected_at")
    }, (table) => ({
      userIdx: index("idx_channel_connections_user_id").on(table.userId),
      orgIdx: index("idx_channel_connections_org_id").on(table.orgId),
      typeIdx: index("idx_channel_connections_channel_type").on(table.channelType),
      statusIdx: index("idx_channel_connections_status").on(table.status)
    }));
    oauthProviderConfigSchema = external_exports.object({
      provider: external_exports.string().min(1),
      displayName: external_exports.string().min(1),
      description: external_exports.string().optional(),
      iconUrl: external_exports.string().url().optional(),
      // OAuth endpoints
      authorizationUrl: external_exports.string().url(),
      tokenUrl: external_exports.string().url(),
      userinfoUrl: external_exports.string().url().optional(),
      revokeUrl: external_exports.string().url().optional(),
      // OAuth settings
      defaultScopes: external_exports.array(external_exports.string()).default([]),
      scopeDelimiter: external_exports.string().default(" "),
      responseType: external_exports.enum(["code", "token"]).default("code"),
      grantType: external_exports.enum(["authorization_code", "client_credentials"]).default("authorization_code"),
      pkceRequired: external_exports.boolean().default(false),
      // Token handling
      supportsRefresh: external_exports.boolean().default(true),
      tokenExpiresIn: external_exports.number().int().positive().optional()
      // Default expiry if not in response
    });
    oauthTokenResponseSchema = external_exports.object({
      accessToken: external_exports.string(),
      refreshToken: external_exports.string().optional(),
      expiresIn: external_exports.number().int().positive().optional(),
      tokenType: external_exports.string().default("Bearer"),
      scope: external_exports.string().optional()
    });
    oauthUserInfoSchema = external_exports.object({
      id: external_exports.string(),
      email: external_exports.string().email().optional(),
      name: external_exports.string().optional(),
      username: external_exports.string().optional(),
      avatarUrl: external_exports.string().url().optional()
    });
    oauthAuthorizeRequestSchema = external_exports.object({
      provider: external_exports.string().min(1),
      redirectUri: external_exports.string().url().optional(),
      // Where to redirect after OAuth completes
      scopes: external_exports.array(external_exports.string()).optional(),
      // Override default scopes
      state: external_exports.string().optional()
      // Client-provided state for additional context
    });
    oauthAuthorizeResponseSchema = external_exports.object({
      authorizationUrl: external_exports.string().url(),
      state: external_exports.string(),
      provider: external_exports.string()
    });
    oauthConnectionSchema = external_exports.object({
      id: external_exports.string(),
      provider: external_exports.string(),
      displayName: external_exports.string(),
      connectedAt: external_exports.string().datetime(),
      expiresAt: external_exports.string().datetime().optional(),
      scopes: external_exports.array(external_exports.string()),
      status: external_exports.enum(["active", "expired", "revoked"]),
      oauthUserId: external_exports.string().optional(),
      oauthUserEmail: external_exports.string().email().optional(),
      oauthUserName: external_exports.string().optional()
    });
    oauthProviderConfigs = pgTable("oauth_provider_configs", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      provider: varchar("provider", { length: 100 }).notNull().unique(),
      // OAuth endpoints
      authorizationUrl: text("authorization_url").notNull(),
      tokenUrl: text("token_url").notNull(),
      userinfoUrl: text("userinfo_url"),
      revokeUrl: text("revoke_url"),
      // Client credentials (encrypted)
      clientId: text("client_id").notNull(),
      clientSecretEncrypted: text("client_secret_encrypted").notNull(),
      // Display
      displayName: varchar("display_name", { length: 255 }).notNull(),
      description: text("description"),
      iconUrl: text("icon_url"),
      // Settings
      defaultScopes: json("default_scopes").$type().default([]),
      scopeDelimiter: varchar("scope_delimiter", { length: 10 }).default(" "),
      responseType: varchar("response_type", { length: 50 }).default("code"),
      grantType: varchar("grant_type", { length: 50 }).default("authorization_code"),
      pkceRequired: boolean("pkce_required").default(false),
      supportsRefresh: boolean("supports_refresh").default(true),
      // Status
      isEnabled: boolean("is_enabled").default(true).notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      providerIdx: index("idx_oauth_provider_configs_provider").on(table.provider),
      enabledIdx: index("idx_oauth_provider_configs_enabled").on(table.isEnabled)
    }));
    oauthStates = pgTable("oauth_states", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      state: varchar("state", { length: 255 }).notNull().unique(),
      // Who initiated the flow
      userId: varchar("user_id").notNull(),
      orgId: varchar("org_id"),
      // OAuth flow details
      provider: varchar("provider", { length: 100 }).notNull(),
      redirectUri: text("redirect_uri").notNull(),
      scopes: json("scopes").$type().default([]),
      // PKCE support
      pkceVerifier: text("pkce_verifier"),
      pkceChallenge: text("pkce_challenge"),
      // Client state (passed through from authorize request)
      clientState: text("client_state"),
      // Expiration (short-lived - 10 minutes)
      expiresAt: timestamp("expires_at").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    }, (table) => ({
      stateIdx: index("idx_oauth_states_state").on(table.state),
      expiresIdx: index("idx_oauth_states_expires").on(table.expiresAt),
      userIdx: index("idx_oauth_states_user").on(table.userId)
    }));
    oauthConnections = pgTable("oauth_connections", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      // Who owns this connection
      userId: varchar("user_id").notNull(),
      orgId: varchar("org_id"),
      // Provider info
      provider: varchar("provider", { length: 100 }).notNull(),
      // OAuth user info from provider
      oauthUserId: varchar("oauth_user_id", { length: 255 }),
      oauthUserEmail: text("oauth_user_email"),
      oauthUserName: text("oauth_user_name"),
      oauthAvatarUrl: text("oauth_avatar_url"),
      // Token info (reference to Identity credential)
      credentialId: varchar("credential_id"),
      // Reference to userCredentials in Identity
      // Scopes granted
      scopes: json("scopes").$type().default([]),
      // Status
      status: varchar("status", { length: 50 }).default("active").notNull(),
      // active, expired, revoked
      expiresAt: timestamp("expires_at"),
      // Timestamps
      connectedAt: timestamp("connected_at").defaultNow().notNull(),
      lastUsedAt: timestamp("last_used_at"),
      revokedAt: timestamp("revoked_at"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    }, (table) => ({
      userIdx: index("idx_oauth_connections_user").on(table.userId),
      orgIdx: index("idx_oauth_connections_org").on(table.orgId),
      providerIdx: index("idx_oauth_connections_provider").on(table.provider),
      userProviderIdx: index("idx_oauth_connections_user_provider").on(table.userId, table.provider),
      statusIdx: index("idx_oauth_connections_status").on(table.status)
    }));
  }
});
var intentClassificationCases;
var hybridRoutingCases;
var routingBenchmarks;
var init_routing_benchmarks = __esm({
  "../integrations/server/src/model-eval/benchmarks/suites/routing-benchmarks.ts"() {
    "use strict";
    intentClassificationCases = [
      // Coding intents
      {
        id: "routing.intent.code-review",
        name: "Code review request",
        input: {
          messages: [
            { role: "user", content: "Can you review this Python function for bugs?" }
          ]
        },
        expected: {
          contains: ["code"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["code", "high-frequency"]
      },
      {
        id: "routing.intent.code-generation",
        name: "Code generation request",
        input: {
          messages: [
            { role: "user", content: "Write a function that calculates fibonacci numbers" }
          ]
        },
        expected: {
          contains: ["code"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["code", "high-frequency"]
      },
      {
        id: "routing.intent.debug",
        name: "Debug request",
        input: {
          messages: [
            { role: "user", content: "I'm getting a NullPointerException in my Java app" }
          ]
        },
        expected: {
          contains: ["code", "debug"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["code", "debugging"]
      },
      // Research intents
      {
        id: "routing.intent.web-search",
        name: "Web search request",
        input: {
          messages: [
            { role: "user", content: "What are the latest developments in quantum computing?" }
          ]
        },
        expected: {
          contains: ["research", "search"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["research", "high-frequency"]
      },
      {
        id: "routing.intent.fact-check",
        name: "Fact checking request",
        input: {
          messages: [
            { role: "user", content: "Is it true that the Great Wall of China is visible from space?" }
          ]
        },
        expected: {
          contains: ["research", "fact"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["research", "reasoning"]
      },
      // Conversational intents
      {
        id: "routing.intent.greeting",
        name: "Simple greeting",
        input: {
          messages: [
            { role: "user", content: "Hello, how are you doing today?" }
          ]
        },
        expected: {
          contains: ["conversational", "general"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["conversational", "high-frequency"]
      },
      {
        id: "routing.intent.clarification",
        name: "Clarification question",
        input: {
          messages: [
            { role: "user", content: "Can you explain what you meant by that?" }
          ]
        },
        expected: {
          contains: ["conversational", "clarify"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["conversational"]
      },
      // Task intents
      {
        id: "routing.intent.summarize",
        name: "Summarization request",
        input: {
          messages: [
            { role: "user", content: "Summarize this article about climate change for me" }
          ]
        },
        expected: {
          contains: ["task", "summarize"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["task", "high-frequency"]
      },
      {
        id: "routing.intent.translate",
        name: "Translation request",
        input: {
          messages: [
            { role: "user", content: "Translate this text to Spanish" }
          ]
        },
        expected: {
          contains: ["task", "translate"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["task"]
      },
      // Ambiguous intents (harder cases)
      {
        id: "routing.intent.ambiguous-code-question",
        name: "Ambiguous code vs. research",
        description: "Could be asking about code or for research about Python",
        input: {
          messages: [
            { role: "user", content: "Tell me about Python" }
          ]
        },
        expected: {
          contains: ["clarify"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["ambiguous", "edge-case"]
      },
      {
        id: "routing.intent.multi-intent",
        name: "Multiple intents in one request",
        input: {
          messages: [
            { role: "user", content: "Search for React best practices and then write me a component" }
          ]
        },
        expected: {
          contains: ["research", "code"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["multi-intent", "edge-case"]
      }
    ];
    hybridRoutingCases = [
      {
        id: "routing.hybrid.embedding-vs-llm",
        name: "Embedding fallback decision",
        description: "Test when to use embeddings vs. LLM for routing",
        input: {
          messages: [
            {
              role: "system",
              content: `You are a routing classifier. Given the user query, decide the routing method.
Output JSON: { "method": "embedding" | "llm", "confidence": 0-1, "reason": string }

Rules:
- Use "embedding" for clear, simple intents that match known patterns
- Use "llm" for ambiguous, complex, or multi-part requests`
            },
            { role: "user", content: "Write a Python function to sort a list" }
          ]
        },
        expected: {
          schema: {
            type: "object",
            properties: {
              method: { type: "string", enum: ["embedding", "llm"] },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              reason: { type: "string" }
            },
            required: ["method", "confidence"]
          }
        },
        evaluator: "json_schema",
        weight: 1,
        tags: ["hybrid", "routing-decision"]
      },
      {
        id: "routing.hybrid.complex-query",
        name: "Complex query requires LLM routing",
        input: {
          messages: [
            {
              role: "system",
              content: `You are a routing classifier. Given the user query, decide the routing method.
Output JSON: { "method": "embedding" | "llm", "confidence": 0-1, "reason": string }`
            },
            {
              role: "user",
              content: "I need help with my React app - it crashes when I search for users, but I also want to understand if this is a common problem with async state updates"
            }
          ]
        },
        expected: {
          contains: ["llm"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["hybrid", "complex"]
      }
    ];
    routingBenchmarks = [
      {
        id: "routing.intent-classification",
        name: "Intent Classification",
        description: "Tests the model's ability to classify user intents for routing to appropriate handlers",
        version: "1.0.0",
        taskType: "routing",
        category: "intent-classification",
        testCases: intentClassificationCases,
        config: {
          maxTokens: 100,
          temperature: 0,
          timeout: 1e4
        }
      },
      {
        id: "routing.hybrid-decision",
        name: "Hybrid Routing Decisions",
        description: "Tests decisions between embedding-based and LLM-based routing",
        version: "1.0.0",
        taskType: "routing",
        category: "hybrid-routing",
        testCases: hybridRoutingCases,
        config: {
          maxTokens: 200,
          temperature: 0,
          timeout: 15e3
        }
      }
    ];
  }
});
var securityDetectionCases;
var performanceSuggestionCases;
var codeReviewBenchmarks;
var init_code_review_benchmarks = __esm({
  "../integrations/server/src/model-eval/benchmarks/suites/code-review-benchmarks.ts"() {
    "use strict";
    securityDetectionCases = [
      // SQL Injection
      {
        id: "code.security.sql-injection-basic",
        name: "Basic SQL injection detection",
        input: {
          messages: [
            {
              role: "system",
              content: 'You are a code security reviewer. Analyze the code for security vulnerabilities. Output JSON: { "vulnerabilities": [{ "type": string, "severity": "low"|"medium"|"high"|"critical", "line": number, "description": string }] }'
            },
            {
              role: "user",
              content: `Review this code:
\`\`\`python
def get_user(username):
    query = f"SELECT * FROM users WHERE username = '{username}'"
    return db.execute(query)
\`\`\``
            }
          ]
        },
        expected: {
          contains: ["sql", "injection"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["security", "sql-injection", "high-priority"]
      },
      {
        id: "code.security.sql-injection-subtle",
        name: "Subtle SQL injection via concatenation",
        input: {
          messages: [
            {
              role: "system",
              content: "You are a code security reviewer. Analyze the code for security vulnerabilities."
            },
            {
              role: "user",
              content: `Review this code:
\`\`\`javascript
const searchProducts = (category, minPrice) => {
  let query = "SELECT * FROM products WHERE 1=1";
  if (category) query += " AND category = '" + category + "'";
  if (minPrice) query += " AND price >= " + minPrice;
  return db.query(query);
};
\`\`\``
            }
          ]
        },
        expected: {
          contains: ["sql", "injection"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["security", "sql-injection", "subtle"]
      },
      // XSS
      {
        id: "code.security.xss-basic",
        name: "Basic XSS detection",
        input: {
          messages: [
            {
              role: "system",
              content: "You are a code security reviewer. Analyze the code for security vulnerabilities."
            },
            {
              role: "user",
              content: `Review this code:
\`\`\`javascript
function renderComment(comment) {
  document.getElementById('comments').innerHTML += '<div>' + comment.text + '</div>';
}
\`\`\``
            }
          ]
        },
        expected: {
          contains: ["xss", "cross-site"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["security", "xss", "high-priority"]
      },
      {
        id: "code.security.xss-react",
        name: "XSS via dangerouslySetInnerHTML",
        input: {
          messages: [
            {
              role: "system",
              content: "You are a code security reviewer. Identify security issues."
            },
            {
              role: "user",
              content: `Review this React component:
\`\`\`jsx
function UserBio({ bio }) {
  return (
    <div
      className="bio"
      dangerouslySetInnerHTML={{ __html: bio }}
    />
  );
}
\`\`\``
            }
          ]
        },
        expected: {
          contains: ["xss", "dangerous"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["security", "xss", "react"]
      },
      // Auth bypass
      {
        id: "code.security.auth-bypass",
        name: "Authentication bypass detection",
        input: {
          messages: [
            {
              role: "system",
              content: "You are a code security reviewer. Analyze the code for security vulnerabilities."
            },
            {
              role: "user",
              content: `Review this code:
\`\`\`javascript
app.get('/admin/users', (req, res) => {
  // Check if user is admin
  if (req.query.isAdmin === 'true') {
    return res.json(getAllUsers());
  }
  return res.status(403).json({ error: 'Forbidden' });
});
\`\`\``
            }
          ]
        },
        expected: {
          contains: ["auth", "bypass"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["security", "authentication", "critical"]
      },
      // Path traversal
      {
        id: "code.security.path-traversal",
        name: "Path traversal detection",
        input: {
          messages: [
            {
              role: "system",
              content: "You are a code security reviewer. Analyze the code for security vulnerabilities."
            },
            {
              role: "user",
              content: `Review this code:
\`\`\`python
@app.route('/files/<filename>')
def serve_file(filename):
    return send_from_directory('/uploads', filename)
\`\`\``
            }
          ]
        },
        expected: {
          contains: ["path", "traversal"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["security", "path-traversal"]
      },
      // Secure code (should not flag)
      {
        id: "code.security.secure-query",
        name: "Correctly identify secure parameterized query",
        input: {
          messages: [
            {
              role: "system",
              content: "You are a code security reviewer. Analyze the code for security vulnerabilities. If the code is secure, say so."
            },
            {
              role: "user",
              content: `Review this code:
\`\`\`python
def get_user(username):
    query = "SELECT * FROM users WHERE username = %s"
    return db.execute(query, (username,))
\`\`\``
            }
          ]
        },
        expected: {
          contains: ["secure", "parameterized"],
          notContains: ["vulnerability", "injection"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["security", "false-positive-check"]
      }
    ];
    performanceSuggestionCases = [
      // N+1 query
      {
        id: "code.performance.n-plus-one",
        name: "N+1 query detection",
        input: {
          messages: [
            {
              role: "system",
              content: "You are a code performance reviewer. Identify performance issues and suggest improvements."
            },
            {
              role: "user",
              content: `Review this code for performance:
\`\`\`python
def get_orders_with_items():
    orders = Order.objects.all()
    result = []
    for order in orders:
        items = OrderItem.objects.filter(order_id=order.id)
        result.append({'order': order, 'items': list(items)})
    return result
\`\`\``
            }
          ]
        },
        expected: {
          contains: ["n+1", "query"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["performance", "database", "n-plus-one"]
      },
      // Memory leak
      {
        id: "code.performance.memory-leak-listener",
        name: "Event listener memory leak",
        input: {
          messages: [
            {
              role: "system",
              content: "You are a code performance reviewer. Identify performance and memory issues."
            },
            {
              role: "user",
              content: `Review this React component:
\`\`\`jsx
function DataFetcher({ url }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    const handler = () => fetch(url).then(r => r.json()).then(setData);
    window.addEventListener('focus', handler);
    // Missing cleanup!
  }, [url]);

  return <div>{JSON.stringify(data)}</div>;
}
\`\`\``
            }
          ]
        },
        expected: {
          contains: ["memory", "leak", "cleanup"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["performance", "memory", "react"]
      },
      // Inefficient loop
      {
        id: "code.performance.inefficient-loop",
        name: "Inefficient array operation in loop",
        input: {
          messages: [
            {
              role: "system",
              content: "You are a code performance reviewer. Identify inefficiencies."
            },
            {
              role: "user",
              content: `Review this code:
\`\`\`javascript
function findDuplicates(arr) {
  const duplicates = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[i] === arr[j] && !duplicates.includes(arr[i])) {
        duplicates.push(arr[i]);
      }
    }
  }
  return duplicates;
}
\`\`\``
            }
          ]
        },
        expected: {
          contains: ["O(n", "set", "complexity"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["performance", "algorithm", "complexity"]
      },
      // Unoptimized re-render
      {
        id: "code.performance.unnecessary-rerender",
        name: "Unnecessary React re-renders",
        input: {
          messages: [
            {
              role: "system",
              content: "You are a React performance expert. Identify render inefficiencies."
            },
            {
              role: "user",
              content: `Review this component:
\`\`\`jsx
function UserList({ users }) {
  return (
    <ul>
      {users.map(user => (
        <UserCard
          key={user.id}
          user={user}
          onClick={() => console.log(user.id)}
          style={{ margin: 10 }}
        />
      ))}
    </ul>
  );
}
\`\`\``
            }
          ]
        },
        expected: {
          contains: ["re-render", "inline", "useCallback", "useMemo"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["performance", "react", "rendering"]
      }
    ];
    codeReviewBenchmarks = [
      {
        id: "code.security-detection",
        name: "Security Vulnerability Detection",
        description: "Tests the model's ability to detect common security vulnerabilities in code",
        version: "1.0.0",
        taskType: "code",
        category: "security",
        testCases: securityDetectionCases,
        config: {
          maxTokens: 500,
          temperature: 0,
          timeout: 2e4
        }
      },
      {
        id: "code.performance-suggestions",
        name: "Performance Issue Detection",
        description: "Tests the model's ability to identify performance problems and suggest improvements",
        version: "1.0.0",
        taskType: "code",
        category: "performance",
        testCases: performanceSuggestionCases,
        config: {
          maxTokens: 500,
          temperature: 0,
          timeout: 2e4
        }
      }
    ];
  }
});
var factCheckingCases;
var logicalReasoningCases;
var multiStepReasoningCases;
var reasoningBenchmarks;
var init_reasoning_benchmarks = __esm({
  "../integrations/server/src/model-eval/benchmarks/suites/reasoning-benchmarks.ts"() {
    "use strict";
    factCheckingCases = [
      // Clear true claims
      {
        id: "reasoning.fact.earth-sun",
        name: "Basic astronomical fact",
        input: {
          messages: [
            {
              role: "system",
              content: 'You are a fact-checker. Analyze the claim and respond with JSON: { "verdict": "true" | "false" | "partially_true" | "unverifiable", "confidence": 0-1, "explanation": string }'
            },
            {
              role: "user",
              content: "Claim: The Earth orbits the Sun."
            }
          ]
        },
        expected: {
          contains: ["true"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["fact-check", "easy"]
      },
      // Clear false claims
      {
        id: "reasoning.fact.great-wall-space",
        name: "Common misconception",
        input: {
          messages: [
            {
              role: "system",
              content: 'You are a fact-checker. Analyze the claim and respond with JSON: { "verdict": "true" | "false" | "partially_true" | "unverifiable", "confidence": 0-1, "explanation": string }'
            },
            {
              role: "user",
              content: "Claim: The Great Wall of China is visible from space with the naked eye."
            }
          ]
        },
        expected: {
          contains: ["false"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["fact-check", "misconception"]
      },
      // Nuanced claims
      {
        id: "reasoning.fact.goldfish-memory",
        name: "Partially true claim",
        input: {
          messages: [
            {
              role: "system",
              content: 'You are a fact-checker. Analyze the claim carefully. Respond with JSON: { "verdict": "true" | "false" | "partially_true" | "unverifiable", "confidence": 0-1, "explanation": string }'
            },
            {
              role: "user",
              content: "Claim: Goldfish have a 3-second memory."
            }
          ]
        },
        expected: {
          contains: ["false"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["fact-check", "nuanced"]
      },
      // Technical claims
      {
        id: "reasoning.fact.http-secure",
        name: "Technical security claim",
        input: {
          messages: [
            {
              role: "system",
              content: 'You are a technical fact-checker. Analyze the claim. Respond with JSON: { "verdict": "true" | "false" | "partially_true" | "unverifiable", "confidence": 0-1, "explanation": string }'
            },
            {
              role: "user",
              content: "Claim: HTTPS guarantees that a website is trustworthy and safe to use."
            }
          ]
        },
        expected: {
          contains: ["false", "partially"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["fact-check", "technical", "security"]
      }
    ];
    logicalReasoningCases = [
      // Syllogism
      {
        id: "reasoning.logic.syllogism",
        name: "Basic syllogism",
        input: {
          messages: [
            {
              role: "system",
              content: 'You are a logic expert. Analyze the argument and determine if the conclusion follows. Respond with JSON: { "valid": boolean, "explanation": string }'
            },
            {
              role: "user",
              content: "Premises: All dogs are mammals. All mammals are animals. Conclusion: All dogs are animals."
            }
          ]
        },
        expected: {
          contains: ["valid", "true"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["logic", "syllogism"]
      },
      // Invalid syllogism
      {
        id: "reasoning.logic.invalid-syllogism",
        name: "Invalid syllogism detection",
        input: {
          messages: [
            {
              role: "system",
              content: 'You are a logic expert. Analyze the argument and determine if the conclusion follows. Respond with JSON: { "valid": boolean, "explanation": string }'
            },
            {
              role: "user",
              content: "Premises: All cats are animals. Some animals are dogs. Conclusion: Some cats are dogs."
            }
          ]
        },
        expected: {
          contains: ["false", "invalid"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["logic", "syllogism", "fallacy"]
      },
      // Conditional reasoning
      {
        id: "reasoning.logic.modus-ponens",
        name: "Modus ponens",
        input: {
          messages: [
            {
              role: "system",
              content: 'Analyze this logical argument. Is the conclusion valid? Respond with JSON: { "valid": boolean, "rule": string, "explanation": string }'
            },
            {
              role: "user",
              content: "If it rains, the ground gets wet. It is raining. Therefore, the ground is wet."
            }
          ]
        },
        expected: {
          contains: ["valid", "true", "modus ponens"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["logic", "conditional"]
      },
      // Affirming the consequent (fallacy)
      {
        id: "reasoning.logic.affirming-consequent",
        name: "Affirming the consequent fallacy",
        input: {
          messages: [
            {
              role: "system",
              content: 'Analyze this logical argument. Is the conclusion valid? Identify any fallacies. Respond with JSON: { "valid": boolean, "fallacy": string | null, "explanation": string }'
            },
            {
              role: "user",
              content: "If it rains, the ground gets wet. The ground is wet. Therefore, it rained."
            }
          ]
        },
        expected: {
          contains: ["false", "invalid", "fallacy", "affirming"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["logic", "fallacy", "conditional"]
      }
    ];
    multiStepReasoningCases = [
      // Math word problem
      {
        id: "reasoning.multi.age-problem",
        name: "Age-based word problem",
        input: {
          messages: [
            {
              role: "system",
              content: "Solve this problem step by step and provide the final answer."
            },
            {
              role: "user",
              content: "Alice is twice as old as Bob. In 10 years, Alice will be 1.5 times as old as Bob. How old is Alice now?"
            }
          ]
        },
        expected: {
          contains: ["20"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["reasoning", "math", "multi-step"]
      },
      // Sequential dependencies
      {
        id: "reasoning.multi.meeting-schedule",
        name: "Meeting scheduling logic",
        input: {
          messages: [
            {
              role: "system",
              content: "Analyze the scheduling constraints and determine if the meeting can happen. Explain your reasoning step by step."
            },
            {
              role: "user",
              content: "Alice is free 9-11am and 2-4pm. Bob is free 10am-1pm. Charlie is free 11am-3pm. Can they all meet for 1 hour? If so, when?"
            }
          ]
        },
        expected: {
          contains: ["11", "12", "yes"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["reasoning", "scheduling", "constraints"]
      },
      // Causal chain
      {
        id: "reasoning.multi.causal-chain",
        name: "Causal chain analysis",
        input: {
          messages: [
            {
              role: "system",
              content: "Analyze the causal chain and identify the root cause."
            },
            {
              role: "user",
              content: "The website went down. Investigation revealed: The server ran out of memory. The memory was consumed by the database. The database had a runaway query. The query was triggered by a bug in the user search feature. The bug was introduced in last week's deployment. What is the root cause?"
            }
          ]
        },
        expected: {
          contains: ["bug", "deployment", "search"]
        },
        evaluator: "contains",
        weight: 1,
        tags: ["reasoning", "causal", "debugging"]
      }
    ];
    reasoningBenchmarks = [
      {
        id: "reasoning.fact-checking",
        name: "Fact Checking",
        description: "Tests the model's ability to verify factual claims",
        version: "1.0.0",
        taskType: "reasoning",
        category: "fact-checking",
        testCases: factCheckingCases,
        config: {
          maxTokens: 300,
          temperature: 0,
          timeout: 15e3
        }
      },
      {
        id: "reasoning.logical-analysis",
        name: "Logical Analysis",
        description: "Tests formal logic and fallacy detection",
        version: "1.0.0",
        taskType: "reasoning",
        category: "logic",
        testCases: logicalReasoningCases,
        config: {
          maxTokens: 400,
          temperature: 0,
          timeout: 15e3
        }
      },
      {
        id: "reasoning.multi-step",
        name: "Multi-Step Reasoning",
        description: "Tests complex reasoning requiring multiple steps",
        version: "1.0.0",
        taskType: "reasoning",
        category: "multi-step",
        testCases: multiStepReasoningCases,
        config: {
          maxTokens: 500,
          temperature: 0,
          timeout: 2e4
        }
      }
    ];
  }
});
var toolSelectionCases;
var parameterExtractionCases;
var multiToolCases;
var functionCallingBenchmarks;
var init_function_calling_benchmarks = __esm({
  "../integrations/server/src/model-eval/benchmarks/suites/function-calling-benchmarks.ts"() {
    "use strict";
    toolSelectionCases = [
      // Clear tool match
      {
        id: "function.selection.weather",
        name: "Weather tool selection",
        input: {
          messages: [
            {
              role: "system",
              content: "You have access to tools. Select the appropriate tool for the user's request."
            },
            { role: "user", content: "What's the weather like in San Francisco?" }
          ],
          tools: [
            {
              name: "get_weather",
              description: "Get current weather for a location",
              parameters: {
                type: "object",
                properties: {
                  location: { type: "string", description: "City name" },
                  units: { type: "string", enum: ["celsius", "fahrenheit"] }
                },
                required: ["location"]
              }
            },
            {
              name: "search_web",
              description: "Search the web for information",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string" }
                },
                required: ["query"]
              }
            },
            {
              name: "send_email",
              description: "Send an email",
              parameters: {
                type: "object",
                properties: {
                  to: { type: "string" },
                  subject: { type: "string" },
                  body: { type: "string" }
                },
                required: ["to", "subject", "body"]
              }
            }
          ]
        },
        expected: {
          functionCall: {
            name: "get_weather",
            arguments: { location: "San Francisco" }
          }
        },
        evaluator: "function_call",
        weight: 1,
        tags: ["tool-selection", "basic"]
      },
      // Multiple viable tools
      {
        id: "function.selection.search-vs-web",
        name: "Database vs web search selection",
        input: {
          messages: [
            {
              role: "system",
              content: "You have access to tools. Select the most appropriate tool."
            },
            { role: "user", content: "Find all users named John in our system" }
          ],
          tools: [
            {
              name: "search_users",
              description: "Search for users in the internal database",
              parameters: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  email: { type: "string" }
                }
              }
            },
            {
              name: "search_web",
              description: "Search the public web",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string" }
                }
              }
            }
          ]
        },
        expected: {
          functionCall: {
            name: "search_users"
          }
        },
        evaluator: "function_call",
        weight: 1,
        tags: ["tool-selection", "disambiguation"]
      },
      // Multi-tool scenario
      {
        id: "function.selection.calculator",
        name: "Calculator tool selection",
        input: {
          messages: [
            {
              role: "system",
              content: "You have access to tools. Use them when appropriate."
            },
            { role: "user", content: "What is 15% of 847?" }
          ],
          tools: [
            {
              name: "calculator",
              description: "Perform mathematical calculations",
              parameters: {
                type: "object",
                properties: {
                  expression: { type: "string", description: "Math expression to evaluate" }
                },
                required: ["expression"]
              }
            },
            {
              name: "search_web",
              description: "Search the web",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string" }
                }
              }
            }
          ]
        },
        expected: {
          functionCall: {
            name: "calculator"
          }
        },
        evaluator: "function_call",
        weight: 1,
        tags: ["tool-selection", "math"]
      },
      // No tool needed
      {
        id: "function.selection.no-tool",
        name: "Recognize when no tool is needed",
        input: {
          messages: [
            {
              role: "system",
              content: "You have access to tools. Only use them when necessary. For general knowledge questions, respond directly."
            },
            { role: "user", content: "What is the capital of France?" }
          ],
          tools: [
            {
              name: "get_weather",
              description: "Get current weather",
              parameters: {
                type: "object",
                properties: {
                  location: { type: "string" }
                }
              }
            },
            {
              name: "search_web",
              description: "Search the web for current information",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string" }
                }
              }
            }
          ]
        },
        expected: {
          contains: ["Paris"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["tool-selection", "no-tool"]
      }
    ];
    parameterExtractionCases = [
      // Complex parameter extraction
      {
        id: "function.params.multi-param",
        name: "Multiple parameter extraction",
        input: {
          messages: [
            {
              role: "system",
              content: "Extract the required parameters from the user request and call the appropriate function."
            },
            {
              role: "user",
              content: "Book a flight from New York to London on March 15th for 2 adults"
            }
          ],
          tools: [
            {
              name: "book_flight",
              description: "Book a flight",
              parameters: {
                type: "object",
                properties: {
                  origin: { type: "string", description: "Departure city" },
                  destination: { type: "string", description: "Arrival city" },
                  date: { type: "string", description: "Travel date (YYYY-MM-DD)" },
                  passengers: { type: "integer", description: "Number of passengers" }
                },
                required: ["origin", "destination", "date", "passengers"]
              }
            }
          ]
        },
        expected: {
          functionCall: {
            name: "book_flight",
            arguments: {
              origin: "New York",
              destination: "London",
              passengers: 2
            }
          }
        },
        evaluator: "function_call",
        weight: 2,
        tags: ["parameters", "extraction"]
      },
      // Implicit parameter inference
      {
        id: "function.params.implicit",
        name: "Implicit parameter inference",
        input: {
          messages: [
            {
              role: "system",
              content: "Extract parameters, inferring reasonable defaults when not explicitly stated."
            },
            { role: "user", content: "Set a reminder to call mom tomorrow" }
          ],
          tools: [
            {
              name: "create_reminder",
              description: "Create a reminder",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  datetime: { type: "string", description: "ISO datetime" },
                  priority: { type: "string", enum: ["low", "medium", "high"] }
                },
                required: ["title", "datetime"]
              }
            }
          ]
        },
        expected: {
          functionCall: {
            name: "create_reminder",
            arguments: {
              title: "call mom"
            }
          }
        },
        evaluator: "function_call",
        weight: 1,
        tags: ["parameters", "inference"]
      },
      // Nested/complex parameters
      {
        id: "function.params.nested",
        name: "Nested parameter structure",
        input: {
          messages: [
            {
              role: "system",
              content: "Parse the request into the correct parameter structure."
            },
            {
              role: "user",
              content: "Create a new user with name John Doe, email john@example.com, and admin role"
            }
          ],
          tools: [
            {
              name: "create_user",
              description: "Create a new user",
              parameters: {
                type: "object",
                properties: {
                  user: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      email: { type: "string" },
                      role: { type: "string", enum: ["user", "admin", "moderator"] }
                    },
                    required: ["name", "email"]
                  }
                },
                required: ["user"]
              }
            }
          ]
        },
        expected: {
          functionCall: {
            name: "create_user",
            arguments: {
              user: {
                name: "John Doe",
                email: "john@example.com",
                role: "admin"
              }
            }
          }
        },
        evaluator: "function_call",
        weight: 2,
        tags: ["parameters", "nested"]
      }
    ];
    multiToolCases = [
      // Sequential tool use
      {
        id: "function.multi.sequential",
        name: "Sequential tool orchestration",
        input: {
          messages: [
            {
              role: "system",
              content: "You can use multiple tools. Plan and execute the steps needed."
            },
            {
              role: "user",
              content: "Find the weather in Tokyo and convert the temperature to Fahrenheit"
            }
          ],
          tools: [
            {
              name: "get_weather",
              description: "Get weather (returns Celsius)",
              parameters: {
                type: "object",
                properties: {
                  location: { type: "string" }
                }
              }
            },
            {
              name: "convert_temperature",
              description: "Convert temperature between units",
              parameters: {
                type: "object",
                properties: {
                  value: { type: "number" },
                  from: { type: "string", enum: ["celsius", "fahrenheit"] },
                  to: { type: "string", enum: ["celsius", "fahrenheit"] }
                }
              }
            }
          ]
        },
        expected: {
          functionCall: {
            name: "get_weather",
            arguments: { location: "Tokyo" }
          }
        },
        evaluator: "function_call",
        weight: 2,
        tags: ["multi-tool", "sequential"]
      },
      // Parallel tool use
      {
        id: "function.multi.parallel",
        name: "Parallel tool invocation",
        input: {
          messages: [
            {
              role: "system",
              content: "You can call multiple tools in parallel when they don't depend on each other."
            },
            {
              role: "user",
              content: "What's the weather in both New York and Los Angeles?"
            }
          ],
          tools: [
            {
              name: "get_weather",
              description: "Get weather for a location",
              parameters: {
                type: "object",
                properties: {
                  location: { type: "string" }
                }
              }
            }
          ]
        },
        expected: {
          contains: ["New York", "Los Angeles"]
        },
        evaluator: "contains",
        weight: 2,
        tags: ["multi-tool", "parallel"]
      }
    ];
    functionCallingBenchmarks = [
      {
        id: "function_calling.tool-selection",
        name: "Tool Selection",
        description: "Tests the model's ability to select the correct tool for a task",
        version: "1.0.0",
        taskType: "function_calling",
        category: "tool-selection",
        testCases: toolSelectionCases,
        config: {
          maxTokens: 300,
          temperature: 0,
          timeout: 15e3
        }
      },
      {
        id: "function_calling.parameter-extraction",
        name: "Parameter Extraction",
        description: "Tests accurate extraction of function parameters from natural language",
        version: "1.0.0",
        taskType: "function_calling",
        category: "parameter-extraction",
        testCases: parameterExtractionCases,
        config: {
          maxTokens: 400,
          temperature: 0,
          timeout: 15e3
        }
      },
      {
        id: "function_calling.multi-tool",
        name: "Multi-Tool Orchestration",
        description: "Tests ability to orchestrate multiple tools",
        version: "1.0.0",
        taskType: "function_calling",
        category: "multi-tool",
        testCases: multiToolCases,
        config: {
          maxTokens: 500,
          temperature: 0,
          timeout: 2e4
        }
      }
    ];
  }
});
var benchmark_registry_exports = {};
__export(benchmark_registry_exports, {
  clearBenchmarkRegistry: () => clearBenchmarkRegistry,
  getAllBenchmarks: () => getAllBenchmarks,
  getBenchmark: () => getBenchmark,
  getBenchmarkIds: () => getBenchmarkIds,
  getBenchmarkSummary: () => getBenchmarkSummary,
  getBenchmarksByCategory: () => getBenchmarksByCategory,
  getBenchmarksByTaskType: () => getBenchmarksByTaskType,
  hasBenchmark: () => hasBenchmark,
  initializeBuiltinBenchmarks: () => initializeBuiltinBenchmarks,
  registerBenchmark: () => registerBenchmark,
  registerBenchmarks: () => registerBenchmarks
});
function registerBenchmark(benchmark) {
  if (benchmarkRegistry.has(benchmark.id)) {
    console.warn(`[benchmark-registry] Overwriting existing benchmark: ${benchmark.id}`);
  }
  benchmarkRegistry.set(benchmark.id, benchmark);
}
function registerBenchmarks(benchmarks) {
  for (const benchmark of benchmarks) {
    registerBenchmark(benchmark);
  }
}
function getBenchmark(id) {
  return benchmarkRegistry.get(id);
}
function getAllBenchmarks() {
  return Array.from(benchmarkRegistry.values());
}
function getBenchmarksByTaskType(taskType) {
  return Array.from(benchmarkRegistry.values()).filter(
    (b) => b.taskType === taskType
  );
}
function getBenchmarksByCategory(category) {
  return Array.from(benchmarkRegistry.values()).filter(
    (b) => b.category === category
  );
}
function getBenchmarkIds() {
  return Array.from(benchmarkRegistry.keys());
}
function hasBenchmark(id) {
  return benchmarkRegistry.has(id);
}
function getBenchmarkSummary() {
  const benchmarks = getAllBenchmarks();
  const byTaskType = {};
  const byCategory = {};
  for (const benchmark of benchmarks) {
    byTaskType[benchmark.taskType] = (byTaskType[benchmark.taskType] || 0) + 1;
    byCategory[benchmark.category] = (byCategory[benchmark.category] || 0) + 1;
  }
  return {
    total: benchmarks.length,
    byTaskType,
    byCategory
  };
}
function clearBenchmarkRegistry() {
  benchmarkRegistry.clear();
}
function initializeBuiltinBenchmarks() {
  registerBenchmarks(routingBenchmarks);
  registerBenchmarks(codeReviewBenchmarks);
  registerBenchmarks(reasoningBenchmarks);
  registerBenchmarks(functionCallingBenchmarks);
  const summary = getBenchmarkSummary();
  console.log(
    `[benchmark-registry] Initialized ${summary.total} built-in benchmarks:`,
    summary.byTaskType
  );
}
var benchmarkRegistry;
var init_benchmark_registry = __esm({
  "../integrations/server/src/model-eval/benchmarks/benchmark-registry.ts"() {
    "use strict";
    init_routing_benchmarks();
    init_code_review_benchmarks();
    init_reasoning_benchmarks();
    init_function_calling_benchmarks();
    benchmarkRegistry = /* @__PURE__ */ new Map();
  }
});
var MEMORY_SCHEMA_SQL;
var init_memory_schema = __esm({
  "../integrations/server/src/memory-schema.ts"() {
    "use strict";
    MEMORY_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS integration_execution_logs (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(255) NOT NULL,
    org_id VARCHAR(255),
    provider TEXT NOT NULL,
    operation TEXT NOT NULL,
    model TEXT,
    request_id VARCHAR(255) NOT NULL,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    estimated_cost_cents INTEGER,
    metadata JSON DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_execution_logs_user_id ON integration_execution_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_execution_logs_org_id ON integration_execution_logs(org_id);
  CREATE INDEX IF NOT EXISTS idx_execution_logs_provider ON integration_execution_logs(provider);
  CREATE INDEX IF NOT EXISTS idx_execution_logs_created ON integration_execution_logs(created_at);

  -- Model Evaluations table
  CREATE TABLE IF NOT EXISTS model_evaluations (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    provider VARCHAR(100) NOT NULL,
    model_id VARCHAR(255) NOT NULL,
    benchmark_id VARCHAR(255) NOT NULL,
    benchmark_version VARCHAR(50) NOT NULL,
    overall_score REAL NOT NULL,
    accuracy REAL NOT NULL,
    latency_p50_ms INTEGER NOT NULL,
    latency_p95_ms INTEGER NOT NULL,
    latency_p99_ms INTEGER,
    total_input_tokens INTEGER NOT NULL,
    total_output_tokens INTEGER NOT NULL,
    estimated_cost_cents REAL NOT NULL,
    test_case_results JSON NOT NULL,
    run_config JSON NOT NULL,
    org_id VARCHAR(100),
    scope VARCHAR(20) NOT NULL DEFAULT 'global',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_model_evaluations_provider ON model_evaluations(provider);
  CREATE INDEX IF NOT EXISTS idx_model_evaluations_model ON model_evaluations(model_id);
  CREATE INDEX IF NOT EXISTS idx_model_evaluations_benchmark ON model_evaluations(benchmark_id);
  CREATE INDEX IF NOT EXISTS idx_model_evaluations_status ON model_evaluations(status);

  -- Model Scores table (aggregated)
  CREATE TABLE IF NOT EXISTS model_scores (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    provider VARCHAR(100) NOT NULL,
    model_id VARCHAR(255) NOT NULL,
    task_type VARCHAR(50) NOT NULL,
    quality_score REAL NOT NULL,
    speed_score REAL NOT NULL,
    cost_score REAL NOT NULL,
    reliability_score REAL NOT NULL,
    composite_score REAL NOT NULL,
    evaluation_ids JSON NOT NULL DEFAULT '[]',
    org_id VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(provider, model_id, task_type)
  );

  CREATE INDEX IF NOT EXISTS idx_model_scores_provider ON model_scores(provider);
  CREATE INDEX IF NOT EXISTS idx_model_scores_task_type ON model_scores(task_type);
  CREATE INDEX IF NOT EXISTS idx_model_scores_composite ON model_scores(composite_score);

  -- Model Recommendations cache
  CREATE TABLE IF NOT EXISTS model_recommendations (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    task_type VARCHAR(50) NOT NULL,
    constraints JSON,
    recommendations JSON NOT NULL,
    cache_key VARCHAR(255) NOT NULL UNIQUE,
    org_id VARCHAR(100),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_model_recommendations_task_type ON model_recommendations(task_type);
  CREATE INDEX IF NOT EXISTS idx_model_recommendations_cache_key ON model_recommendations(cache_key);
  CREATE INDEX IF NOT EXISTS idx_model_recommendations_expires ON model_recommendations(expires_at);

  -- Benchmark Definitions table
  CREATE TABLE IF NOT EXISTS benchmark_definitions (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(50) NOT NULL,
    task_type VARCHAR(50) NOT NULL,
    category VARCHAR(100) NOT NULL,
    test_cases JSON NOT NULL,
    config JSON,
    author VARCHAR(255),
    is_builtin BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_benchmark_definitions_task_type ON benchmark_definitions(task_type);
  CREATE INDEX IF NOT EXISTS idx_benchmark_definitions_category ON benchmark_definitions(category);

  -- Evaluation Schedules table
  CREATE TABLE IF NOT EXISTS evaluation_schedules (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    provider VARCHAR(100),
    model_id VARCHAR(255),
    benchmark_id VARCHAR(255),
    task_type VARCHAR(50),
    cron_expression VARCHAR(100) NOT NULL,
    interval_hours INTEGER,
    enabled BOOLEAN NOT NULL DEFAULT true,
    last_run_at TIMESTAMP,
    next_run_at TIMESTAMP,
    last_error TEXT,
    org_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_evaluation_schedules_enabled ON evaluation_schedules(enabled);
  CREATE INDEX IF NOT EXISTS idx_evaluation_schedules_next_run ON evaluation_schedules(next_run_at);

  -- Channel Connections table (for multi-channel messaging)
  CREATE TABLE IF NOT EXISTS channel_connections (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    integration_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    org_id VARCHAR(255),
    channel_type VARCHAR(50) NOT NULL,
    channel_account_id VARCHAR(255),
    channel_account_name VARCHAR(255),
    credential_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    session_data JSON DEFAULT '{}',
    qr_code TEXT,
    qr_expires_at TIMESTAMP,
    qr_attempts INTEGER DEFAULT 0,
    webhook_url TEXT,
    webhook_secret TEXT,
    webhook_verified BOOLEAN DEFAULT false,
    last_ping_at TIMESTAMP,
    last_message_at TIMESTAMP,
    last_error_at TIMESTAMP,
    last_error TEXT,
    error_count INTEGER DEFAULT 0,
    consecutive_errors INTEGER DEFAULT 0,
    messages_received INTEGER DEFAULT 0,
    messages_sent INTEGER DEFAULT 0,
    metadata JSON DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    connected_at TIMESTAMP,
    disconnected_at TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_channel_connections_user_id ON channel_connections(user_id);
  CREATE INDEX IF NOT EXISTS idx_channel_connections_org_id ON channel_connections(org_id);
  CREATE INDEX IF NOT EXISTS idx_channel_connections_channel_type ON channel_connections(channel_type);
  CREATE INDEX IF NOT EXISTS idx_channel_connections_status ON channel_connections(status);

  -- Proxy Usage table (tracks usage when org-wide credentials are used)
  CREATE TABLE IF NOT EXISTS proxy_usage (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(255) NOT NULL,
    org_id VARCHAR(255) NOT NULL,
    integration_key VARCHAR(255) NOT NULL,
    operation VARCHAR(500) NOT NULL,
    credential_id VARCHAR(255) NOT NULL,
    request_id VARCHAR(100),
    success BOOLEAN NOT NULL DEFAULT true,
    status_code INTEGER,
    error_message TEXT,
    duration_ms INTEGER,
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER,
    estimated_cost_micros INTEGER,
    metadata JSON DEFAULT '{}',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_proxy_usage_user_id ON proxy_usage(user_id);
  CREATE INDEX IF NOT EXISTS idx_proxy_usage_org_id ON proxy_usage(org_id);
  CREATE INDEX IF NOT EXISTS idx_proxy_usage_integration ON proxy_usage(integration_key);
  CREATE INDEX IF NOT EXISTS idx_proxy_usage_timestamp ON proxy_usage(timestamp);
  CREATE INDEX IF NOT EXISTS idx_proxy_usage_org_timestamp ON proxy_usage(org_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_proxy_usage_credential ON proxy_usage(credential_id);

  -- OAuth subsystem.
  --
  -- ABSENT UNTIL 24 AUG, WHICH MADE THE WHOLE SUBSYSTEM DEAD ROUTES.
  -- schema.ts declared these three tables and nothing ever created them, in
  -- either persistence mode, so GET /api/oauth/providers answered 500 with
  -- "relation oauth_provider_configs does not exist" from the day it was
  -- written. Recorded as F48. This is the onboarding path for connecting a
  -- streamer's Twitch account, so it is the difference between a product and
  -- a CLI that opens the operator's own browser.
  CREATE TABLE IF NOT EXISTS oauth_provider_configs (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    provider VARCHAR(100) NOT NULL UNIQUE,
    authorization_url TEXT NOT NULL,
    token_url TEXT NOT NULL,
    userinfo_url TEXT,
    revoke_url TEXT,
    client_id TEXT NOT NULL,
    client_secret_encrypted TEXT NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    icon_url TEXT,
    default_scopes JSON DEFAULT '[]',
    scope_delimiter VARCHAR(10) DEFAULT ' ',
    response_type VARCHAR(50) DEFAULT 'code',
    grant_type VARCHAR(50) DEFAULT 'authorization_code',
    pkce_required BOOLEAN DEFAULT false,
    supports_refresh BOOLEAN DEFAULT true,
    is_enabled BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_oauth_provider_configs_provider ON oauth_provider_configs(provider);
  CREATE INDEX IF NOT EXISTS idx_oauth_provider_configs_enabled ON oauth_provider_configs(is_enabled);

  CREATE TABLE IF NOT EXISTS oauth_states (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    state VARCHAR(255) NOT NULL UNIQUE,
    user_id VARCHAR(255) NOT NULL,
    org_id VARCHAR(255),
    provider VARCHAR(100) NOT NULL,
    redirect_uri TEXT NOT NULL,
    scopes JSON DEFAULT '[]',
    pkce_verifier TEXT,
    pkce_challenge TEXT,
    client_state TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_oauth_states_state ON oauth_states(state);
  CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);
  CREATE INDEX IF NOT EXISTS idx_oauth_states_user ON oauth_states(user_id);

  CREATE TABLE IF NOT EXISTS oauth_connections (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(255) NOT NULL,
    org_id VARCHAR(255),
    provider VARCHAR(100) NOT NULL,
    oauth_user_id VARCHAR(255),
    oauth_user_email TEXT,
    oauth_user_name TEXT,
    oauth_avatar_url TEXT,
    credential_id VARCHAR(255),
    scopes JSON DEFAULT '[]',
    status VARCHAR(50) DEFAULT 'active' NOT NULL,
    expires_at TIMESTAMP,
    connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_used_at TIMESTAMP,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_oauth_connections_user ON oauth_connections(user_id);
  CREATE INDEX IF NOT EXISTS idx_oauth_connections_org ON oauth_connections(org_id);
  CREATE INDEX IF NOT EXISTS idx_oauth_connections_provider ON oauth_connections(provider);
  CREATE INDEX IF NOT EXISTS idx_oauth_connections_user_provider ON oauth_connections(user_id, provider);
  CREATE INDEX IF NOT EXISTS idx_oauth_connections_status ON oauth_connections(status);


  -- Externally registered integrations (F54).
  --
  -- The registry is an in-process Map. Builtins rebuild themselves at boot from
  -- what each service declares; an OpenAPI or MCP integration registered from
  -- outside does not, and vanished on all three restarts measured on 24 Aug.
  CREATE TABLE IF NOT EXISTS registered_integrations (
    key VARCHAR(255) PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    definition JSON NOT NULL,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );
`;
  }
});
var db_exports = {};
__export(db_exports, {
  clearSessionContext: () => clearSessionContext,
  close: () => close,
  database: () => database,
  db: () => db,
  exportToFile: () => exportToFile,
  isMemory: () => isMemory,
  pool: () => pool,
  setRLSContext: () => setRLSContext,
  setSessionContext: () => setSessionContext
});
async function setRLSContext(context) {
  await setSessionContext(pool, {
    orgId: context.orgId || "",
    userId: context.userId || "anonymous",
    isSuperAdmin: context.isSuperAdmin,
    capabilities: context.capabilities,
    serviceId: "integrations"
  });
}
var database;
var db;
var pool;
var isMemory;
var exportToFile;
var close;
var init_db = __esm({
  "../integrations/server/src/db.ts"() {
    "use strict";
    init_schema();
    init_memory_schema();
    database = initializeDatabase({
      serviceId: "integrations-service",
      memorySchema: MEMORY_SCHEMA_SQL,
      memoryDbEnvVar: "INTEGRATIONS_USE_MEMORY_DB"
    }, schema_exports);
    ({ db, pool, isMemory, exportToFile, close } = database);
  }
});
import_dotenv.default.config();
var config = {
  port: resolveOwnPort(ServiceId.INTEGRATIONS),
  databaseUrl: process.env.DATABASE_URL || "",
  identityServiceUrl: resolveServiceUrl(ServiceId.IDENTITY),
  serviceId: process.env.SERVICE_ID || ServiceId.INTEGRATIONS,
  serviceName: process.env.SERVICE_NAME || "Symbia Integrations",
  // Rate limiting (disabled by default)
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED === "true",
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
  rateLimitUserLimit: parseInt(process.env.RATE_LIMIT_USER || "100", 10),
  rateLimitOrgLimit: parseInt(process.env.RATE_LIMIT_ORG || "500", 10),
  rateLimitProviderLimit: parseInt(process.env.RATE_LIMIT_PROVIDER || "1000", 10),
  /**
   * Where a browser is sent when an OAuth callback fails.
   *
   * This is a redirect for the *user's* browser, so it must be an externally
   * reachable URL. The service cannot derive one — it knows the port it was
   * registered on, not the address a browser outside the network reaches it
   * at — so a real deployment has to say. `oauthRedirectConfigured` records
   * whether anyone did.
   *
   * The previous fallback was a literal `http://localhost:3000`, a port retired
   * when service-admin moved to 9000, pointing at a marketing site that is no
   * longer in this repo. Neither OAUTH_ERROR_REDIRECT_URL nor WEBSITE_URL is
   * set in .env.example or compose, so that dead address was not an edge case:
   * it was the only path this code ever took.
   */
  oauthErrorRedirectUrl: process.env.OAUTH_ERROR_REDIRECT_URL || process.env.WEBSITE_URL || `http://localhost:${ServicePorts[ServiceId.CONTROL_CENTER]}`,
  oauthRedirectConfigured: Boolean(
    process.env.OAUTH_ERROR_REDIRECT_URL || process.env.WEBSITE_URL
  )
};
init_schema();
var providerRegistry = /* @__PURE__ */ new Map();
function registerProvider(adapter) {
  providerRegistry.set(adapter.name, adapter);
}
function getProvider(name) {
  return providerRegistry.get(name);
}
function getRegisteredProviders() {
  return Array.from(providerRegistry.keys());
}
function normalizeFinishReason(raw) {
  if (!raw) return "stop";
  const normalized = raw.toLowerCase();
  if (normalized === "stop" || normalized === "end_turn") return "stop";
  if (normalized === "length" || normalized === "max_tokens") return "length";
  if (normalized === "content_filter" || normalized === "safety") return "content_filter";
  if (normalized === "tool_calls" || normalized === "function_call") return "tool_calls";
  if (normalized === "incomplete") return "incomplete";
  return "stop";
}
var OPENAI_BASE_URL = "https://api.openai.com/v1";
var OpenAIProvider = class {
  name = "openai";
  supportedOperations = ["chat.completions", "responses", "embeddings"];
  async execute(options) {
    const { operation, model, params, apiKey, timeout } = options;
    if (operation === "responses") {
      return this.executeResponses(options);
    }
    if (operation !== "chat.completions") {
      throw new Error(`OpenAI provider does not support operation: ${operation}`);
    }
    const url = `${OPENAI_BASE_URL}/chat/completions`;
    const body = this.buildChatRequestBody(model, params);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: timeout ? AbortSignal.timeout(timeout) : void 0
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }
    const raw = await response.json();
    return this.normalizeChatResponse(raw);
  }
  /**
   * Execute using the Responses API (stateful conversations)
   * Supports both standard and compact modes
   */
  async executeResponses(options) {
    const { model, params, apiKey, timeout } = options;
    const useCompact = params.compactMode === true;
    const url = useCompact ? `${OPENAI_BASE_URL}/responses/compact` : `${OPENAI_BASE_URL}/responses`;
    const body = this.buildResponsesRequestBody(model, params);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: timeout ? AbortSignal.timeout(timeout) : void 0
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`OpenAI Responses API error: ${error.error?.message || response.statusText}`);
    }
    const raw = await response.json();
    return this.normalizeResponsesResponse(raw);
  }
  async embed(options) {
    const { model, params, apiKey, timeout } = options;
    const url = `${OPENAI_BASE_URL}/embeddings`;
    const body = {
      model,
      input: params.input || params.text
    };
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: timeout ? AbortSignal.timeout(timeout) : void 0
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }
    const raw = await response.json();
    return this.normalizeEmbeddingResponse(raw);
  }
  validateParams(operation, params) {
    const errors = [];
    if (operation === "chat.completions") {
      if (!params.messages && !params.prompt) {
        errors.push("Either messages or prompt is required");
      }
    } else if (operation === "embeddings") {
      if (!params.input && !params.text) {
        errors.push("Either input or text is required for embeddings");
      }
    }
    return { valid: errors.length === 0, errors };
  }
  estimateTokens(text3) {
    return Math.ceil(text3.length / 4);
  }
  /**
   * List available models from OpenAI
   * When API key is provided, fetches dynamically from OpenAI API
   */
  async listModels(apiKey) {
    const modelMetadata = {
      // ==========================================================================
      // GPT-5.2 Series (Released Jan 2026) - Latest flagship models
      // ==========================================================================
      "gpt-5.2": {
        name: "GPT-5.2",
        description: "Latest flagship model with breakthrough capabilities, 90% cached discount",
        contextWindow: 1e6,
        // 1M context
        maxOutputTokens: 1e5,
        capabilities: ["chat", "vision", "function_calling"],
        inputPricing: 1.75,
        // $1.75/1M input (90% discount with caching)
        outputPricing: 14
        // $14/1M output
      },
      "gpt-5.2-thinking": {
        name: "GPT-5.2 Thinking",
        description: "Extended reasoning with visible chain-of-thought, ideal for complex problems",
        contextWindow: 1e6,
        maxOutputTokens: 1e5,
        capabilities: ["chat", "vision", "function_calling", "reasoning"],
        inputPricing: 3.5,
        outputPricing: 28
      },
      "gpt-5.2-pro": {
        name: "GPT-5.2 Pro",
        description: "Maximum compute version for hardest problems",
        contextWindow: 1e6,
        maxOutputTokens: 1e5,
        capabilities: ["chat", "vision", "function_calling", "reasoning"],
        inputPricing: 15,
        outputPricing: 60
      },
      "gpt-5.2-codex": {
        name: "GPT-5.2 Codex",
        description: "Specialized for code generation, editing, and analysis",
        contextWindow: 1e6,
        maxOutputTokens: 1e5,
        capabilities: ["chat", "vision", "function_calling", "completion"],
        inputPricing: 2,
        outputPricing: 16
      },
      // ==========================================================================
      // o-Series Reasoning Models (o3/o4 - Jan 2026)
      // Reasoning effort: none, low, medium, high, xhigh
      // ==========================================================================
      "o3": {
        name: "o3",
        description: "Advanced reasoning model with adaptive compute (successor to o1)",
        contextWindow: 2e5,
        maxOutputTokens: 1e5,
        capabilities: ["chat", "reasoning", "vision", "function_calling"],
        inputPricing: 10,
        outputPricing: 40
      },
      "o4-mini": {
        name: "o4 Mini",
        description: "Fast, efficient reasoning for everyday tasks",
        contextWindow: 2e5,
        maxOutputTokens: 1e5,
        capabilities: ["chat", "reasoning", "function_calling"],
        inputPricing: 1.1,
        outputPricing: 4.4
      },
      "o3-pro": {
        name: "o3 Pro",
        description: "Extended compute reasoning for hardest problems, supports xhigh effort",
        contextWindow: 2e5,
        maxOutputTokens: 1e5,
        capabilities: ["chat", "reasoning", "vision", "function_calling"],
        inputPricing: 150,
        outputPricing: 600
      },
      "o3-deep-research": {
        name: "o3 Deep Research",
        description: "Autonomous multi-step research with web access and extended reasoning",
        contextWindow: 2e5,
        maxOutputTokens: 1e5,
        capabilities: ["chat", "reasoning", "vision", "function_calling"],
        inputPricing: 50,
        outputPricing: 200
      },
      "o4-mini-deep-research": {
        name: "o4 Mini Deep Research",
        description: "Cost-effective autonomous research with o4-mini backbone",
        contextWindow: 2e5,
        maxOutputTokens: 1e5,
        capabilities: ["chat", "reasoning", "function_calling"],
        inputPricing: 5,
        outputPricing: 20
      },
      // ==========================================================================
      // Legacy o-Series (o1) - Still available
      // ==========================================================================
      "o1": {
        name: "o1",
        description: "Original reasoning model (consider o3 or o4-mini instead)",
        contextWindow: 2e5,
        maxOutputTokens: 1e5,
        capabilities: ["chat", "reasoning", "vision", "function_calling"],
        inputPricing: 15,
        outputPricing: 60
      },
      "o1-mini": {
        name: "o1 Mini",
        description: "Original fast reasoning model (consider o4-mini instead)",
        contextWindow: 128e3,
        maxOutputTokens: 65536,
        capabilities: ["chat", "reasoning"],
        inputPricing: 3,
        outputPricing: 12
      },
      // ==========================================================================
      // GPT-4o Series - Previous generation flagship
      // ==========================================================================
      "gpt-4o": {
        name: "GPT-4o",
        description: "Multimodal model, great for complex tasks (previous generation)",
        contextWindow: 128e3,
        maxOutputTokens: 16384,
        capabilities: ["chat", "vision", "function_calling"],
        inputPricing: 2.5,
        outputPricing: 10
      },
      "gpt-4o-mini": {
        name: "GPT-4o Mini",
        description: "Fast and affordable for simpler tasks",
        contextWindow: 128e3,
        maxOutputTokens: 16384,
        capabilities: ["chat", "vision", "function_calling"],
        inputPricing: 0.15,
        outputPricing: 0.6
      },
      // ==========================================================================
      // Legacy GPT-4 Models
      // ==========================================================================
      "gpt-4-turbo": {
        name: "GPT-4 Turbo",
        description: "GPT-4 Turbo with vision capabilities",
        contextWindow: 128e3,
        maxOutputTokens: 4096,
        capabilities: ["chat", "vision", "function_calling"],
        inputPricing: 10,
        outputPricing: 30
      },
      "gpt-4": {
        name: "GPT-4",
        description: "Original GPT-4 model (legacy)",
        contextWindow: 8192,
        maxOutputTokens: 4096,
        capabilities: ["chat", "function_calling"],
        inputPricing: 30,
        outputPricing: 60,
        deprecated: true
      },
      "gpt-3.5-turbo": {
        name: "GPT-3.5 Turbo",
        description: "Fast and economical for simple tasks (legacy)",
        contextWindow: 16385,
        maxOutputTokens: 4096,
        capabilities: ["chat", "function_calling"],
        inputPricing: 0.5,
        outputPricing: 1.5,
        deprecated: true
      },
      // ==========================================================================
      // Embedding Models
      // ==========================================================================
      "text-embedding-3-large": {
        name: "Text Embedding 3 Large",
        description: "Most capable embedding model, 3072 dimensions",
        contextWindow: 8191,
        capabilities: ["embedding"],
        inputPricing: 0.13
      },
      "text-embedding-3-small": {
        name: "Text Embedding 3 Small",
        description: "Efficient embedding model, 1536 dimensions",
        contextWindow: 8191,
        capabilities: ["embedding"],
        inputPricing: 0.02
      },
      "text-embedding-ada-002": {
        name: "Text Embedding Ada 002",
        description: "Legacy embedding model",
        contextWindow: 8191,
        capabilities: ["embedding"],
        inputPricing: 0.1,
        deprecated: true
      }
    };
    if (apiKey) {
      try {
        const response = await fetch(`${OPENAI_BASE_URL}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` }
        });
        if (response.ok) {
          const data = await response.json();
          const relevantModels = data.data.filter(
            (m) => m.id.startsWith("gpt-") || // gpt-4o, gpt-4, gpt-3.5, gpt-5.2
            m.id.startsWith("o1") || // o1, o1-mini, o1-pro
            m.id.startsWith("o3") || // o3, o3-pro, o3-deep-research
            m.id.startsWith("o4") || // o4-mini, o4-mini-deep-research
            m.id.includes("embedding")
          ).filter(
            (m) => (
              // Exclude internal/fine-tuned models
              !m.id.includes("ft:") && !m.id.includes(":ft-") && !m.id.includes("-instruct") && m.owned_by !== "user"
            )
          ).sort((a, b) => b.created - a.created);
          return relevantModels.map((m) => {
            const metadata = modelMetadata[m.id] || this.inferModelMetadata(m.id);
            return {
              id: m.id,
              name: metadata.name || this.formatModelName(m.id),
              description: metadata.description,
              contextWindow: metadata.contextWindow,
              maxOutputTokens: metadata.maxOutputTokens,
              capabilities: metadata.capabilities || ["chat"],
              inputPricing: metadata.inputPricing,
              outputPricing: metadata.outputPricing,
              deprecated: metadata.deprecated
            };
          });
        }
      } catch (error) {
        console.warn("[openai] Failed to fetch models from API:", error);
      }
    }
    return [
      // GPT-5.2 series (newest - Jan 2026)
      { id: "gpt-5.2", ...modelMetadata["gpt-5.2"] },
      { id: "gpt-5.2-thinking", ...modelMetadata["gpt-5.2-thinking"] },
      { id: "gpt-5.2-pro", ...modelMetadata["gpt-5.2-pro"] },
      { id: "gpt-5.2-codex", ...modelMetadata["gpt-5.2-codex"] },
      // o-series reasoning (o3/o4 - Jan 2026)
      { id: "o4-mini", ...modelMetadata["o4-mini"] },
      { id: "o3", ...modelMetadata["o3"] },
      { id: "o3-pro", ...modelMetadata["o3-pro"] },
      { id: "o3-deep-research", ...modelMetadata["o3-deep-research"] },
      { id: "o4-mini-deep-research", ...modelMetadata["o4-mini-deep-research"] },
      // GPT-4o series (previous generation)
      { id: "gpt-4o", ...modelMetadata["gpt-4o"] },
      { id: "gpt-4o-mini", ...modelMetadata["gpt-4o-mini"] },
      // Legacy o1 series
      { id: "o1", ...modelMetadata["o1"] },
      { id: "o1-mini", ...modelMetadata["o1-mini"] },
      // Embeddings
      { id: "text-embedding-3-large", ...modelMetadata["text-embedding-3-large"] },
      { id: "text-embedding-3-small", ...modelMetadata["text-embedding-3-small"] }
    ];
  }
  /**
   * Format model ID into display name
   */
  formatModelName(id) {
    return id.replace("gpt-5.2", "GPT-5.2").replace("gpt-", "GPT-").replace("-turbo", " Turbo").replace("-mini", " Mini").replace("-thinking", " Thinking").replace("-codex", " Codex").replace("-pro", " Pro").replace("-deep-research", " Deep Research").replace("-preview", " Preview").replace(/-(\d{4}-\d{2}-\d{2})/, " ($1)");
  }
  /**
   * Infer metadata for unknown models based on ID patterns
   */
  inferModelMetadata(id) {
    if (id.includes("embedding")) {
      return {
        capabilities: ["embedding"],
        contextWindow: 8191
      };
    }
    if (id.startsWith("gpt-5.2")) {
      const isReasoning = id.includes("thinking") || id.includes("pro");
      return {
        capabilities: isReasoning ? ["chat", "vision", "function_calling", "reasoning"] : ["chat", "vision", "function_calling"],
        contextWindow: 1e6,
        maxOutputTokens: 1e5
      };
    }
    if (id.startsWith("o1") || id.startsWith("o3") || id.startsWith("o4")) {
      const isDeepResearch = id.includes("deep-research");
      return {
        capabilities: ["chat", "reasoning", "function_calling"],
        contextWindow: 2e5,
        maxOutputTokens: 1e5,
        // Deep research models have web access
        ...isDeepResearch && { description: "Autonomous research with web access" }
      };
    }
    if (id.startsWith("gpt-4o")) {
      return {
        capabilities: ["chat", "vision", "function_calling"],
        contextWindow: 128e3,
        maxOutputTokens: 16384
      };
    }
    if (id.startsWith("gpt-4")) {
      return {
        capabilities: ["chat", "function_calling"],
        contextWindow: 128e3,
        maxOutputTokens: 4096
      };
    }
    if (id.startsWith("gpt-3.5")) {
      return {
        capabilities: ["chat", "function_calling"],
        contextWindow: 16385,
        maxOutputTokens: 4096
      };
    }
    return {
      capabilities: ["chat"]
    };
  }
  /**
   * Check if a model is an o-series reasoning model
   */
  isReasoningModel(model) {
    return model.startsWith("o1") || model.startsWith("o3") || model.startsWith("o4") || model.includes("-thinking");
  }
  buildChatRequestBody(model, params) {
    const messages = params.messages || [{ role: "user", content: params.prompt }];
    return {
      model,
      messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 1024,
      ...this.filterParams(params)
    };
  }
  filterParams(params) {
    const { messages, prompt, temperature, maxTokens, ...rest } = params;
    return rest;
  }
  /**
   * Build request body for Responses API
   * Supports GPT-5.2 and o-series models with full reasoning and preamble support
   */
  buildResponsesRequestBody(model, params) {
    const body = {
      model
    };
    if (params.messages) {
      body.input = params.messages;
    } else if (params.prompt) {
      body.input = params.prompt;
    }
    if (params.previousResponseId) {
      body.previous_response_id = params.previousResponseId;
    }
    if (params.instructions || params.systemPrompt || params.system) {
      body.instructions = params.instructions || params.systemPrompt || params.system;
    }
    if (params.temperature !== void 0) {
      body.temperature = this.isReasoningModel(model) ? 1 : params.temperature;
    }
    if (params.maxTokens !== void 0) {
      body.max_output_tokens = params.maxTokens;
    }
    if (params.tools) {
      body.tools = params.tools;
    }
    if (params.toolChoice) {
      body.tool_choice = params.toolChoice;
    }
    if (params.enablePreambles !== void 0) {
      body.enable_preambles = params.enablePreambles;
    }
    if (params.reasoningEffort || this.isReasoningModel(model)) {
      const reasoning = {};
      if (params.reasoningEffort) {
        reasoning.effort = params.reasoningEffort;
      }
      if (params.showReasoning !== void 0) {
        reasoning.show_reasoning = params.showReasoning;
      }
      if (Object.keys(reasoning).length > 0) {
        body.reasoning = reasoning;
      }
    }
    if (params.compactMode) {
      body.compact = true;
    }
    if (params.responseFormat === "json" || params.responseFormat === "json_schema") {
      body.text = {
        format: params.responseFormat === "json_schema" ? { type: "json_schema", json_schema: params.jsonSchema } : { type: "json_object" }
      };
    }
    if (params.parallelToolCalls !== void 0) {
      body.parallel_tool_calls = params.parallelToolCalls;
    }
    return body;
  }
  /**
   * Normalize Responses API response
   * Handles message, reasoning, preamble, and tool call outputs
   */
  normalizeResponsesResponse(raw) {
    const textContent = raw.output?.filter((o) => o.type === "message").flatMap((o) => o.content || []).filter((c) => c.type === "output_text").map((c) => c.text).join("\n") || "";
    const reasoningContent = raw.output?.filter((o) => o.type === "reasoning").flatMap((o) => o.content || []).filter((c) => c.type === "reasoning_text").map((c) => c.text).join("\n") || void 0;
    const preambles = raw.output?.filter((o) => o.type === "preamble").map((o) => o.preamble_text).filter(Boolean);
    const toolCalls = raw.output?.filter((o) => o.type === "tool_call").map((tc) => ({
      id: tc.id,
      type: "function",
      function: {
        name: tc.name || "",
        arguments: tc.arguments || "{}"
      }
    }));
    return {
      provider: "openai",
      model: raw.model,
      content: textContent,
      usage: {
        promptTokens: raw.usage?.input_tokens || 0,
        completionTokens: raw.usage?.output_tokens || 0,
        totalTokens: raw.usage?.total_tokens || 0
      },
      finishReason: raw.status === "completed" ? toolCalls && toolCalls.length > 0 ? "tool_calls" : "stop" : raw.status === "incomplete" ? "length" : "error",
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : void 0,
      metadata: {
        id: raw.id,
        createdAt: raw.created_at,
        status: raw.status,
        // Include response ID for conversation continuity
        responseId: raw.id,
        // Include reasoning output if present (o-series models)
        reasoning: reasoningContent,
        // Include preambles if present (GPT-5.2+)
        preambles: preambles && preambles.length > 0 ? preambles : void 0,
        // Include token breakdown
        reasoningTokens: raw.usage?.reasoning_tokens,
        cachedTokens: raw.usage?.cached_tokens
      }
    };
  }
  normalizeChatResponse(raw) {
    const choice = raw.choices?.[0];
    return {
      provider: "openai",
      model: raw.model,
      content: choice?.message?.content || "",
      usage: {
        promptTokens: raw.usage?.prompt_tokens || 0,
        completionTokens: raw.usage?.completion_tokens || 0,
        totalTokens: raw.usage?.total_tokens || 0
      },
      finishReason: normalizeFinishReason(choice?.finish_reason),
      toolCalls: choice?.message?.tool_calls?.map((tc) => ({
        id: tc.id,
        type: tc.type,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments
        }
      })),
      metadata: {
        id: raw.id,
        created: raw.created,
        systemFingerprint: raw.system_fingerprint
      }
    };
  }
  normalizeEmbeddingResponse(raw) {
    return {
      provider: "openai",
      model: raw.model,
      embeddings: raw.data.map((d) => d.embedding),
      usage: {
        promptTokens: raw.usage.prompt_tokens,
        totalTokens: raw.usage.total_tokens
      },
      metadata: {}
    };
  }
};
var openaiProvider = new OpenAIProvider();
var HUGGINGFACE_ROUTER_URL = "https://router.huggingface.co";
function hasImagePart(messages) {
  return Boolean(
    messages?.some(
      (m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image_url")
    )
  );
}
var HuggingFaceProvider = class {
  name = "huggingface";
  supportedOperations = [
    "text.generation",
    "chat.completions",
    "image.description",
    "embeddings"
  ];
  async execute(options) {
    const { model, params, apiKey, timeout } = options;
    const url = `${HUGGINGFACE_ROUTER_URL}/v1/chat/completions`;
    const body = this.buildChatBody(model, params);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: timeout ? AbortSignal.timeout(timeout) : void 0
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const errorMsg = typeof error.error === "object" ? error.error?.message : error.error;
      throw new Error(`HuggingFace API error: ${errorMsg || response.statusText}`);
    }
    const raw = await response.json();
    return this.normalizeChatResponse(raw);
  }
  async embed(options) {
    const { model, params, apiKey, timeout } = options;
    const url = `${HUGGINGFACE_ROUTER_URL}/v1/embeddings`;
    const body = {
      model,
      input: params.input || params.text
    };
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: timeout ? AbortSignal.timeout(timeout) : void 0
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const errorMsg = typeof error.error === "object" ? error.error?.message : error.error;
      throw new Error(`HuggingFace API error: ${errorMsg || response.statusText}`);
    }
    const raw = await response.json();
    return this.normalizeEmbeddingResponse(raw, model);
  }
  validateParams(operation, params) {
    const errors = [];
    if (operation === "text.generation" || operation === "chat.completions") {
      if (!params.messages && !params.prompt) {
        errors.push("Either messages or prompt is required");
      }
    } else if (operation === "image.description") {
      const messages = params.messages;
      if (!messages) {
        errors.push("messages is required for image.description");
      } else if (!hasImagePart(messages)) {
        errors.push(
          "image.description requires a message containing an image_url part; none was present"
        );
      }
    } else if (operation === "embeddings") {
      if (!params.input && !params.text) {
        errors.push("Either input or text is required for embeddings");
      }
    }
    return { valid: errors.length === 0, errors };
  }
  estimateTokens(text3) {
    return Math.ceil(text3.length / 4);
  }
  /**
   * List popular models available via HuggingFace Inference API
   * This is a curated list of well-supported models
   */
  async listModels(_apiKey) {
    return [
      // Vision-language models.
      //
      // NOT VERIFIED AGAINST THE ROUTER. This is a curated list, and curation
      // is a claim about the world that nobody here has checked — no request
      // has been made with these ids because no HuggingFace credential is
      // stored for any user on this stack (measured 7 Aug 2026: the status
      // endpoint says configured, /execute returns 401). They are listed so
      // that capability selection has candidates and so the first real failure
      // is a specific "model not served" from the router rather than an empty
      // list that reads as "vision is impossible".
      {
        id: "Qwen/Qwen2.5-VL-7B-Instruct",
        name: "Qwen 2.5 VL 7B Instruct",
        description: "Vision-language model: describes and reasons over images",
        contextWindow: 32768,
        maxOutputTokens: 4096,
        capabilities: ["chat", "vision"]
      },
      {
        id: "meta-llama/Llama-3.2-11B-Vision-Instruct",
        name: "Llama 3.2 11B Vision Instruct",
        description: "Meta vision-language model",
        contextWindow: 128e3,
        maxOutputTokens: 4096,
        capabilities: ["chat", "vision"]
      },
      {
        id: "HuggingFaceM4/idefics2-8b",
        name: "IDEFICS2 8B",
        description: "Open multimodal model for image understanding",
        contextWindow: 32768,
        maxOutputTokens: 2048,
        capabilities: ["chat", "vision"]
      },
      // Meta Llama 3.x series
      {
        id: "meta-llama/Llama-3.3-70B-Instruct",
        name: "Llama 3.3 70B Instruct",
        description: "Latest Llama with improved reasoning and multilingual",
        contextWindow: 128e3,
        maxOutputTokens: 8192,
        capabilities: ["chat", "function_calling"]
      },
      {
        id: "meta-llama/Llama-3.2-3B-Instruct",
        name: "Llama 3.2 3B Instruct",
        description: "Efficient small Llama for edge deployment",
        contextWindow: 128e3,
        maxOutputTokens: 8192,
        capabilities: ["chat"]
      },
      {
        id: "meta-llama/Llama-3.2-1B-Instruct",
        name: "Llama 3.2 1B Instruct",
        description: "Smallest Llama for low-resource environments",
        contextWindow: 128e3,
        maxOutputTokens: 8192,
        capabilities: ["chat"]
      },
      {
        id: "meta-llama/Llama-3.1-8B-Instruct",
        name: "Llama 3.1 8B Instruct",
        description: "Versatile medium-size Llama model",
        contextWindow: 128e3,
        maxOutputTokens: 8192,
        capabilities: ["chat", "function_calling"]
      },
      {
        id: "meta-llama/Llama-3.1-70B-Instruct",
        name: "Llama 3.1 70B Instruct",
        description: "Powerful large Llama model",
        contextWindow: 128e3,
        maxOutputTokens: 8192,
        capabilities: ["chat", "function_calling"]
      },
      // Mistral models on HuggingFace
      {
        id: "mistralai/Mistral-7B-Instruct-v0.3",
        name: "Mistral 7B Instruct v0.3",
        description: "Efficient open-weight Mistral model",
        contextWindow: 32768,
        maxOutputTokens: 8192,
        capabilities: ["chat", "function_calling"]
      },
      {
        id: "mistralai/Mixtral-8x7B-Instruct-v0.1",
        name: "Mixtral 8x7B Instruct",
        description: "Mixture of experts model",
        contextWindow: 32768,
        maxOutputTokens: 8192,
        capabilities: ["chat"]
      },
      {
        id: "mistralai/Mistral-Nemo-Instruct-2407",
        name: "Mistral Nemo 12B",
        description: "Compact yet capable Mistral model",
        contextWindow: 128e3,
        maxOutputTokens: 8192,
        capabilities: ["chat", "function_calling"]
      },
      // Microsoft Phi series
      {
        id: "microsoft/Phi-3.5-mini-instruct",
        name: "Phi 3.5 Mini",
        description: "Small but powerful reasoning model",
        contextWindow: 128e3,
        maxOutputTokens: 4096,
        capabilities: ["chat"]
      },
      {
        id: "microsoft/Phi-3-mini-4k-instruct",
        name: "Phi 3 Mini 4K",
        description: "Efficient Microsoft model",
        contextWindow: 4096,
        maxOutputTokens: 4096,
        capabilities: ["chat"]
      },
      {
        id: "microsoft/Phi-3-medium-128k-instruct",
        name: "Phi 3 Medium 128K",
        description: "Medium-size with long context",
        contextWindow: 128e3,
        maxOutputTokens: 4096,
        capabilities: ["chat"]
      },
      // Qwen models
      {
        id: "Qwen/Qwen2.5-72B-Instruct",
        name: "Qwen 2.5 72B Instruct",
        description: "Powerful multilingual model from Alibaba",
        contextWindow: 131072,
        maxOutputTokens: 8192,
        capabilities: ["chat", "function_calling"]
      },
      {
        id: "Qwen/Qwen2.5-7B-Instruct",
        name: "Qwen 2.5 7B Instruct",
        description: "Efficient Qwen model",
        contextWindow: 131072,
        maxOutputTokens: 8192,
        capabilities: ["chat", "function_calling"]
      },
      {
        id: "Qwen/Qwen2.5-Coder-32B-Instruct",
        name: "Qwen 2.5 Coder 32B",
        description: "Specialized for code generation",
        contextWindow: 131072,
        maxOutputTokens: 8192,
        capabilities: ["chat", "function_calling"]
      },
      // DeepSeek
      {
        id: "deepseek-ai/DeepSeek-V3",
        name: "DeepSeek V3",
        description: "State-of-the-art open model from DeepSeek",
        contextWindow: 128e3,
        maxOutputTokens: 8192,
        capabilities: ["chat", "function_calling", "reasoning"]
      },
      {
        id: "deepseek-ai/DeepSeek-Coder-V2-Instruct",
        name: "DeepSeek Coder V2",
        description: "Advanced code generation model",
        contextWindow: 128e3,
        maxOutputTokens: 8192,
        capabilities: ["chat"]
      },
      // Embedding models
      {
        id: "sentence-transformers/all-MiniLM-L6-v2",
        name: "MiniLM L6 v2",
        description: "Fast lightweight embeddings, 384 dimensions",
        contextWindow: 512,
        capabilities: ["embedding"]
      },
      {
        id: "BAAI/bge-large-en-v1.5",
        name: "BGE Large English v1.5",
        description: "High-quality English embeddings, 1024 dimensions",
        contextWindow: 512,
        capabilities: ["embedding"]
      },
      {
        id: "BAAI/bge-m3",
        name: "BGE M3",
        description: "Multilingual, multi-granularity embeddings",
        contextWindow: 8192,
        capabilities: ["embedding"]
      },
      {
        id: "intfloat/multilingual-e5-large-instruct",
        name: "E5 Large Multilingual",
        description: "Instruction-tuned multilingual embeddings",
        contextWindow: 512,
        capabilities: ["embedding"]
      }
    ];
  }
  buildChatBody(model, params) {
    const messages = params.messages;
    const finalMessages = messages || [
      { role: "user", content: params.prompt }
    ];
    const body = {
      model,
      messages: finalMessages,
      max_tokens: params.maxTokens ?? 256
    };
    if (params.temperature !== void 0) body.temperature = params.temperature;
    return body;
  }
  normalizeChatResponse(raw) {
    const choice = raw.choices?.[0];
    return {
      provider: "huggingface",
      model: raw.model,
      content: choice?.message?.content || "",
      usage: {
        promptTokens: raw.usage?.prompt_tokens || 0,
        completionTokens: raw.usage?.completion_tokens || 0,
        totalTokens: raw.usage?.total_tokens || 0
      },
      finishReason: normalizeFinishReason(choice?.finish_reason),
      metadata: {
        id: raw.id,
        created: raw.created
      }
    };
  }
  normalizeEmbeddingResponse(raw, model) {
    let embeddings;
    if (raw.data && Array.isArray(raw.data)) {
      embeddings = raw.data.map((d) => d.embedding);
    } else if (raw.embeddings) {
      embeddings = raw.embeddings;
    } else {
      embeddings = [];
    }
    return {
      provider: "huggingface",
      model,
      embeddings,
      usage: {
        promptTokens: 0,
        totalTokens: 0
      },
      metadata: {}
    };
  }
};
var huggingfaceProvider = new HuggingFaceProvider();
var ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
var ANTHROPIC_VERSION = "2023-06-01";
var AnthropicProvider = class {
  name = "anthropic";
  // image.description was already possible here and nobody could ask for it.
  // Every Claude model below declares `vision`, and convertMessages has
  // translated OpenAI-style image_url parts — including base64 data URIs —
  // into Anthropic image blocks the whole time. The capability existed; the
  // operation name to reach it did not.
  supportedOperations = ["chat.completions", "messages", "image.description"];
  async execute(options) {
    const { operation, model, params, apiKey, timeout } = options;
    if (operation !== "chat.completions" && operation !== "messages" && operation !== "image.description") {
      throw new Error(`Anthropic provider does not support operation: ${operation}`);
    }
    const url = `${ANTHROPIC_BASE_URL}/messages`;
    const body = this.buildMessagesRequestBody(model, params);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION
      },
      body: JSON.stringify(body),
      signal: timeout ? AbortSignal.timeout(timeout) : void 0
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Anthropic API error: ${error.error?.message || response.statusText}`);
    }
    const raw = await response.json();
    return this.normalizeMessagesResponse(raw);
  }
  async embed(_options) {
    throw new Error("Anthropic does not provide native embeddings. Consider using Voyage AI.");
  }
  validateParams(operation, params) {
    const errors = [];
    if (operation === "chat.completions" || operation === "messages") {
      if (!params.messages && !params.prompt) {
        errors.push("Either messages or prompt is required");
      }
    } else if (operation === "image.description") {
      const messages = params.messages;
      const hasImage = messages?.some(
        (m) => Array.isArray(m.content) && m.content.some(
          (p) => p?.type === "image_url" || p?.type === "image"
        )
      );
      if (!messages) errors.push("messages is required for image.description");
      else if (!hasImage) {
        errors.push(
          "image.description requires a message containing an image part; none was present"
        );
      }
    }
    return { valid: errors.length === 0, errors };
  }
  estimateTokens(text3) {
    return Math.ceil(text3.length / 4);
  }
  /**
   * List available Claude models.
   *
   * ASK THE PROVIDER FIRST. This used to say "Anthropic doesn't have a models
   * list API, so this returns a curated list", which was true when it was
   * written and is not true now: GET https://api.anthropic.com/v1/models
   * answers, and on 24 Aug 2026 it returned eight ids — claude-opus-5,
   * claude-sonnet-5, claude-fable-5, claude-opus-4-8, claude-opus-4-7,
   * claude-sonnet-4-6, claude-opus-4-6, claude-opus-4-5-20251101.
   *
   * Neither claude-sonnet-4-20250514 (which the catalog advertises as the
   * anthropic default) nor claude-3-5-sonnet-20241022 (which the coordinator
   * declares) is among them, and both were measured returning 502 the same day.
   * A hand-curated list is a snapshot of a moving target, and this one had
   * drifted far enough to break the default caller.
   *
   * The curated list stays as the FALLBACK, for the case that matters: no key,
   * no network, or a provider outage. A list that cannot be fetched is not the
   * same as a provider with no models, and returning nothing would take the
   * whole stack down for a failure to ask.
   *
   * Pricing and capability metadata are merged from the curated entries by id,
   * because the provider's list carries neither.
   */
  async listModels(apiKey) {
    if (apiKey) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/models?limit=50", {
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
        });
        if (res.ok) {
          const body = await res.json();
          const live = (body.data ?? []).filter((m) => m.id);
          if (live.length) {
            const curated = new Map(this.curatedModels().map((m) => [m.id, m]));
            return live.map((m) => {
              const known = curated.get(m.id);
              return known ? { ...known, name: m.display_name || known.name } : {
                id: m.id,
                name: m.display_name || m.id,
                // Said plainly rather than guessed. An unpriced model must
                // not silently inherit another model's rate.
                description: "Listed by the Anthropic API; no local pricing or capability data on file.",
                contextWindow: 2e5,
                maxOutputTokens: 8192,
                capabilities: ["chat"]
              };
            });
          }
        }
      } catch {
      }
    }
    return this.curatedModels();
  }
  /**
   * The measured fallback list, used when the provider cannot be asked.
   */
  curatedModels() {
    return [
      {
        id: "claude-sonnet-5",
        name: "Claude Sonnet 5",
        description: "Balanced performance with strong vision. Measured working 7 Aug 2026.",
        contextWindow: 2e5,
        maxOutputTokens: 64e3,
        capabilities: ["chat", "vision", "function_calling", "reasoning"],
        inputPricing: 3,
        outputPricing: 15
      },
      {
        id: "claude-opus-5",
        name: "Claude Opus 5",
        description: "Most capable Claude model. Measured reachable 7 Aug 2026.",
        contextWindow: 2e5,
        maxOutputTokens: 64e3,
        capabilities: ["chat", "vision", "function_calling", "reasoning"],
        inputPricing: 15,
        outputPricing: 75
      },
      {
        id: "claude-haiku-4-5-20251001",
        name: "Claude Haiku 4.5",
        description: "Fast and inexpensive. Measured working 7 Aug 2026.",
        contextWindow: 2e5,
        maxOutputTokens: 32e3,
        capabilities: ["chat", "vision", "function_calling"],
        inputPricing: 1,
        outputPricing: 5
      },
      {
        id: "claude-opus-4-20250514",
        name: "Claude Opus 4",
        description: 'Rejected by the API on 7 Aug 2026 with "model: claude-opus-4-20250514".',
        contextWindow: 2e5,
        maxOutputTokens: 32e3,
        capabilities: ["chat", "vision", "function_calling", "reasoning"],
        inputPricing: 15,
        outputPricing: 75,
        deprecated: true
      },
      // Claude 3.5 series
      {
        id: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        description: "Excellent for complex tasks and coding",
        contextWindow: 2e5,
        maxOutputTokens: 8192,
        capabilities: ["chat", "vision", "function_calling"],
        inputPricing: 3,
        outputPricing: 15
      },
      {
        id: "claude-3-5-haiku-20241022",
        name: "Claude 3.5 Haiku",
        description: "Fast and efficient for everyday tasks",
        contextWindow: 2e5,
        maxOutputTokens: 8192,
        capabilities: ["chat", "vision", "function_calling"],
        inputPricing: 0.8,
        outputPricing: 4
      },
      // Claude 3 series
      {
        id: "claude-3-opus-20240229",
        name: "Claude 3 Opus",
        description: "Previous generation flagship model",
        contextWindow: 2e5,
        maxOutputTokens: 4096,
        capabilities: ["chat", "vision", "function_calling"],
        inputPricing: 15,
        outputPricing: 75
      },
      {
        id: "claude-3-sonnet-20240229",
        name: "Claude 3 Sonnet",
        description: "Previous generation balanced model",
        contextWindow: 2e5,
        maxOutputTokens: 4096,
        capabilities: ["chat", "vision", "function_calling"],
        inputPricing: 3,
        outputPricing: 15,
        deprecated: true
      },
      {
        id: "claude-3-haiku-20240307",
        name: "Claude 3 Haiku",
        description: "Previous generation fast model",
        contextWindow: 2e5,
        maxOutputTokens: 4096,
        capabilities: ["chat", "vision", "function_calling"],
        inputPricing: 0.25,
        outputPricing: 1.25,
        deprecated: true
      }
    ];
  }
  buildMessagesRequestBody(model, params) {
    const messages = this.convertMessages(
      params.messages || []
    );
    if (!messages.length && params.prompt) {
      messages.push({ role: "user", content: params.prompt });
    }
    const body = {
      model,
      messages,
      max_tokens: params.maxTokens ?? params.max_tokens ?? 1024
    };
    const systemFromMessages = (params.messages || []).filter((m) => m?.role === "system").map((m) => typeof m.content === "string" ? m.content : JSON.stringify(m.content)).filter((s) => s && s.trim() !== "").join("\n\n");
    const system = params.system || params.systemPrompt || (systemFromMessages || void 0);
    if (system) {
      body.system = system;
    }
    if (params.temperature !== void 0) {
      body.temperature = params.temperature;
    }
    if (params.tools) {
      body.tools = this.convertTools(params.tools);
    }
    if (params.stopSequences || params.stop) {
      body.stop_sequences = params.stopSequences || params.stop;
    }
    if (params.topP !== void 0 || params.top_p !== void 0) {
      body.top_p = params.topP ?? params.top_p;
    }
    if (params.topK !== void 0 || params.top_k !== void 0) {
      body.top_k = params.topK ?? params.top_k;
    }
    return body;
  }
  convertMessages(messages) {
    const filtered = messages.filter((m) => m.role !== "system");
    return filtered.map((msg) => {
      if (Array.isArray(msg.content)) {
        return {
          role: msg.role,
          content: msg.content.map((item) => {
            if (typeof item === "string") {
              return { type: "text", text: item };
            }
            if (typeof item === "object" && item !== null) {
              const obj = item;
              if (obj.type === "image_url") {
                const url = obj.image_url?.url;
                if (url?.startsWith("data:")) {
                  const [header, data] = url.split(",");
                  const mediaType = header.match(/data:([^;]+)/)?.[1] || "image/jpeg";
                  return {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: mediaType,
                      data
                    }
                  };
                }
                return {
                  type: "image",
                  source: {
                    type: "url",
                    url
                  }
                };
              }
              if (obj.type === "text") {
                return { type: "text", text: obj.text };
              }
            }
            return { type: "text", text: String(item) };
          })
        };
      }
      return {
        role: msg.role,
        content: msg.content
      };
    });
  }
  convertTools(tools) {
    return tools.map((tool) => {
      if (tool.type === "function" && tool.function) {
        const fn = tool.function;
        return {
          name: fn.name,
          description: fn.description || "",
          input_schema: fn.parameters || { type: "object", properties: {} }
        };
      }
      return {
        name: tool.name,
        description: tool.description || "",
        input_schema: tool.input_schema || { type: "object", properties: {} }
      };
    });
  }
  normalizeMessagesResponse(raw) {
    const textContent = raw.content.filter((block) => block.type === "text").map((block) => block.text || "").join("\n");
    const toolCalls = raw.content.filter((block) => block.type === "tool_use").map((block) => ({
      id: block.id || "",
      type: "function",
      function: {
        name: block.name || "",
        arguments: JSON.stringify(block.input || {})
      }
    }));
    return {
      provider: "anthropic",
      model: raw.model,
      content: textContent,
      usage: {
        promptTokens: raw.usage.input_tokens,
        completionTokens: raw.usage.output_tokens,
        totalTokens: raw.usage.input_tokens + raw.usage.output_tokens
      },
      finishReason: this.normalizeStopReason(raw.stop_reason),
      toolCalls: toolCalls.length > 0 ? toolCalls : void 0,
      metadata: {
        id: raw.id,
        stopSequence: raw.stop_sequence
      }
    };
  }
  normalizeStopReason(stopReason) {
    if (!stopReason) return "stop";
    switch (stopReason) {
      case "end_turn":
      case "stop_sequence":
        return "stop";
      case "max_tokens":
        return "length";
      case "tool_use":
        return "tool_calls";
      default:
        return normalizeFinishReason(stopReason);
    }
  }
};
var anthropicProvider = new AnthropicProvider();
var modelsClient = createModelsClient();
var INTERNAL_HEADERS = { "X-Service-Auth": "internal" };
var SymbiaLabsProvider = class {
  name = "symbia-labs";
  supportedOperations = ["chat.completions", "completions"];
  async execute(options) {
    const { operation, model, params, timeout } = options;
    if (operation !== "chat.completions" && operation !== "completions") {
      throw new Error(`symbia-labs provider does not support operation: ${operation}`);
    }
    const body = this.buildRequestBody(model, params);
    let raw;
    try {
      raw = await modelsClient.chatCompletions(body, {
        headers: INTERNAL_HEADERS,
        timeout
      });
    } catch (error) {
      throw new Error(
        `symbia-labs API error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return this.normalizeResponse(raw);
  }
  /**
   * GAP, not migrated: the models service has no `/v1/embeddings` route.
   * Confirmed 24 Aug 2026 against models/server/src/routes.ts — only
   * chat.completions, model list/get/load/unload, vision, and stats are
   * mounted. This method has been calling a path that 404s since it was
   * written; nothing currently invokes `embed()` on this provider, which is
   * the only reason it has not surfaced. Left as a direct fetch, unwrapped,
   * because wrapping a call the server cannot answer would misrepresent it
   * as a real client method. Recorded in catalog as a platform gap rather
   * than silently fixed or silently left; do not build embeddings support
   * on this path until the route exists.
   */
  async embed(options) {
    const { model, params, timeout } = options;
    const MODELS_SERVICE_URL = process.env.MODELS_SERVICE_URL || "http://localhost:5008";
    const url = `${MODELS_SERVICE_URL}/v1/embeddings`;
    const body = {
      model,
      input: params.input || params.text
    };
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Auth": "internal"
      },
      body: JSON.stringify(body),
      signal: timeout ? AbortSignal.timeout(timeout) : void 0
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`symbia-labs embed error: ${error.error || response.statusText}`);
    }
    const raw = await response.json();
    return {
      provider: "symbia-labs",
      model: raw.model,
      embeddings: raw.data.map((d) => d.embedding),
      usage: {
        promptTokens: raw.usage.prompt_tokens,
        totalTokens: raw.usage.total_tokens
      },
      metadata: {}
    };
  }
  validateParams(operation, params) {
    const errors = [];
    if (operation === "chat.completions" || operation === "completions") {
      if (!params.messages && !params.prompt) {
        errors.push("Either messages or prompt is required");
      }
    } else if (operation === "embeddings") {
      if (!params.input && !params.text) {
        errors.push("Either input or text is required for embeddings");
      }
    }
    return { valid: errors.length === 0, errors };
  }
  estimateTokens(text3) {
    return Math.ceil(text3.length / 4);
  }
  /**
   * List available models from the models service
   */
  async listModels() {
    try {
      const data = await modelsClient.listModels({ headers: INTERNAL_HEADERS });
      const rows = Array.isArray(data.data) ? data.data : [];
      return rows.filter((m) => (m?.symbia?.source ?? "local") === "local" && (m?.owned_by ?? "symbia-labs") === "symbia-labs").map((m) => ({
        id: String(m.id),
        name: String(m.name ?? m.id),
        description: m.memoryUsageMB ? `Local GGUF model (${m.memoryUsageMB}MB)` : "Local GGUF model",
        // The service answers `context_length`; `contextLength` was never a
        // field it sends, so this read undefined for every model.
        contextWindow: Number(m.context_length ?? m.contextLength ?? 0) || void 0,
        capabilities: (Array.isArray(m.capabilities) ? m.capabilities : ["chat"]).map((c) => c === "completion" ? "completion" : c === "embedding" ? "embedding" : "chat"),
        // Local models have no API pricing
        inputPricing: 0,
        outputPricing: 0
      }));
    } catch (error) {
      console.warn("[symbia-labs] Error fetching models:", error);
      return [];
    }
  }
  buildRequestBody(model, params) {
    const messages = params.messages ?? [{ role: "user", content: params.prompt }];
    return {
      model,
      messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 1024,
      stream: false
      // Non-streaming for now
    };
  }
  normalizeResponse(raw) {
    const choice = raw.choices?.[0];
    return {
      provider: "symbia-labs",
      model: raw.model,
      content: choice?.message?.content || "",
      usage: {
        promptTokens: raw.usage?.prompt_tokens || 0,
        completionTokens: raw.usage?.completion_tokens || 0,
        totalTokens: raw.usage?.total_tokens || 0
      },
      finishReason: normalizeFinishReason(choice?.finish_reason),
      metadata: {
        id: raw.id,
        created: raw.created,
        local: true
      }
    };
  }
};
var symbiaLabsProvider = new SymbiaLabsProvider();
function initializeProviders() {
  registerProvider(openaiProvider);
  registerProvider(anthropicProvider);
  registerProvider(huggingfaceProvider);
  registerProvider(symbiaLabsProvider);
  console.log(`[integrations] Registered providers: ${getRegisteredProviders().join(", ")}`);
}
var IDENTITY_SERVICE_URL = resolveServiceUrl(ServiceId.IDENTITY);
async function getCredential(userId, orgId, provider, authToken) {
  try {
    const url = `${IDENTITY_SERVICE_URL}/api/internal/credentials/${userId}/${provider}`;
    const headers = {
      "X-Service-Id": "integrations"
    };
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
    if (orgId) {
      headers["X-Org-Id"] = orgId;
    }
    console.log(`[integrations] Credential lookup - userId: ${userId}, orgId: ${orgId}, provider: ${provider}`);
    console.log(`[integrations] Calling Identity: ${url}`);
    const response = await fetch(url, { headers });
    console.log(`[integrations] Identity response status: ${response.status}`);
    if (!response.ok) {
      if (response.status === 404) {
        const body = await response.text();
        console.log(`[integrations] Credential not found - response: ${body}`);
        return null;
      }
      console.error(`[integrations] Failed to fetch credential: ${response.statusText}`);
      return null;
    }
    const result = await response.json();
    console.log(`[integrations] Credential found - has apiKey: ${!!result.apiKey}, isProxy: ${result.isProxy}, credentialId: ${result.credentialId}`);
    return result;
  } catch (error) {
    console.error(`[integrations] Error fetching credential:`, error);
    return null;
  }
}
var auth = createAuthMiddleware({
  identityServiceUrl: config.identityServiceUrl,
  adminEntitlements: ["integrations:admin", "cap:integrations.admin"],
  enableImpersonation: true,
  logger: (level, message) => console.log(`[Integrations Auth] ${message}`)
});
var {
  getCurrentUser,
  requireAuth,
  optionalAuth,
  requireAdmin,
  requireSuperAdmin,
  authClient
} = auth;
var warnedUnsecured = false;
function warnUnsecuredServiceAuth() {
  if (warnedUnsecured) return;
  warnedUnsecured = true;
  console.warn(
    '[Integrations Auth] WARNING: service-to-service calls are admitted on the literal header value "internal". Any process on this machine can present it. Set INTEGRATIONS_INTERNAL_SERVICE_TOKEN to require a real secret. This is the local development posture and must not be the deployed one.'
  );
}
async function authMiddleware(req, res, next) {
  let user = await getCurrentUser(req);
  if (!user) {
    const offered = req.headers["x-service-auth"];
    const expected = process.env.INTEGRATIONS_INTERNAL_SERVICE_TOKEN;
    const ok = expected ? offered === expected : offered === "internal";
    if (ok) {
      const orgHeader = req.headers["x-org-id"];
      const principalId = process.env.INTEGRATIONS_SERVICE_PRINCIPAL_ID || "650e8400-e29b-41d4-a716-446655440000";
      user = {
        id: principalId,
        email: "service@internal",
        name: "Internal Service",
        type: "agent",
        isSuperAdmin: true,
        orgId: orgHeader,
        organizations: orgHeader ? [{ id: orgHeader, role: "admin" }] : [],
        entitlements: ["cap:integrations.admin", "integrations:admin"],
        roles: []
      };
      if (!expected) warnUnsecuredServiceAuth();
    }
  }
  if (!user) {
    res.status(401).json({
      error: "Authentication required",
      // Name the other door. The whole cost of this defect was that the error
      // described one way in and there were two.
      accepts: 'a user bearer token, or X-Service-Auth for service-to-service calls (INTEGRATIONS_INTERNAL_SERVICE_TOKEN when configured, otherwise the literal "internal" in local development)'
    });
    return;
  }
  req.user = user;
  const rawToken = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : void 0) ?? req.cookies?.token;
  req.token = rawToken;
  const headerOrgId = req.headers["x-org-id"];
  let orgId = headerOrgId || user.orgId || user.organizations[0]?.id;
  if (!orgId && process.env.NODE_ENV !== "production") {
    orgId = "dev-default-org";
  }
  if (!orgId) {
    res.status(400).json({ error: "Organization context required. Provide X-Org-Id header." });
    return;
  }
  req.user = { ...user, orgId };
  try {
    runWithRLSContext(
      {
        orgId: orgId ?? "",
        userId: user.id,
        isSuperAdmin: user.isSuperAdmin,
        capabilities: user.entitlements,
        serviceId: "integrations"
      },
      () => next()
    );
  } catch (error) {
    console.error("[Integrations Auth] Failed to establish RLS context:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to establish request security context" });
    }
  }
}
async function fetchAndParseOpenAPI(config2) {
  try {
    let spec;
    if (config2.spec) {
      spec = config2.spec;
    } else if (config2.specUrl) {
      const response = await fetch(config2.specUrl, {
        headers: { Accept: "application/json, application/yaml" },
        signal: AbortSignal.timeout(3e4)
      });
      if (!response.ok) {
        return {
          success: false,
          operations: [],
          namespace: {},
          error: `Failed to fetch spec: ${response.status} ${response.statusText}`
        };
      }
      const contentType = response.headers.get("content-type") || "";
      const text3 = await response.text();
      const isYaml = contentType.includes("yaml") || config2.specUrl.endsWith(".yaml") || config2.specUrl.endsWith(".yml");
      if (isYaml) {
        spec = import_yaml.default.parse(text3);
      } else {
        spec = JSON.parse(text3);
      }
    } else {
      return {
        success: false,
        operations: [],
        namespace: {},
        error: "No spec URL or inline spec provided"
      };
    }
    return parseOpenAPISpec(spec, config2.serverUrl);
  } catch (error) {
    return {
      success: false,
      operations: [],
      namespace: {},
      error: error instanceof Error ? error.message : "Failed to parse spec"
    };
  }
}
function parseOpenAPISpec(spec, serverUrlOverride) {
  const operations = [];
  const namespace = {};
  let serverUrl;
  const specServerUrl = spec.servers?.[0]?.url;
  if (serverUrlOverride && specServerUrl) {
    if (specServerUrl.startsWith("/")) {
      serverUrl = serverUrlOverride.replace(/\/$/, "") + specServerUrl;
    } else if (specServerUrl.startsWith("http")) {
      serverUrl = serverUrlOverride;
    } else {
      serverUrl = serverUrlOverride.replace(/\/$/, "") + "/" + specServerUrl;
    }
  } else {
    serverUrl = serverUrlOverride || specServerUrl;
  }
  let authType = "none";
  if (spec.components?.securitySchemes) {
    const schemes = Object.values(spec.components.securitySchemes);
    for (const scheme of schemes) {
      if (scheme.type === "http" && scheme.scheme === "bearer") {
        authType = "bearer";
        break;
      }
      if (scheme.type === "apiKey") {
        authType = "apiKey";
        break;
      }
      if (scheme.type === "http" && scheme.scheme === "basic") {
        authType = "basic";
        break;
      }
      if (scheme.type === "oauth2") {
        authType = "oauth2";
        break;
      }
    }
  }
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    const methods = [];
    if (pathItem.get) methods.push({ method: "GET", operation: pathItem.get });
    if (pathItem.post) methods.push({ method: "POST", operation: pathItem.post });
    if (pathItem.put) methods.push({ method: "PUT", operation: pathItem.put });
    if (pathItem.patch) methods.push({ method: "PATCH", operation: pathItem.patch });
    if (pathItem.delete) methods.push({ method: "DELETE", operation: pathItem.delete });
    if (pathItem.head) methods.push({ method: "HEAD", operation: pathItem.head });
    if (pathItem.options) methods.push({ method: "OPTIONS", operation: pathItem.options });
    for (const { method, operation } of methods) {
      const operationId = operation.operationId || generateOperationId(path, method);
      const id = operationIdToNamespace(operationId);
      const parameters = [];
      for (const param of pathItem.parameters || []) {
        const converted = convertParameter(param);
        if (converted) {
          parameters.push(converted);
        }
      }
      for (const param of operation.parameters || []) {
        const converted = convertParameter(param);
        if (converted) {
          parameters.push(converted);
        }
      }
      let requestBody;
      if (operation.requestBody) {
        const content = operation.requestBody.content;
        const jsonContent = content["application/json"];
        requestBody = {
          required: operation.requestBody.required,
          contentType: "application/json",
          schema: jsonContent?.schema
        };
      }
      let responseSchema;
      const successResponse = operation.responses?.["200"] || operation.responses?.["201"];
      if (successResponse?.content?.["application/json"]?.schema) {
        responseSchema = successResponse.content["application/json"].schema;
      }
      const op = {
        id,
        operationId,
        method,
        path,
        summary: operation.summary,
        description: operation.description,
        tags: operation.tags,
        deprecated: operation.deprecated,
        parameters: parameters.length > 0 ? parameters : void 0,
        requestBody,
        responseSchema
      };
      operations.push(op);
      buildNamespaceTree(namespace, id, op);
    }
  }
  return {
    success: true,
    operations,
    namespace,
    serverUrl,
    info: {
      title: spec.info.title,
      version: spec.info.version,
      description: spec.info.description
    },
    authType
  };
}
function convertParameter(param) {
  if (!param.name || "$ref" in param) {
    return null;
  }
  return {
    name: param.name,
    location: param.in,
    required: param.required || false,
    description: param.description,
    schema: param.schema,
    example: param.example
  };
}
function generateOperationId(path, method) {
  const pathPart = path.replace(/^\/v\d+\//, "").replace(/\{[^}]+\}/g, "").replace(/\//g, "_").replace(/^_|_$/g, "").replace(/_+/g, "_");
  return `${pathPart}_${method.toLowerCase()}`;
}
function operationIdToNamespace(operationId) {
  if (operationId.includes("_")) {
    return operationId.replace(/_/g, ".");
  }
  const parts = operationId.replace(/([A-Z])/g, ".$1").toLowerCase().split(".").filter(Boolean);
  const verbs = ["create", "get", "list", "update", "delete", "patch", "post", "put"];
  if (parts.length > 1 && verbs.includes(parts[0])) {
    const verb = parts.shift();
    parts.push(verb);
  }
  return parts.join(".");
}
function buildNamespaceTree(tree, path, operation) {
  const parts = path.split(".");
  let current = tree;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part]) {
      current[part] = {};
    }
    current = current[part];
  }
  const leaf = parts[parts.length - 1];
  current[leaf] = {
    _operation: operation.id,
    _method: operation.method,
    _path: operation.path
  };
}
async function discoverMCPServer(config2) {
  if (config2.transport === "stdio") {
    return discoverStdioServer(config2);
  } else if (config2.transport === "http" || config2.transport === "websocket") {
    return discoverHttpServer(config2);
  }
  return {
    success: false,
    operations: [],
    namespace: {},
    capabilities: {},
    error: `Unsupported transport: ${config2.transport}`
  };
}
async function discoverStdioServer(config2) {
  if (!config2.command) {
    return {
      success: false,
      operations: [],
      namespace: {},
      capabilities: {},
      error: "No command specified for stdio transport"
    };
  }
  let process2 = null;
  let messageId = 0;
  const pendingRequests = /* @__PURE__ */ new Map();
  try {
    process2 = spawn(config2.command, config2.args || [], {
      env: { ...globalThis.process.env, ...config2.env },
      stdio: ["pipe", "pipe", "pipe"]
    });
    if (!process2.stdin || !process2.stdout) {
      throw new Error("Failed to create process pipes");
    }
    let buffer = "";
    process2.stdout.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line);
          if (message.id !== void 0 && pendingRequests.has(message.id)) {
            const pending = pendingRequests.get(message.id);
            pendingRequests.delete(message.id);
            if (message.error) {
              pending.reject(new Error(message.error.message));
            } else {
              pending.resolve(message.result);
            }
          }
        } catch {
        }
      }
    });
    const sendRequest = (method, params) => {
      return new Promise((resolve, reject) => {
        const id = ++messageId;
        const timeout = setTimeout(() => {
          pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }, 1e4);
        pendingRequests.set(id, {
          resolve: (result) => {
            clearTimeout(timeout);
            resolve(result);
          },
          reject: (error) => {
            clearTimeout(timeout);
            reject(error);
          }
        });
        const message = {
          jsonrpc: "2.0",
          id,
          method,
          params
        };
        process2.stdin.write(JSON.stringify(message) + "\n");
      });
    };
    const initResult = await sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "symbia-integrations", version: "1.0.0" }
    });
    const capabilities = initResult.capabilities;
    const operations = [];
    const namespace = {};
    if (capabilities.tools) {
      const toolsResult = await sendRequest("tools/list");
      for (const tool of toolsResult.tools || []) {
        const op = mcpToolToOperation(tool);
        operations.push(op);
        buildMCPNamespace(namespace, tool.name, op);
      }
    }
    if (capabilities.resources) {
      const resourcesResult = await sendRequest("resources/list");
      for (const resource of resourcesResult.resources || []) {
        const op = mcpResourceToOperation(resource);
        operations.push(op);
        buildMCPNamespace(namespace, `resource.${resource.name}`, op);
      }
    }
    if (capabilities.prompts) {
      const promptsResult = await sendRequest("prompts/list");
      for (const prompt of promptsResult.prompts || []) {
        const op = mcpPromptToOperation(prompt);
        operations.push(op);
        buildMCPNamespace(namespace, `prompt.${prompt.name}`, op);
      }
    }
    return {
      success: true,
      operations,
      namespace,
      capabilities
    };
  } catch (error) {
    return {
      success: false,
      operations: [],
      namespace: {},
      capabilities: {},
      error: error instanceof Error ? error.message : "Failed to connect to MCP server"
    };
  } finally {
    if (process2) {
      process2.kill();
    }
  }
}
async function discoverHttpServer(config2) {
  if (!config2.serverUrl) {
    return {
      success: false,
      operations: [],
      namespace: {},
      capabilities: {},
      error: "No server URL specified for HTTP transport"
    };
  }
  try {
    const sendRequest = async (method, params) => {
      const response = await fetch(config2.serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method,
          params
        }),
        signal: AbortSignal.timeout(1e4)
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.result;
    };
    const initResult = await sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "symbia-integrations", version: "1.0.0" }
    });
    const capabilities = initResult.capabilities;
    const operations = [];
    const namespace = {};
    if (capabilities.tools) {
      const toolsResult = await sendRequest("tools/list");
      for (const tool of toolsResult.tools || []) {
        const op = mcpToolToOperation(tool);
        operations.push(op);
        buildMCPNamespace(namespace, tool.name, op);
      }
    }
    return {
      success: true,
      operations,
      namespace,
      capabilities
    };
  } catch (error) {
    return {
      success: false,
      operations: [],
      namespace: {},
      capabilities: {},
      error: error instanceof Error ? error.message : "Failed to connect to MCP server"
    };
  }
}
function mcpToolToOperation(tool) {
  const parameters = [];
  if (tool.inputSchema.properties) {
    for (const [name, schema] of Object.entries(tool.inputSchema.properties)) {
      parameters.push({
        name,
        location: "body",
        required: tool.inputSchema.required?.includes(name) || false,
        description: schema.description,
        schema
      });
    }
  }
  return {
    id: `tool.${tool.name}`,
    summary: tool.description,
    description: tool.description,
    parameters: parameters.length > 0 ? parameters : void 0,
    mcpTool: {
      name: tool.name,
      inputSchema: tool.inputSchema
    }
  };
}
function mcpResourceToOperation(resource) {
  return {
    id: `resource.${resource.name}`,
    summary: resource.description || `Read ${resource.name}`,
    description: resource.description,
    parameters: [
      {
        name: "uri",
        location: "body",
        required: true,
        description: "Resource URI",
        schema: { type: "string", default: resource.uri }
      }
    ]
  };
}
function mcpPromptToOperation(prompt) {
  const parameters = (prompt.arguments || []).map((arg) => ({
    name: arg.name,
    location: "body",
    required: arg.required || false,
    description: arg.description,
    schema: { type: "string" }
  }));
  return {
    id: `prompt.${prompt.name}`,
    summary: prompt.description || `Get ${prompt.name} prompt`,
    description: prompt.description,
    parameters: parameters.length > 0 ? parameters : void 0
  };
}
function buildMCPNamespace(tree, path, operation) {
  const normalizedPath = path.replace(/_/g, ".");
  const parts = normalizedPath.split(".");
  let current = tree;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part]) {
      current[part] = {};
    }
    current = current[part];
  }
  const leaf = parts[parts.length - 1];
  current[leaf] = {
    _operation: operation.id,
    _mcp: true
  };
}
var IntegrationRegistry = class {
  integrations = /* @__PURE__ */ new Map();
  /**
   * Register an integration and discover its operations
   */
  async register(integration) {
    try {
      let operations = [];
      let namespace = {};
      if (integration.type === "openapi" && integration.openapi) {
        const result = await fetchAndParseOpenAPI(integration.openapi);
        if (!result.success) {
          return { success: false, operationCount: 0, error: result.error };
        }
        operations = result.operations;
        namespace = result.namespace;
      } else if (integration.type === "mcp" && integration.mcp) {
        const result = await discoverMCPServer(integration.mcp);
        if (!result.success) {
          return { success: false, operationCount: 0, error: result.error };
        }
        operations = result.operations;
        namespace = result.namespace;
      } else if (integration.type === "builtin") {
        operations = integration.operations || [];
        namespace = integration.namespace || {};
      }
      const operationMap = /* @__PURE__ */ new Map();
      for (const op of operations) {
        operationMap.set(op.id, op);
      }
      this.integrations.set(integration.key, {
        integration: {
          ...integration,
          operations,
          namespace,
          status: "active",
          lastSyncedAt: (/* @__PURE__ */ new Date()).toISOString()
        },
        operations: operationMap,
        namespace
      });
      console.log(`[registry] Registered integration: ${integration.key} with ${operations.length} operations`);
      return { success: true, operationCount: operations.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, operationCount: 0, error: message };
    }
  }
  /**
   * Unregister an integration
   */
  unregister(key) {
    return this.integrations.delete(key);
  }
  /**
   * Get a registered integration
   */
  get(key) {
    return this.integrations.get(key)?.integration;
  }
  /**
   * Get all registered integrations
   */
  getAll() {
    return Array.from(this.integrations.values()).map((r) => r.integration);
  }
  /**
   * Lookup an operation by namespace path
   * e.g., "integrations.openai.chat.completions.create"
   */
  lookupOperation(path) {
    const parts = path.split(".");
    if (parts[0] === "integrations") {
      parts.shift();
    }
    if (parts.length < 2) {
      return void 0;
    }
    const integrationKey = parts.shift();
    const registered = this.integrations.get(integrationKey);
    if (!registered) {
      return void 0;
    }
    const operationPath = parts.join(".");
    const operation = registered.operations.get(operationPath);
    if (operation) {
      return { integration: registered.integration, operation };
    }
    let current = registered.namespace;
    for (const part of parts) {
      if (current && typeof current === "object") {
        current = current[part];
      } else {
        return void 0;
      }
    }
    if (current && typeof current === "object" && "_operation" in current) {
      const opId = current._operation;
      const op = registered.operations.get(opId);
      if (op) {
        return { integration: registered.integration, operation: op };
      }
    }
    return void 0;
  }
  /**
   * Get the namespace tree for an integration
   */
  getNamespace(integrationKey) {
    return this.integrations.get(integrationKey)?.namespace;
  }
  /**
   * Get the full namespace tree for all integrations
   */
  getFullNamespace() {
    const tree = {};
    for (const [key, registered] of this.integrations) {
      tree[key] = registered.namespace;
    }
    return { integrations: tree };
  }
  /**
   * List all operations for an integration
   */
  listOperations(integrationKey) {
    const registered = this.integrations.get(integrationKey);
    return registered ? Array.from(registered.operations.values()) : [];
  }
  /**
   * Search operations across all integrations
   */
  searchOperations(query) {
    const results = [];
    const lowerQuery = query.toLowerCase();
    for (const [key, registered] of this.integrations) {
      for (const operation of registered.operations.values()) {
        const matches = operation.id.toLowerCase().includes(lowerQuery) || operation.summary?.toLowerCase().includes(lowerQuery) || operation.description?.toLowerCase().includes(lowerQuery) || operation.tags?.some((t) => t.toLowerCase().includes(lowerQuery));
        if (matches) {
          results.push({ integrationKey: key, operation });
        }
      }
    }
    return results;
  }
  /**
   * Get operations by capability/tag
   */
  getOperationsByTag(tag) {
    const results = [];
    for (const [key, registered] of this.integrations) {
      for (const operation of registered.operations.values()) {
        if (operation.tags?.includes(tag)) {
          results.push({ integrationKey: key, operation });
        }
      }
    }
    return results;
  }
  /**
   * Refresh an integration by re-fetching its spec
   */
  async refresh(integrationKey) {
    const registered = this.integrations.get(integrationKey);
    if (!registered) {
      return { success: false, operationCount: 0, error: "Integration not found" };
    }
    return this.register(registered.integration);
  }
};
var integrationRegistry = new IntegrationRegistry();
var OPERATION_METADATA = {
  openai: {
    "chat.completions": {
      method: "POST",
      path: "/v1/chat/completions",
      summary: "Create a chat completion",
      description: "Creates a model response for the given chat conversation",
      tags: ["chat", "llm"],
      parameters: [
        { name: "model", location: "body", required: true, description: "Model ID (e.g., gpt-4o, gpt-4o-mini)" },
        { name: "messages", location: "body", required: true, description: "Array of chat messages" },
        { name: "temperature", location: "body", required: false, description: "Sampling temperature (0-2)" },
        { name: "max_tokens", location: "body", required: false, description: "Maximum tokens to generate" },
        { name: "tools", location: "body", required: false, description: "List of tools the model can call" }
      ]
    },
    "responses": {
      method: "POST",
      path: "/v1/responses",
      summary: "Create a response (Responses API)",
      description: "Create a stateful response with built-in tools and conversation management",
      tags: ["chat", "llm", "responses"],
      parameters: [
        { name: "model", location: "body", required: true, description: "Model ID (e.g., gpt-4o, o1, o3)" },
        { name: "input", location: "body", required: true, description: "Input messages or conversation" },
        { name: "instructions", location: "body", required: false, description: "System instructions" },
        { name: "tools", location: "body", required: false, description: "Built-in tools (web_search, code_interpreter, etc.)" },
        { name: "reasoning", location: "body", required: false, description: "Reasoning configuration for o-series models" }
      ]
    },
    "embeddings": {
      method: "POST",
      path: "/v1/embeddings",
      summary: "Create embeddings",
      description: "Creates embedding vectors for the input text",
      tags: ["embedding"],
      parameters: [
        { name: "model", location: "body", required: true, description: "Model ID (e.g., text-embedding-3-small)" },
        { name: "input", location: "body", required: true, description: "Text or array of text to embed" },
        { name: "dimensions", location: "body", required: false, description: "Output dimensions (for ada-002+)" }
      ]
    }
  },
  anthropic: {
    "chat.completions": {
      method: "POST",
      path: "/v1/messages",
      summary: "Create a message",
      description: "Send a message to Claude and receive a response",
      tags: ["chat", "llm"],
      parameters: [
        { name: "model", location: "body", required: true, description: "Model ID (e.g., claude-3-5-sonnet)" },
        { name: "messages", location: "body", required: true, description: "Array of messages" },
        { name: "max_tokens", location: "body", required: true, description: "Maximum tokens to generate" },
        { name: "system", location: "body", required: false, description: "System prompt" }
      ]
    }
  },
  google: {
    "chat.completions": {
      method: "POST",
      path: "/v1beta/models/{model}:generateContent",
      summary: "Generate content",
      description: "Generate content using a Gemini model",
      tags: ["chat", "llm"],
      parameters: [
        { name: "model", location: "path", required: true, description: "Model ID (e.g., gemini-2.0-flash)" },
        { name: "contents", location: "body", required: true, description: "Content parts to process" }
      ]
    },
    "embeddings": {
      method: "POST",
      path: "/v1beta/models/{model}:embedContent",
      summary: "Embed content",
      description: "Generate embeddings for content",
      tags: ["embedding"],
      parameters: [
        { name: "model", location: "path", required: true, description: "Model ID" },
        { name: "content", location: "body", required: true, description: "Content to embed" }
      ]
    }
  },
  huggingface: {
    "chat.completions": {
      method: "POST",
      path: "/chat/completions",
      summary: "Chat completion (OpenAI-compatible)",
      description: "Generate chat completions via HuggingFace Inference API",
      tags: ["chat", "llm"],
      parameters: [
        { name: "model", location: "body", required: true, description: "Model ID from HuggingFace" },
        { name: "messages", location: "body", required: true, description: "Array of messages" }
      ]
    },
    "embeddings": {
      method: "POST",
      path: "/embeddings",
      summary: "Create embeddings",
      description: "Generate embeddings via HuggingFace Inference API",
      tags: ["embedding"]
    }
  },
  mistral: {
    "chat.completions": {
      method: "POST",
      path: "/v1/chat/completions",
      summary: "Create a chat completion",
      description: "Generate chat completions with Mistral models",
      tags: ["chat", "llm"],
      parameters: [
        { name: "model", location: "body", required: true, description: "Model ID (e.g., mistral-large)" },
        { name: "messages", location: "body", required: true, description: "Array of messages" }
      ]
    },
    "embeddings": {
      method: "POST",
      path: "/v1/embeddings",
      summary: "Create embeddings",
      description: "Generate embeddings with Mistral embed models",
      tags: ["embedding"]
    }
  },
  cohere: {
    "chat.completions": {
      method: "POST",
      path: "/v1/chat",
      summary: "Create a chat completion",
      description: "Generate chat completions with Command R+ models",
      tags: ["chat", "llm"],
      parameters: [
        { name: "model", location: "body", required: true, description: "Model ID (e.g., command-r-plus)" },
        { name: "message", location: "body", required: true, description: "User message" },
        { name: "chat_history", location: "body", required: false, description: "Previous messages" }
      ]
    },
    "embeddings": {
      method: "POST",
      path: "/v1/embed",
      summary: "Create embeddings",
      description: "Generate embeddings with Cohere embed models",
      tags: ["embedding"]
    }
  }
};
var PROVIDER_METADATA = {
  openai: {
    name: "OpenAI",
    description: "GPT-4o, o1, o3 reasoning models, DALL-E, Whisper, and more",
    // Live spec from Stainless platform (auto-updated)
    specUrl: "https://app.stainless.com/api/spec/documented/openai/openapi.documented.yml",
    serverUrl: "https://api.openai.com"
  },
  anthropic: {
    name: "Anthropic",
    description: "Claude 3.5 Sonnet, Opus, and Haiku"
    // Anthropic doesn't publish a public OpenAPI spec
  },
  google: {
    name: "Google AI",
    description: "Gemini 2.0 Flash and Pro models"
    // Google AI spec would need to be fetched differently
  },
  huggingface: {
    name: "Hugging Face",
    description: "Open source models via Inference API",
    // Hub API OpenAPI spec (models, datasets, spaces, inference)
    specUrl: "https://huggingface.co/.well-known/openapi.json",
    serverUrl: "https://huggingface.co"
  },
  mistral: {
    name: "Mistral AI",
    description: "Mistral Large, Medium, and Codestral"
    // Mistral spec has YAML parsing issues, fallback to adapter
  },
  cohere: {
    name: "Cohere",
    description: "Command R+ and embedding models"
    // Cohere spec URL no longer valid, fallback to adapter
  }
};
function buildOperationsFromAdapter(providerName, adapter) {
  const operations = [];
  const metadata = OPERATION_METADATA[providerName] || {};
  for (const opName of adapter.supportedOperations) {
    const opMeta = metadata[opName] || {};
    const operationId = opName.replace(/\./g, ".") + ".create";
    operations.push({
      id: operationId,
      operationId: opName,
      method: opMeta.method || "POST",
      path: opMeta.path || `/${opName}`,
      summary: opMeta.summary || `Execute ${opName}`,
      description: opMeta.description || `Execute ${opName} operation on ${providerName}`,
      tags: opMeta.tags || [opName.split(".")[0]],
      parameters: opMeta.parameters
    });
  }
  operations.push({
    id: "models.list",
    operationId: "models.list",
    method: "GET",
    path: "/v1/models",
    summary: "List available models",
    description: `List models available from ${providerName}`,
    tags: ["models"]
  });
  return operations;
}
function buildNamespaceFromOperations(operations) {
  const namespace = {};
  for (const op of operations) {
    const parts = op.id.split(".");
    let current = namespace;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = { _operation: op.id };
  }
  return namespace;
}
async function initializeBuiltinIntegrations() {
  const registeredProviders = getRegisteredProviders();
  console.log(`[registry] Initializing builtin integrations from ${registeredProviders.length} providers`);
  for (const providerName of registeredProviders) {
    const adapter = getProvider(providerName);
    if (!adapter) continue;
    const providerMeta = PROVIDER_METADATA[providerName] || {
      name: providerName.charAt(0).toUpperCase() + providerName.slice(1),
      description: `${providerName} API`
    };
    if (providerMeta.specUrl) {
      console.log(`[registry] Fetching OpenAPI spec for ${providerName} from ${providerMeta.specUrl}`);
      try {
        const result = await fetchAndParseOpenAPI({
          specUrl: providerMeta.specUrl,
          serverUrl: providerMeta.serverUrl
        });
        if (result.success && result.operations.length > 0) {
          const integration2 = {
            id: `builtin-${providerName}`,
            key: providerName,
            name: providerMeta.name,
            description: providerMeta.description,
            type: "builtin",
            operations: result.operations,
            namespace: result.namespace,
            openapi: {
              specUrl: providerMeta.specUrl,
              serverUrl: providerMeta.serverUrl
            },
            status: "active",
            version: 1
          };
          const regResult2 = await integrationRegistry.register(integration2);
          if (regResult2.success) {
            console.log(`[registry] Registered ${providerName} with ${regResult2.operationCount} operations from OpenAPI spec`);
          } else {
            console.error(`[registry] Failed to register ${providerName}:`, regResult2.error);
          }
          continue;
        } else {
          console.warn(`[registry] Failed to parse OpenAPI spec for ${providerName}: ${result.error}, falling back to adapter`);
        }
      } catch (error) {
        console.warn(`[registry] Error fetching spec for ${providerName}:`, error, ", falling back to adapter");
      }
    }
    const operations = buildOperationsFromAdapter(providerName, adapter);
    const namespace = buildNamespaceFromOperations(operations);
    const integration = {
      id: `builtin-${providerName}`,
      key: providerName,
      name: providerMeta.name,
      description: providerMeta.description,
      type: "builtin",
      operations,
      namespace,
      status: "active",
      version: 1
    };
    const regResult = await integrationRegistry.register(integration);
    if (regResult.success) {
      console.log(`[registry] Registered ${providerName} with ${regResult.operationCount} operations from adapter: ${adapter.supportedOperations.join(", ")}`);
    } else {
      console.error(`[registry] Failed to register ${providerName}:`, regResult.error);
    }
  }
}
var CATALOG_SERVICE_URL = resolveServiceUrl(ServiceId.CATALOG);
var providerConfigCache = /* @__PURE__ */ new Map();
var modelConfigCache = /* @__PURE__ */ new Map();
function getProviderConfig(provider) {
  return providerConfigCache.get(provider);
}
function getAllProviderConfigs() {
  return Array.from(providerConfigCache.values());
}
async function getModelsForProvider(provider, apiKey) {
  if (!apiKey) {
    const cached = modelConfigCache.get(provider);
    if (cached && cached.length > 0) {
      return cached;
    }
  }
  const adapter = getProvider(provider);
  if (adapter?.listModels) {
    try {
      const models = await adapter.listModels(apiKey);
      const modelConfigs = models.map(modelInfoToConfig);
      modelConfigCache.set(provider, modelConfigs);
      return modelConfigs;
    } catch (error) {
      console.warn(`[integrations] Failed to list models from ${provider} adapter:`, error);
    }
  }
  try {
    const response = await fetch(
      `${CATALOG_SERVICE_URL}/api/resources?type=integration&prefix=integrations/ai/${provider}/models/`
    );
    if (!response.ok) {
      return [];
    }
    const resources = await response.json();
    const models = resources.map((r) => r.metadata);
    modelConfigCache.set(provider, models);
    return models;
  } catch (error) {
    console.warn(`[integrations] Failed to fetch models for ${provider}:`, error);
    return [];
  }
}
function modelInfoToConfig(model) {
  return {
    id: model.id,
    name: model.name,
    description: model.description,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
    capabilities: model.capabilities,
    inputPricing: model.inputPricing,
    outputPricing: model.outputPricing,
    deprecated: model.deprecated
  };
}
var taskTypeSchema = external_exports.enum([
  "routing",
  // Intent classification for coordinator routing
  "conversational",
  // General chat/assistant tasks
  "code",
  // Code review, generation, analysis
  "reasoning",
  // Complex reasoning, fact-checking
  "function_calling",
  // Tool selection and usage
  "embedding"
  // Semantic similarity, retrieval
]);
var evaluatorTypeSchema = external_exports.enum([
  "exact",
  // Exact string match
  "contains",
  // Output contains expected substring
  "semantic",
  // Semantic similarity using embeddings
  "json_schema",
  // Output matches JSON schema
  "function_call",
  // Correct function/tool selected
  "regex",
  // Regex pattern match
  "custom"
  // Custom evaluator function
]);
var testCaseSchema = external_exports.object({
  id: external_exports.string(),
  name: external_exports.string(),
  description: external_exports.string().optional(),
  // Input to the model
  input: external_exports.object({
    messages: external_exports.array(external_exports.object({
      role: external_exports.enum(["system", "user", "assistant"]),
      content: external_exports.string()
    })).optional(),
    prompt: external_exports.string().optional(),
    tools: external_exports.array(external_exports.object({
      name: external_exports.string(),
      description: external_exports.string(),
      parameters: external_exports.record(external_exports.unknown())
    })).optional()
  }),
  // Expected output
  expected: external_exports.object({
    content: external_exports.string().optional(),
    pattern: external_exports.string().optional(),
    // Regex pattern
    contains: external_exports.array(external_exports.string()).optional(),
    notContains: external_exports.array(external_exports.string()).optional(),
    functionCall: external_exports.object({
      name: external_exports.string(),
      arguments: external_exports.record(external_exports.unknown()).optional()
    }).optional(),
    schema: external_exports.record(external_exports.unknown()).optional()
    // JSON schema
  }),
  // How to evaluate
  evaluator: evaluatorTypeSchema,
  // Scoring weights
  weight: external_exports.number().default(1),
  // Tags for filtering
  tags: external_exports.array(external_exports.string()).optional()
});
var benchmarkDefinitionSchema = external_exports.object({
  id: external_exports.string(),
  // e.g., "routing.intent-classification"
  name: external_exports.string(),
  description: external_exports.string(),
  version: external_exports.string(),
  // Semantic version for tracking changes
  // Categorization
  taskType: taskTypeSchema,
  category: external_exports.string(),
  // Sub-category within task type
  // Test cases
  testCases: external_exports.array(testCaseSchema),
  // Configuration
  config: external_exports.object({
    maxTokens: external_exports.number().int().positive().optional(),
    temperature: external_exports.number().min(0).max(2).optional(),
    seed: external_exports.number().int().optional(),
    // For deterministic generation
    timeout: external_exports.number().int().positive().default(3e4)
  }).optional(),
  // Metadata
  author: external_exports.string().optional(),
  createdAt: external_exports.string().datetime().optional(),
  updatedAt: external_exports.string().datetime().optional()
});
var testCaseResultSchema = external_exports.object({
  testCaseId: external_exports.string(),
  // Model output
  output: external_exports.object({
    content: external_exports.string().optional(),
    functionCall: external_exports.object({
      name: external_exports.string(),
      arguments: external_exports.record(external_exports.unknown())
    }).optional(),
    rawResponse: external_exports.record(external_exports.unknown()).optional()
  }),
  // Scoring
  passed: external_exports.boolean(),
  score: external_exports.number().min(0).max(1),
  // Normalized 0-1 score
  reason: external_exports.string().optional(),
  // Explanation for score
  // Metrics
  latencyMs: external_exports.number().int(),
  inputTokens: external_exports.number().int(),
  outputTokens: external_exports.number().int(),
  // Error handling
  error: external_exports.string().optional()
});
var evalRunConfigSchema = external_exports.object({
  // Model to evaluate
  provider: external_exports.string(),
  modelId: external_exports.string(),
  // Benchmark to run
  benchmarkId: external_exports.string(),
  benchmarkVersion: external_exports.string().optional(),
  // Execution options
  parallelism: external_exports.number().int().positive().default(1),
  retries: external_exports.number().int().min(0).default(0),
  seed: external_exports.number().int().optional(),
  // Global seed for reproducibility
  // Filtering
  testCaseIds: external_exports.array(external_exports.string()).optional(),
  // Run specific test cases only
  tags: external_exports.array(external_exports.string()).optional(),
  // Run test cases with these tags
  // Scope
  orgId: external_exports.string().optional(),
  // null = global
  scope: external_exports.enum(["global", "org"]).default("global")
});
var evalStatusSchema = external_exports.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled"
]);
var evaluationResultSchema = external_exports.object({
  id: external_exports.string(),
  // Model info
  provider: external_exports.string(),
  modelId: external_exports.string(),
  // Benchmark info
  benchmarkId: external_exports.string(),
  benchmarkVersion: external_exports.string(),
  // Aggregate scores
  overallScore: external_exports.number().min(0).max(1),
  accuracy: external_exports.number().min(0).max(1),
  // % of test cases passed
  // Performance metrics
  latencyP50Ms: external_exports.number().int(),
  latencyP95Ms: external_exports.number().int(),
  latencyP99Ms: external_exports.number().int().optional(),
  // Token usage
  totalInputTokens: external_exports.number().int(),
  totalOutputTokens: external_exports.number().int(),
  estimatedCostCents: external_exports.number(),
  // Individual results
  testCaseResults: external_exports.array(testCaseResultSchema),
  // Run configuration
  runConfig: evalRunConfigSchema,
  // Scope
  orgId: external_exports.string().nullable(),
  scope: external_exports.enum(["global", "org"]),
  // Status
  status: evalStatusSchema,
  startedAt: external_exports.string().datetime(),
  completedAt: external_exports.string().datetime().optional(),
  errorMessage: external_exports.string().optional()
});
var modelScoresSchema = external_exports.object({
  id: external_exports.string(),
  // Model identity
  provider: external_exports.string(),
  modelId: external_exports.string(),
  // Task type this score is for
  taskType: taskTypeSchema,
  // Composite scores (0-100 scale)
  qualityScore: external_exports.number().min(0).max(100),
  speedScore: external_exports.number().min(0).max(100),
  costScore: external_exports.number().min(0).max(100),
  reliabilityScore: external_exports.number().min(0).max(100),
  // Weighted composite
  compositeScore: external_exports.number().min(0).max(100),
  // Source evaluations
  evaluationIds: external_exports.array(external_exports.string()),
  // Scope
  orgId: external_exports.string().nullable(),
  // Timestamps
  updatedAt: external_exports.string().datetime()
});
var recommendationConstraintsSchema = external_exports.object({
  maxLatencyMs: external_exports.number().int().positive().optional(),
  maxCostPerMTokens: external_exports.number().positive().optional(),
  minQualityScore: external_exports.number().min(0).max(100).optional(),
  requiredCapabilities: external_exports.array(external_exports.string()).optional(),
  excludeProviders: external_exports.array(external_exports.string()).optional(),
  excludeModels: external_exports.array(external_exports.string()).optional()
});
var recommendationWeightsSchema = external_exports.object({
  quality: external_exports.number().min(0).max(1).default(0.4),
  speed: external_exports.number().min(0).max(1).default(0.25),
  cost: external_exports.number().min(0).max(1).default(0.25),
  reliability: external_exports.number().min(0).max(1).default(0.1)
});
var recommendationRequestSchema = external_exports.object({
  taskType: taskTypeSchema,
  constraints: recommendationConstraintsSchema.optional(),
  weights: recommendationWeightsSchema.optional(),
  limit: external_exports.number().int().positive().default(5),
  orgId: external_exports.string().optional()
});
var recommendedModelSchema = external_exports.object({
  provider: external_exports.string(),
  modelId: external_exports.string(),
  // Scores
  compositeScore: external_exports.number(),
  qualityScore: external_exports.number(),
  speedScore: external_exports.number(),
  costScore: external_exports.number(),
  reliabilityScore: external_exports.number(),
  // Metadata
  modelName: external_exports.string().optional(),
  contextWindow: external_exports.number().int().optional(),
  inputPricePerMillion: external_exports.number().optional(),
  outputPricePerMillion: external_exports.number().optional(),
  // Match info
  matchReason: external_exports.string().optional(),
  constraintViolations: external_exports.array(external_exports.string()).optional()
});
var recommendationResponseSchema = external_exports.object({
  taskType: taskTypeSchema,
  recommendations: external_exports.array(recommendedModelSchema),
  // Cache info
  cacheKey: external_exports.string().optional(),
  cachedAt: external_exports.string().datetime().optional(),
  expiresAt: external_exports.string().datetime().optional()
});
var discoveredModelSchema = external_exports.object({
  provider: external_exports.string(),
  modelId: external_exports.string(),
  name: external_exports.string().optional(),
  description: external_exports.string().optional(),
  // Capabilities
  contextWindow: external_exports.number().int().optional(),
  maxOutputTokens: external_exports.number().int().optional(),
  capabilities: external_exports.array(external_exports.string()).optional(),
  // Pricing (per 1M tokens)
  inputPricePerMillion: external_exports.number().optional(),
  outputPricePerMillion: external_exports.number().optional(),
  // Status
  deprecated: external_exports.boolean().optional(),
  available: external_exports.boolean().default(true),
  // Last evaluation info
  lastEvaluatedAt: external_exports.string().datetime().optional(),
  hasScores: external_exports.boolean().default(false)
});
var runBenchmarkRequestSchema = external_exports.object({
  provider: external_exports.string(),
  modelId: external_exports.string(),
  benchmarkId: external_exports.string(),
  testCaseIds: external_exports.array(external_exports.string()).optional(),
  seed: external_exports.number().int().optional(),
  /** Run in mock mode - returns simulated results without calling the actual provider */
  mock: external_exports.boolean().optional().default(false)
});
var listEvaluationsRequestSchema = external_exports.object({
  provider: external_exports.string().optional(),
  modelId: external_exports.string().optional(),
  benchmarkId: external_exports.string().optional(),
  taskType: taskTypeSchema.optional(),
  status: evalStatusSchema.optional(),
  limit: external_exports.number().int().positive().default(50),
  offset: external_exports.number().int().min(0).default(0)
});
var getModelScoresRequestSchema = external_exports.object({
  provider: external_exports.string().optional(),
  modelId: external_exports.string().optional(),
  taskType: taskTypeSchema.optional()
});
var ModelDiscoveryService = class {
  cache = /* @__PURE__ */ new Map();
  cacheTTLMs = 5 * 60 * 1e3;
  // 5 minutes
  /**
   * Discover all available models across providers
   */
  async discoverModels(options = {}) {
    const {
      providers = getRegisteredProviders(),
      includeDeprecated = false,
      capabilities,
      apiKeys = {}
    } = options;
    const models = [];
    const errors = [];
    const discoveryPromises = providers.map(async (providerName) => {
      try {
        const providerModels = await this.discoverFromProvider(
          providerName,
          apiKeys[providerName]
        );
        return { provider: providerName, models: providerModels, error: null };
      } catch (error) {
        return {
          provider: providerName,
          models: [],
          error: error instanceof Error ? error.message : "Unknown error"
        };
      }
    });
    const results = await Promise.all(discoveryPromises);
    for (const result of results) {
      if (result.error) {
        errors.push({ provider: result.provider, error: result.error });
      } else {
        models.push(...result.models);
      }
    }
    let filteredModels = models;
    if (!includeDeprecated) {
      filteredModels = filteredModels.filter((m) => !m.deprecated);
    }
    if (capabilities && capabilities.length > 0) {
      filteredModels = filteredModels.filter(
        (m) => capabilities.some((cap) => m.capabilities?.includes(cap))
      );
    }
    return {
      models: filteredModels,
      errors,
      discoveredAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  /**
   * Discover models from a specific provider
   */
  async discoverFromProvider(providerName, apiKey) {
    if (!apiKey) {
      const cached = this.cache.get(providerName);
      if (cached && Date.now() - cached.timestamp < this.cacheTTLMs) {
        return cached.models;
      }
    }
    const provider = getProvider(providerName);
    if (!provider) {
      throw new Error(`Provider "${providerName}" not registered`);
    }
    if (!provider.listModels) {
      return [];
    }
    const modelInfos = await provider.listModels(apiKey);
    const discoveredModels = modelInfos.map(
      (info) => this.convertToDiscoveredModel(providerName, info)
    );
    if (!apiKey) {
      this.cache.set(providerName, {
        models: discoveredModels,
        timestamp: Date.now()
      });
    }
    return discoveredModels;
  }
  /**
   * Get a specific model by provider and ID
   */
  async getModel(provider, modelId, apiKey) {
    const models = await this.discoverFromProvider(provider, apiKey);
    return models.find((m) => m.modelId === modelId) || null;
  }
  /**
   * Get models suitable for a specific task type
   */
  async getModelsForTask(taskType, options = {}) {
    const capabilityMap = {
      routing: ["chat", "function_calling"],
      conversational: ["chat"],
      code: ["chat", "function_calling"],
      reasoning: ["chat", "reasoning"],
      embedding: ["embedding"],
      function_calling: ["chat", "function_calling"]
    };
    const requiredCapabilities = capabilityMap[taskType] || ["chat"];
    const result = await this.discoverModels({
      ...options,
      capabilities: requiredCapabilities
    });
    return this.sortModelsForTask(result.models, taskType);
  }
  /**
   * Clear the discovery cache
   */
  clearCache(provider) {
    if (provider) {
      this.cache.delete(provider);
    } else {
      this.cache.clear();
    }
  }
  // =============================================================================
  // Private Methods
  // =============================================================================
  convertToDiscoveredModel(provider, info) {
    return {
      provider,
      modelId: info.id,
      name: info.name,
      description: info.description,
      contextWindow: info.contextWindow,
      maxOutputTokens: info.maxOutputTokens,
      capabilities: info.capabilities,
      inputPricePerMillion: info.inputPricing,
      outputPricePerMillion: info.outputPricing,
      deprecated: info.deprecated,
      available: true,
      hasScores: false
      // Will be updated when scores are loaded
    };
  }
  sortModelsForTask(models, taskType) {
    return models.sort((a, b) => {
      const capScore = (m) => {
        let score = 0;
        if (m.capabilities?.includes("chat")) score += 1;
        if (m.capabilities?.includes("function_calling")) score += 2;
        if (m.capabilities?.includes("reasoning") && taskType === "reasoning") score += 4;
        if (m.capabilities?.includes("embedding") && taskType === "embedding") score += 10;
        return score;
      };
      const aScore = capScore(a);
      const bScore = capScore(b);
      if (aScore !== bScore) {
        return bScore - aScore;
      }
      const aContext = a.contextWindow || 0;
      const bContext = b.contextWindow || 0;
      return bContext - aContext;
    });
  }
};
var discoveryInstance = null;
function getModelDiscoveryService() {
  if (!discoveryInstance) {
    discoveryInstance = new ModelDiscoveryService();
  }
  return discoveryInstance;
}
async function discoverAllModels(options) {
  return getModelDiscoveryService().discoverModels(options);
}
async function getModelsForTask(taskType, options) {
  return getModelDiscoveryService().getModelsForTask(taskType, options);
}
init_benchmark_registry();
init_routing_benchmarks();
init_code_review_benchmarks();
init_reasoning_benchmarks();
init_function_calling_benchmarks();
var evaluatorRegistry = /* @__PURE__ */ new Map();
function registerEvaluator(name, evaluator) {
  evaluatorRegistry.set(name, evaluator);
}
function getEvaluator(name) {
  return evaluatorRegistry.get(name);
}
var exactEvaluator = (context) => {
  const expected = context.testCase.expected.content;
  if (!expected) {
    return { passed: false, score: 0, reason: "No expected content defined" };
  }
  const normalizedOutput = context.output.trim().toLowerCase();
  const normalizedExpected = expected.trim().toLowerCase();
  const passed = normalizedOutput === normalizedExpected;
  return {
    passed,
    score: passed ? 1 : 0,
    reason: passed ? "Exact match" : `Expected "${expected}", got "${context.output.slice(0, 100)}..."`
  };
};
var containsEvaluator = (context) => {
  const { contains, notContains } = context.testCase.expected;
  const outputLower = context.output.toLowerCase();
  let score = 1;
  const reasons = [];
  if (contains && contains.length > 0) {
    let foundCount = 0;
    for (const substring of contains) {
      if (outputLower.includes(substring.toLowerCase())) {
        foundCount++;
      } else {
        reasons.push(`Missing: "${substring}"`);
      }
    }
    score = foundCount / contains.length;
  }
  if (notContains && notContains.length > 0) {
    for (const substring of notContains) {
      if (outputLower.includes(substring.toLowerCase())) {
        score = Math.max(0, score - 0.25);
        reasons.push(`Should not contain: "${substring}"`);
      }
    }
  }
  const passed = score >= 0.5;
  return {
    passed,
    score,
    reason: reasons.length > 0 ? reasons.join("; ") : "All expected content found"
  };
};
var regexEvaluator = (context) => {
  const pattern = context.testCase.expected.pattern;
  if (!pattern) {
    return { passed: false, score: 0, reason: "No pattern defined" };
  }
  try {
    const regex = new RegExp(pattern, "i");
    const passed = regex.test(context.output);
    return {
      passed,
      score: passed ? 1 : 0,
      reason: passed ? "Pattern matched" : `Pattern "${pattern}" not found`
    };
  } catch (error) {
    return {
      passed: false,
      score: 0,
      reason: `Invalid regex pattern: ${error}`
    };
  }
};
var jsonSchemaEvaluator = (context) => {
  const schema = context.testCase.expected.schema;
  if (!schema) {
    return { passed: false, score: 0, reason: "No schema defined" };
  }
  let jsonContent;
  try {
    jsonContent = JSON.parse(context.output);
  } catch {
    const jsonMatch = context.output.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        jsonContent = JSON.parse(jsonMatch[1].trim());
      } catch {
        return { passed: false, score: 0, reason: "Could not parse JSON from output" };
      }
    } else {
      const objectMatch = context.output.match(/\{[\s\S]*\}/);
      const arrayMatch = context.output.match(/\[[\s\S]*\]/);
      const match = objectMatch || arrayMatch;
      if (match) {
        try {
          jsonContent = JSON.parse(match[0]);
        } catch {
          return { passed: false, score: 0, reason: "Could not parse JSON from output" };
        }
      } else {
        return { passed: false, score: 0, reason: "No JSON found in output" };
      }
    }
  }
  const validationResult = validateAgainstSchema(jsonContent, schema);
  return validationResult;
};
var functionCallEvaluator = (context) => {
  const expected = context.testCase.expected.functionCall;
  if (!expected) {
    return { passed: false, score: 0, reason: "No expected function call defined" };
  }
  if (!context.functionCall) {
    return { passed: false, score: 0, reason: "No function call in output" };
  }
  let score = 0;
  const reasons = [];
  if (context.functionCall.name === expected.name) {
    score += 0.5;
  } else {
    reasons.push(`Wrong function: expected "${expected.name}", got "${context.functionCall.name}"`);
  }
  if (expected.arguments) {
    const argScore = compareArguments(expected.arguments, context.functionCall.arguments);
    score += argScore * 0.5;
    if (argScore < 1) {
      reasons.push(`Argument mismatch (${Math.round(argScore * 100)}% match)`);
    }
  } else {
    score += 0.5;
  }
  const passed = score >= 0.75;
  return {
    passed,
    score,
    reason: reasons.length > 0 ? reasons.join("; ") : "Function call matches"
  };
};
var semanticEvaluator = (context) => {
  const containsResult = containsEvaluator(context);
  const lengthBonus = Math.min(0.1, context.output.length / 1e3 * 0.1);
  return {
    passed: containsResult.passed,
    score: Math.min(1, containsResult.score + lengthBonus),
    reason: `Semantic evaluation (using contains fallback): ${containsResult.reason}`
  };
};
function validateAgainstSchema(value, schema) {
  const type = schema.type;
  const reasons = [];
  let score = 1;
  if (type) {
    const actualType = Array.isArray(value) ? "array" : typeof value;
    if (type === "integer" && typeof value === "number" && !Number.isInteger(value)) {
      score -= 0.25;
      reasons.push("Expected integer, got float");
    } else if (type !== actualType && !(type === "integer" && actualType === "number")) {
      score -= 0.5;
      reasons.push(`Expected type "${type}", got "${actualType}"`);
    }
  }
  if (type === "object" && typeof value === "object" && value !== null) {
    const obj = value;
    const properties = schema.properties;
    const required = schema.required;
    if (required) {
      for (const prop of required) {
        if (!(prop in obj)) {
          score -= 0.2;
          reasons.push(`Missing required property: "${prop}"`);
        }
      }
    }
    if (properties) {
      for (const [key, propSchema] of Object.entries(properties)) {
        if (key in obj) {
          const propResult = validateAgainstSchema(obj[key], propSchema);
          if (!propResult.passed) {
            score -= 0.1;
            reasons.push(`Property "${key}": ${propResult.reason}`);
          }
        }
      }
    }
  }
  if (schema.enum && Array.isArray(schema.enum)) {
    if (!schema.enum.includes(value)) {
      score -= 0.3;
      reasons.push(`Value not in enum: expected one of ${JSON.stringify(schema.enum)}`);
    }
  }
  if (typeof value === "number") {
    if (schema.minimum !== void 0 && value < schema.minimum) {
      score -= 0.2;
      reasons.push(`Value ${value} below minimum ${schema.minimum}`);
    }
    if (schema.maximum !== void 0 && value > schema.maximum) {
      score -= 0.2;
      reasons.push(`Value ${value} above maximum ${schema.maximum}`);
    }
  }
  score = Math.max(0, score);
  return {
    passed: score >= 0.5,
    score,
    reason: reasons.length > 0 ? reasons.join("; ") : "Schema validation passed"
  };
}
function compareArguments(expected, actual) {
  const expectedKeys = Object.keys(expected);
  if (expectedKeys.length === 0) return 1;
  let matchCount = 0;
  for (const key of expectedKeys) {
    if (key in actual) {
      const expectedVal = expected[key];
      const actualVal = actual[key];
      if (typeof expectedVal === "object" && typeof actualVal === "object") {
        if (JSON.stringify(expectedVal) === JSON.stringify(actualVal)) {
          matchCount++;
        } else {
          matchCount += 0.5;
        }
      } else if (expectedVal === actualVal) {
        matchCount++;
      } else if (typeof expectedVal === "string" && typeof actualVal === "string" && actualVal.toLowerCase().includes(expectedVal.toLowerCase())) {
        matchCount += 0.75;
      }
    }
  }
  return matchCount / expectedKeys.length;
}
registerEvaluator("exact", exactEvaluator);
registerEvaluator("contains", containsEvaluator);
registerEvaluator("regex", regexEvaluator);
registerEvaluator("json_schema", jsonSchemaEvaluator);
registerEvaluator("function_call", functionCallEvaluator);
registerEvaluator("semantic", semanticEvaluator);
registerEvaluator("custom", containsEvaluator);
function evaluate(context) {
  const evaluatorType = context.testCase.evaluator;
  const evaluator = getEvaluator(evaluatorType);
  if (!evaluator) {
    return {
      passed: false,
      score: 0,
      reason: `Unknown evaluator type: ${evaluatorType}`
    };
  }
  return evaluator(context);
}
init_benchmark_registry();
var modelEvaluations = pgTable("model_evaluations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Model identity
  provider: varchar("provider", { length: 100 }).notNull(),
  modelId: varchar("model_id", { length: 255 }).notNull(),
  // Benchmark identity
  benchmarkId: varchar("benchmark_id", { length: 255 }).notNull(),
  benchmarkVersion: varchar("benchmark_version", { length: 50 }).notNull(),
  // Aggregate scores (0-1 normalized)
  overallScore: real("overall_score").notNull(),
  accuracy: real("accuracy").notNull(),
  // Latency metrics (milliseconds)
  latencyP50Ms: integer("latency_p50_ms").notNull(),
  latencyP95Ms: integer("latency_p95_ms").notNull(),
  latencyP99Ms: integer("latency_p99_ms"),
  // Token usage
  totalInputTokens: integer("total_input_tokens").notNull(),
  totalOutputTokens: integer("total_output_tokens").notNull(),
  estimatedCostCents: real("estimated_cost_cents").notNull(),
  // Individual test case results (stored as JSON)
  testCaseResults: json("test_case_results").$type().notNull(),
  // Run configuration
  runConfig: json("run_config").$type().notNull(),
  // Scope
  orgId: varchar("org_id", { length: 100 }),
  scope: varchar("scope", { length: 20 }).notNull().default("global"),
  // Status
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  errorMessage: text("error_message"),
  // Timestamps
  startedAt: timestamp("started_at").notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  providerIdx: index("idx_model_evaluations_provider").on(table.provider),
  modelIdx: index("idx_model_evaluations_model").on(table.modelId),
  benchmarkIdx: index("idx_model_evaluations_benchmark").on(table.benchmarkId),
  providerModelIdx: index("idx_model_evaluations_provider_model").on(table.provider, table.modelId),
  statusIdx: index("idx_model_evaluations_status").on(table.status),
  orgIdx: index("idx_model_evaluations_org").on(table.orgId),
  completedIdx: index("idx_model_evaluations_completed").on(table.completedAt)
}));
var modelScores = pgTable("model_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Model identity
  provider: varchar("provider", { length: 100 }).notNull(),
  modelId: varchar("model_id", { length: 255 }).notNull(),
  // Task type this score applies to
  taskType: varchar("task_type", { length: 50 }).notNull(),
  // Component scores (0-100 scale)
  qualityScore: real("quality_score").notNull(),
  speedScore: real("speed_score").notNull(),
  costScore: real("cost_score").notNull(),
  reliabilityScore: real("reliability_score").notNull(),
  // Weighted composite score
  compositeScore: real("composite_score").notNull(),
  // Source evaluations that contributed to this score
  evaluationIds: json("evaluation_ids").$type().notNull().default([]),
  // Scope
  orgId: varchar("org_id", { length: 100 }),
  // Timestamps
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  providerIdx: index("idx_model_scores_provider").on(table.provider),
  modelIdx: index("idx_model_scores_model").on(table.modelId),
  taskTypeIdx: index("idx_model_scores_task_type").on(table.taskType),
  providerModelTaskIdx: index("idx_model_scores_provider_model_task").on(
    table.provider,
    table.modelId,
    table.taskType
  ),
  compositeIdx: index("idx_model_scores_composite").on(table.compositeScore),
  orgIdx: index("idx_model_scores_org").on(table.orgId)
}));
var modelRecommendations = pgTable("model_recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // What task type this recommendation is for
  taskType: varchar("task_type", { length: 50 }).notNull(),
  // Request constraints used to generate this recommendation
  constraints: json("constraints").$type(),
  // The actual recommendations
  recommendations: json("recommendations").$type().notNull(),
  // Cache key for quick lookup
  cacheKey: varchar("cache_key", { length: 255 }).notNull().unique(),
  // Scope
  orgId: varchar("org_id", { length: 100 }),
  // Cache expiry
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  taskTypeIdx: index("idx_model_recommendations_task_type").on(table.taskType),
  cacheKeyIdx: index("idx_model_recommendations_cache_key").on(table.cacheKey),
  expiresIdx: index("idx_model_recommendations_expires").on(table.expiresAt),
  orgIdx: index("idx_model_recommendations_org").on(table.orgId)
}));
var benchmarkDefinitions = pgTable("benchmark_definitions", {
  id: varchar("id").primaryKey(),
  // e.g., "routing.intent-classification"
  // Metadata
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  version: varchar("version", { length: 50 }).notNull(),
  // Categorization
  taskType: varchar("task_type", { length: 50 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  // Test cases stored as JSON
  testCases: json("test_cases").$type().notNull(),
  // Configuration
  config: json("config").$type(),
  // Metadata
  author: varchar("author", { length: 255 }),
  isBuiltin: boolean("is_builtin").notNull().default(false),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  taskTypeIdx: index("idx_benchmark_definitions_task_type").on(table.taskType),
  categoryIdx: index("idx_benchmark_definitions_category").on(table.category),
  versionIdx: index("idx_benchmark_definitions_version").on(table.version)
}));
var evaluationSchedules = pgTable("evaluation_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // What to evaluate
  provider: varchar("provider", { length: 100 }),
  // null = all providers
  modelId: varchar("model_id", { length: 255 }),
  // null = all models
  benchmarkId: varchar("benchmark_id", { length: 255 }),
  // null = all benchmarks
  taskType: varchar("task_type", { length: 50 }),
  // null = all task types
  // Schedule configuration
  cronExpression: varchar("cron_expression", { length: 100 }).notNull(),
  intervalHours: integer("interval_hours"),
  // Alternative to cron
  // Status
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  lastError: text("last_error"),
  // Scope
  orgId: varchar("org_id", { length: 100 }),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  enabledIdx: index("idx_evaluation_schedules_enabled").on(table.enabled),
  nextRunIdx: index("idx_evaluation_schedules_next_run").on(table.nextRunAt),
  orgIdx: index("idx_evaluation_schedules_org").on(table.orgId)
}));
var EvalRepository = class {
  constructor(db2) {
    this.db = db2;
  }
  // ===========================================================================
  // Evaluations
  // ===========================================================================
  /**
   * Create a new evaluation record
   */
  async createEvaluation(data) {
    const [result] = await this.db.insert(modelEvaluations).values(data).returning();
    return result;
  }
  /**
   * Update an evaluation record
   */
  async updateEvaluation(id, data) {
    const [result] = await this.db.update(modelEvaluations).set(data).where(eq(modelEvaluations.id, id)).returning();
    return result || null;
  }
  /**
   * Get an evaluation by ID
   */
  async getEvaluation(id) {
    const [result] = await this.db.select().from(modelEvaluations).where(eq(modelEvaluations.id, id)).limit(1);
    return result || null;
  }
  /**
   * Query evaluations with filters
   */
  async queryEvaluations(query) {
    const conditions = [];
    if (query.provider) {
      conditions.push(eq(modelEvaluations.provider, query.provider));
    }
    if (query.modelId) {
      conditions.push(eq(modelEvaluations.modelId, query.modelId));
    }
    if (query.benchmarkId) {
      conditions.push(eq(modelEvaluations.benchmarkId, query.benchmarkId));
    }
    if (query.status) {
      conditions.push(eq(modelEvaluations.status, query.status));
    }
    if (query.orgId !== void 0) {
      if (query.orgId === null) {
        conditions.push(isNull(modelEvaluations.orgId));
      } else {
        conditions.push(eq(modelEvaluations.orgId, query.orgId));
      }
    }
    return this.db.select().from(modelEvaluations).where(conditions.length > 0 ? and(...conditions) : void 0).orderBy(desc(modelEvaluations.completedAt)).limit(query.limit || 50).offset(query.offset || 0);
  }
  /**
   * Get the latest evaluation for a model/benchmark combination
   */
  async getLatestEvaluation(provider, modelId, benchmarkId) {
    const [result] = await this.db.select().from(modelEvaluations).where(
      and(
        eq(modelEvaluations.provider, provider),
        eq(modelEvaluations.modelId, modelId),
        eq(modelEvaluations.benchmarkId, benchmarkId),
        eq(modelEvaluations.status, "completed")
      )
    ).orderBy(desc(modelEvaluations.completedAt)).limit(1);
    return result || null;
  }
  /**
   * Delete old evaluations (for cleanup)
   */
  async deleteOldEvaluations(olderThan) {
    const result = await this.db.delete(modelEvaluations).where(lte(modelEvaluations.createdAt, olderThan));
    return result.count || 0;
  }
  // ===========================================================================
  // Model Scores
  // ===========================================================================
  /**
   * Upsert a model score
   */
  async upsertScore(data) {
    const [result] = await this.db.insert(modelScores).values(data).onConflictDoUpdate({
      target: [modelScores.provider, modelScores.modelId, modelScores.taskType],
      set: {
        qualityScore: data.qualityScore,
        speedScore: data.speedScore,
        costScore: data.costScore,
        reliabilityScore: data.reliabilityScore,
        compositeScore: data.compositeScore,
        evaluationIds: data.evaluationIds,
        updatedAt: /* @__PURE__ */ new Date()
      }
    }).returning();
    return result;
  }
  /**
   * Get scores for a specific model and task type
   */
  async getScore(provider, modelId, taskType) {
    const [result] = await this.db.select().from(modelScores).where(
      and(
        eq(modelScores.provider, provider),
        eq(modelScores.modelId, modelId),
        eq(modelScores.taskType, taskType)
      )
    ).limit(1);
    return result || null;
  }
  /**
   * Query model scores
   */
  async queryScores(query) {
    const conditions = [];
    if (query.provider) {
      conditions.push(eq(modelScores.provider, query.provider));
    }
    if (query.modelId) {
      conditions.push(eq(modelScores.modelId, query.modelId));
    }
    if (query.taskType) {
      conditions.push(eq(modelScores.taskType, query.taskType));
    }
    if (query.minCompositeScore !== void 0) {
      conditions.push(gte(modelScores.compositeScore, query.minCompositeScore));
    }
    if (query.orgId !== void 0) {
      if (query.orgId === null) {
        conditions.push(isNull(modelScores.orgId));
      } else {
        conditions.push(
          or(isNull(modelScores.orgId), eq(modelScores.orgId, query.orgId))
        );
      }
    }
    return this.db.select().from(modelScores).where(conditions.length > 0 ? and(...conditions) : void 0).orderBy(desc(modelScores.compositeScore));
  }
  /**
   * Get top models for a task type
   */
  async getTopModels(taskType, limit = 10, constraints) {
    const conditions = [eq(modelScores.taskType, taskType)];
    if (constraints?.minQualityScore !== void 0) {
      conditions.push(gte(modelScores.qualityScore, constraints.minQualityScore));
    }
    return this.db.select().from(modelScores).where(and(...conditions)).orderBy(desc(modelScores.compositeScore)).limit(limit);
  }
  // ===========================================================================
  // Recommendations Cache
  // ===========================================================================
  /**
   * Get cached recommendation
   */
  async getCachedRecommendation(cacheKey) {
    const [result] = await this.db.select().from(modelRecommendations).where(
      and(
        eq(modelRecommendations.cacheKey, cacheKey),
        gte(modelRecommendations.expiresAt, /* @__PURE__ */ new Date())
      )
    ).limit(1);
    return result || null;
  }
  /**
   * Save recommendation to cache
   */
  async cacheRecommendation(data) {
    await this.db.delete(modelRecommendations).where(eq(modelRecommendations.cacheKey, data.cacheKey));
    const [result] = await this.db.insert(modelRecommendations).values(data).returning();
    return result;
  }
  /**
   * Clear expired recommendations
   */
  async clearExpiredRecommendations() {
    const result = await this.db.delete(modelRecommendations).where(lte(modelRecommendations.expiresAt, /* @__PURE__ */ new Date()));
    return result.count || 0;
  }
  // ===========================================================================
  // Benchmark Definitions (stored in DB for version tracking)
  // ===========================================================================
  /**
   * Upsert a benchmark definition
   */
  async upsertBenchmark(data) {
    const [result] = await this.db.insert(benchmarkDefinitions).values(data).onConflictDoUpdate({
      target: benchmarkDefinitions.id,
      set: {
        name: data.name,
        description: data.description,
        version: data.version,
        taskType: data.taskType,
        category: data.category,
        testCases: data.testCases,
        config: data.config,
        author: data.author,
        updatedAt: /* @__PURE__ */ new Date()
      }
    }).returning();
    return result;
  }
  /**
   * Get a benchmark definition by ID
   */
  async getBenchmark(id) {
    const [result] = await this.db.select().from(benchmarkDefinitions).where(eq(benchmarkDefinitions.id, id)).limit(1);
    return result || null;
  }
  /**
   * List all benchmark definitions
   */
  async listBenchmarks() {
    return this.db.select().from(benchmarkDefinitions).orderBy(benchmarkDefinitions.taskType, benchmarkDefinitions.category);
  }
  // ===========================================================================
  // Evaluation Schedules
  // ===========================================================================
  /**
   * Get due schedules
   */
  async getDueSchedules() {
    return this.db.select().from(evaluationSchedules).where(
      and(
        eq(evaluationSchedules.enabled, true),
        lte(evaluationSchedules.nextRunAt, /* @__PURE__ */ new Date())
      )
    );
  }
  /**
   * Update schedule after run
   */
  async updateScheduleRun(id, nextRunAt, error) {
    await this.db.update(evaluationSchedules).set({
      lastRunAt: /* @__PURE__ */ new Date(),
      nextRunAt,
      lastError: error || null,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(evaluationSchedules.id, id));
  }
};
var repositoryInstance = null;
function getEvalRepository(db2) {
  if (!repositoryInstance) {
    repositoryInstance = new EvalRepository(db2);
  }
  return repositoryInstance;
}
function generateRecommendationCacheKey(taskType, constraints, orgId) {
  const parts = [
    taskType,
    orgId || "global",
    constraints ? JSON.stringify(constraints) : "no-constraints"
  ];
  return parts.join(":");
}
var BenchmarkRunner = class {
  repository;
  constructor(db2) {
    this.repository = getEvalRepository(db2);
  }
  /**
   * Run a benchmark against a model
   */
  async runBenchmark(config2, options = {}) {
    const {
      parallelism = 1,
      timeout = 3e4,
      retries = 0,
      seed,
      apiKey,
      onProgress,
      mockMode = false
    } = options;
    const benchmark = getBenchmark(config2.benchmarkId);
    if (!benchmark) {
      throw new Error(`Benchmark not found: ${config2.benchmarkId}`);
    }
    const provider = getProvider(config2.provider);
    if (!provider) {
      throw new Error(`Provider not found: ${config2.provider}`);
    }
    const startedAt = /* @__PURE__ */ new Date();
    const evaluationRecord = await this.repository.createEvaluation({
      provider: config2.provider,
      modelId: config2.modelId,
      benchmarkId: config2.benchmarkId,
      benchmarkVersion: config2.benchmarkVersion || benchmark.version,
      overallScore: 0,
      accuracy: 0,
      latencyP50Ms: 0,
      latencyP95Ms: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      estimatedCostCents: 0,
      testCaseResults: [],
      runConfig: config2,
      orgId: config2.orgId || null,
      scope: config2.scope,
      status: "running",
      startedAt
    });
    try {
      let testCases = benchmark.testCases;
      if (config2.testCaseIds && config2.testCaseIds.length > 0) {
        const idSet = new Set(config2.testCaseIds);
        testCases = testCases.filter((tc) => idSet.has(tc.id));
      }
      if (config2.tags && config2.tags.length > 0) {
        const tagSet = new Set(config2.tags);
        testCases = testCases.filter(
          (tc) => tc.tags?.some((t) => tagSet.has(t))
        );
      }
      const benchmarkConfig = {
        timeout: benchmark.config?.timeout ?? timeout,
        maxTokens: benchmark.config?.maxTokens,
        temperature: benchmark.config?.temperature,
        seed: benchmark.config?.seed
      };
      const results = await this.executeTestCases(
        testCases,
        provider,
        config2.modelId,
        benchmarkConfig,
        {
          parallelism,
          timeout: benchmarkConfig.timeout,
          retries,
          seed: seed ?? benchmarkConfig.seed,
          apiKey,
          onProgress,
          mockMode
        }
      );
      const completedAt = /* @__PURE__ */ new Date();
      const aggregates = this.calculateAggregates(results, benchmark);
      const updatedRecord = await this.repository.updateEvaluation(
        evaluationRecord.id,
        {
          status: "completed",
          completedAt,
          ...aggregates,
          testCaseResults: results
        }
      );
      return this.recordToResult(updatedRecord, config2);
    } catch (error) {
      await this.repository.updateEvaluation(evaluationRecord.id, {
        status: "failed",
        completedAt: /* @__PURE__ */ new Date(),
        errorMessage: error instanceof Error ? error.message : "Unknown error"
      });
      throw error;
    }
  }
  /**
   * Execute test cases with parallelism control
   */
  async executeTestCases(testCases, provider, modelId, benchmarkConfig, options) {
    const { parallelism = 1, timeout = 3e4, retries = 0, onProgress, apiKey, mockMode } = options;
    const results = [];
    const queue = [...testCases];
    let completed = 0;
    while (queue.length > 0) {
      const batch = queue.splice(0, parallelism);
      const batchPromises = batch.map(
        (testCase) => this.executeTestCase(testCase, provider, modelId, benchmarkConfig, {
          timeout,
          retries,
          apiKey,
          mockMode
        })
      );
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      completed += batchResults.length;
      if (onProgress) {
        const lastResult = batchResults[batchResults.length - 1];
        onProgress(completed, testCases.length, lastResult);
      }
    }
    return results;
  }
  /**
   * Execute a single test case
   */
  async executeTestCase(testCase, provider, modelId, benchmarkConfig, options) {
    const { timeout, retries, apiKey, mockMode } = options;
    if (mockMode) {
      return this.executeMockTestCase(testCase);
    }
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const startTime = performance.now();
        const messages = testCase.input.messages || [];
        if (testCase.input.prompt) {
          messages.push({ role: "user", content: testCase.input.prompt });
        }
        let formattedTools;
        if (testCase.input.tools) {
          formattedTools = testCase.input.tools.map((tool) => {
            if (tool.type === "function") {
              return tool;
            }
            return {
              type: "function",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
              }
            };
          });
        }
        const executePromise = provider.execute({
          operation: "chat.completions",
          model: modelId,
          params: {
            messages,
            max_tokens: benchmarkConfig.maxTokens || 500,
            temperature: benchmarkConfig.temperature ?? 0,
            ...formattedTools && { tools: formattedTools }
          },
          apiKey: apiKey || "",
          timeout
        });
        const timeoutPromise = new Promise(
          (_, reject) => setTimeout(() => reject(new Error("Timeout")), timeout)
        );
        const response = await Promise.race([executePromise, timeoutPromise]);
        const endTime = performance.now();
        const latencyMs = Math.round(endTime - startTime);
        let functionCall;
        if (response.toolCalls && response.toolCalls.length > 0) {
          const firstCall = response.toolCalls[0];
          try {
            functionCall = {
              name: firstCall.function.name,
              arguments: JSON.parse(firstCall.function.arguments)
            };
          } catch {
            functionCall = {
              name: firstCall.function.name,
              arguments: {}
            };
          }
        }
        const evalContext = {
          testCase,
          output: response.content,
          functionCall
        };
        const evalResult = evaluate(evalContext);
        return {
          testCaseId: testCase.id,
          output: {
            content: response.content,
            functionCall,
            rawResponse: response.metadata
          },
          passed: evalResult.passed,
          score: evalResult.score,
          reason: evalResult.reason,
          latencyMs,
          inputTokens: response.usage.promptTokens,
          outputTokens: response.usage.completionTokens
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (lastError.message === "Timeout") {
          break;
        }
      }
    }
    return {
      testCaseId: testCase.id,
      output: {
        content: ""
      },
      passed: false,
      score: 0,
      reason: `Execution failed: ${lastError?.message || "Unknown error"}`,
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      error: lastError?.message
    };
  }
  /**
   * Calculate aggregate metrics from test results
   */
  calculateAggregates(results, benchmark) {
    if (results.length === 0) {
      return {
        overallScore: 0,
        accuracy: 0,
        latencyP50Ms: 0,
        latencyP95Ms: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        estimatedCostCents: 0
      };
    }
    const weightMap = /* @__PURE__ */ new Map();
    for (const tc of benchmark.testCases) {
      weightMap.set(tc.id, tc.weight || 1);
    }
    let totalWeight = 0;
    let weightedScore = 0;
    let passedCount = 0;
    for (const result of results) {
      const weight = weightMap.get(result.testCaseId) || 1;
      totalWeight += weight;
      weightedScore += result.score * weight;
      if (result.passed) passedCount++;
    }
    const overallScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
    const accuracy = results.length > 0 ? passedCount / results.length : 0;
    const latencies = results.filter((r) => r.latencyMs > 0).map((r) => r.latencyMs).sort((a, b) => a - b);
    const latencyP50Ms = this.percentile(latencies, 50);
    const latencyP95Ms = this.percentile(latencies, 95);
    const totalInputTokens = results.reduce((sum, r) => sum + r.inputTokens, 0);
    const totalOutputTokens = results.reduce((sum, r) => sum + r.outputTokens, 0);
    const estimatedCostCents = 0;
    return {
      overallScore,
      accuracy,
      latencyP50Ms,
      latencyP95Ms,
      totalInputTokens,
      totalOutputTokens,
      estimatedCostCents
    };
  }
  /**
   * Calculate percentile from sorted array
   */
  percentile(sortedValues, p) {
    if (sortedValues.length === 0) return 0;
    const index3 = Math.ceil(p / 100 * sortedValues.length) - 1;
    return sortedValues[Math.max(0, Math.min(index3, sortedValues.length - 1))];
  }
  /**
   * Execute a mock test case - returns simulated results for testing
   */
  executeMockTestCase(testCase) {
    const latencyMs = 50 + Math.floor(Math.random() * 450);
    let mockOutput = "";
    let passed = false;
    let score = 0;
    if (testCase.expected.content) {
      if (Math.random() < 0.8) {
        mockOutput = testCase.expected.content;
        passed = true;
        score = 1;
      } else {
        mockOutput = "Mock response that does not match expected";
        score = 0.3;
      }
    } else if (testCase.expected.contains && testCase.expected.contains.length > 0) {
      const includeCount = testCase.expected.contains.filter(() => Math.random() < 0.85).length;
      mockOutput = testCase.expected.contains.slice(0, includeCount).join(" and ");
      score = includeCount / testCase.expected.contains.length;
      passed = score >= 0.5;
    } else if (testCase.expected.functionCall) {
      mockOutput = `Calling ${testCase.expected.functionCall.name}`;
      passed = Math.random() < 0.75;
      score = passed ? 1 : 0.4;
    } else {
      mockOutput = "Mock response for testing purposes";
      passed = Math.random() < 0.7;
      score = passed ? 0.8 + Math.random() * 0.2 : 0.2 + Math.random() * 0.3;
    }
    const inputTokens = 50 + Math.floor(Math.random() * 200);
    const outputTokens = 20 + Math.floor(Math.random() * 100);
    return {
      testCaseId: testCase.id,
      output: {
        content: mockOutput,
        functionCall: testCase.expected.functionCall ? {
          name: testCase.expected.functionCall.name,
          arguments: testCase.expected.functionCall.arguments || {}
        } : void 0
      },
      passed,
      score,
      reason: passed ? "Mock test passed" : "Mock test did not fully match expected",
      latencyMs,
      inputTokens,
      outputTokens
    };
  }
  /**
   * Convert database record to EvaluationResult
   */
  recordToResult(record, config2) {
    return {
      id: record.id,
      provider: record.provider,
      modelId: record.modelId,
      benchmarkId: record.benchmarkId,
      benchmarkVersion: record.benchmarkVersion,
      overallScore: record.overallScore,
      accuracy: record.accuracy,
      latencyP50Ms: record.latencyP50Ms,
      latencyP95Ms: record.latencyP95Ms,
      totalInputTokens: record.totalInputTokens,
      totalOutputTokens: record.totalOutputTokens,
      estimatedCostCents: record.estimatedCostCents,
      testCaseResults: record.testCaseResults,
      runConfig: config2,
      orgId: record.orgId,
      scope: record.scope,
      status: record.status,
      startedAt: record.startedAt.toISOString(),
      completedAt: record.completedAt?.toISOString(),
      errorMessage: record.errorMessage || void 0
    };
  }
};
var runnerInstance = null;
function getBenchmarkRunner(db2) {
  if (!runnerInstance) {
    runnerInstance = new BenchmarkRunner(db2);
  }
  return runnerInstance;
}
var DEFAULT_WEIGHTS = {
  quality: 0.4,
  speed: 0.25,
  cost: 0.25,
  reliability: 0.1
};
var RecommendationEngine = class {
  repository;
  inMemoryCache = /* @__PURE__ */ new Map();
  defaultCacheTTLMs = 5 * 60 * 1e3;
  // 5 minutes
  constructor(db2) {
    this.repository = getEvalRepository(db2);
  }
  /**
   * Get model recommendations for a task type
   */
  async getRecommendations(request, options = {}) {
    const {
      useCache = true,
      cacheTTLMs = this.defaultCacheTTLMs,
      includeUnscored = false
    } = options;
    const cacheKey = generateRecommendationCacheKey(
      request.taskType,
      request.constraints,
      request.orgId
    );
    if (useCache) {
      const cached = this.inMemoryCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }
      const dbCached = await this.repository.getCachedRecommendation(cacheKey);
      if (dbCached) {
        const response2 = {
          taskType: request.taskType,
          recommendations: dbCached.recommendations,
          cacheKey,
          cachedAt: dbCached.createdAt.toISOString(),
          expiresAt: dbCached.expiresAt.toISOString()
        };
        this.inMemoryCache.set(cacheKey, {
          data: response2,
          expiresAt: dbCached.expiresAt.getTime()
        });
        return response2;
      }
    }
    const recommendations = await this.generateRecommendations(
      request,
      includeUnscored
    );
    const response = {
      taskType: request.taskType,
      recommendations
    };
    if (useCache && recommendations.length > 0) {
      const expiresAt = new Date(Date.now() + cacheTTLMs);
      await this.repository.cacheRecommendation({
        taskType: request.taskType,
        constraints: request.constraints,
        recommendations,
        cacheKey,
        orgId: request.orgId,
        expiresAt
      });
      this.inMemoryCache.set(cacheKey, {
        data: { ...response, cacheKey, cachedAt: (/* @__PURE__ */ new Date()).toISOString(), expiresAt: expiresAt.toISOString() },
        expiresAt: expiresAt.getTime()
      });
    }
    return response;
  }
  /**
   * Generate recommendations based on scores
   */
  async generateRecommendations(request, includeUnscored) {
    const weights = { ...DEFAULT_WEIGHTS, ...request.weights };
    const limit = request.limit || 5;
    const scores = await this.repository.queryScores({
      taskType: request.taskType,
      orgId: request.orgId
    });
    const recommendations = [];
    for (const score of scores) {
      const recommendation = this.scoreToRecommendation(score, weights);
      const violations = this.checkConstraints(recommendation, request.constraints);
      if (violations.length > 0) {
        recommendation.constraintViolations = violations;
        if (this.hasHardViolation(violations)) {
          continue;
        }
      }
      recommendations.push(recommendation);
    }
    if (includeUnscored) {
      const discovery = getModelDiscoveryService();
      const discovered = await discovery.getModelsForTask(request.taskType);
      const scoredModelIds = new Set(scores.map((s) => `${s.provider}:${s.modelId}`));
      for (const model of discovered) {
        const key = `${model.provider}:${model.modelId}`;
        if (!scoredModelIds.has(key)) {
          recommendations.push(this.discoveredToRecommendation(model, weights));
        }
      }
    }
    recommendations.sort((a, b) => b.compositeScore - a.compositeScore);
    const filtered = this.applyExclusions(recommendations, request.constraints);
    return filtered.slice(0, limit);
  }
  /**
   * Convert a score record to a recommendation
   */
  scoreToRecommendation(score, weights) {
    const compositeScore = score.qualityScore * weights.quality + score.speedScore * weights.speed + score.costScore * weights.cost + score.reliabilityScore * weights.reliability;
    return {
      provider: score.provider,
      modelId: score.modelId,
      compositeScore,
      qualityScore: score.qualityScore,
      speedScore: score.speedScore,
      costScore: score.costScore,
      reliabilityScore: score.reliabilityScore
    };
  }
  /**
   * Convert a discovered model to a recommendation (using estimated scores)
   */
  discoveredToRecommendation(model, weights) {
    const qualityScore = this.estimateQualityScore(model);
    const speedScore = this.estimateSpeedScore(model);
    const costScore = this.estimateCostScore(model);
    const reliabilityScore = 50;
    const compositeScore = qualityScore * weights.quality + speedScore * weights.speed + costScore * weights.cost + reliabilityScore * weights.reliability;
    return {
      provider: model.provider,
      modelId: model.modelId,
      compositeScore,
      qualityScore,
      speedScore,
      costScore,
      reliabilityScore,
      modelName: model.name,
      contextWindow: model.contextWindow,
      inputPricePerMillion: model.inputPricePerMillion,
      outputPricePerMillion: model.outputPricePerMillion,
      matchReason: "Estimated scores (not yet evaluated)"
    };
  }
  /**
   * Estimate quality score based on model properties
   */
  estimateQualityScore(model) {
    let score = 50;
    if (model.contextWindow) {
      if (model.contextWindow >= 128e3) score += 15;
      else if (model.contextWindow >= 32e3) score += 10;
      else if (model.contextWindow >= 8e3) score += 5;
    }
    if (model.capabilities) {
      score += model.capabilities.length * 3;
    }
    if (model.capabilities?.includes("reasoning")) {
      score += 10;
    }
    return Math.min(100, score);
  }
  /**
   * Estimate speed score based on model properties
   */
  estimateSpeedScore(model) {
    if (model.modelId.includes("mini")) return 85;
    if (model.modelId.includes("small")) return 80;
    if (model.modelId.includes("pro")) return 40;
    if (model.modelId.includes("large")) return 45;
    return 60;
  }
  /**
   * Estimate cost score based on pricing
   */
  estimateCostScore(model) {
    const inputPrice = model.inputPricePerMillion || 0;
    const outputPrice = model.outputPricePerMillion || 0;
    const avgPrice = (inputPrice + outputPrice) / 2;
    if (avgPrice === 0) return 50;
    if (avgPrice < 0.5) return 95;
    if (avgPrice < 2) return 80;
    if (avgPrice < 5) return 65;
    if (avgPrice < 15) return 50;
    if (avgPrice < 30) return 35;
    return 20;
  }
  /**
   * Check recommendation against constraints
   */
  checkConstraints(recommendation, constraints) {
    const violations = [];
    if (!constraints) return violations;
    if (constraints.minQualityScore !== void 0 && recommendation.qualityScore < constraints.minQualityScore) {
      violations.push(
        `Quality score ${recommendation.qualityScore.toFixed(1)} below minimum ${constraints.minQualityScore}`
      );
    }
    return violations;
  }
  /**
   * Check if any violations are hard (should exclude model)
   */
  hasHardViolation(violations) {
    return false;
  }
  /**
   * Apply exclusion filters from constraints
   */
  applyExclusions(recommendations, constraints) {
    if (!constraints) return recommendations;
    let filtered = recommendations;
    if (constraints.excludeProviders && constraints.excludeProviders.length > 0) {
      const excluded = new Set(constraints.excludeProviders);
      filtered = filtered.filter((r) => !excluded.has(r.provider));
    }
    if (constraints.excludeModels && constraints.excludeModels.length > 0) {
      const excluded = new Set(constraints.excludeModels);
      filtered = filtered.filter((r) => !excluded.has(r.modelId));
    }
    return filtered;
  }
  /**
   * Clear the in-memory cache
   */
  clearCache() {
    this.inMemoryCache.clear();
  }
  /**
   * Cleanup expired entries from cache
   */
  async cleanupExpired() {
    const now = Date.now();
    for (const [key, value] of this.inMemoryCache) {
      if (value.expiresAt < now) {
        this.inMemoryCache.delete(key);
      }
    }
    await this.repository.clearExpiredRecommendations();
  }
};
var engineInstance = null;
function getRecommendationEngine(db2) {
  if (!engineInstance) {
    engineInstance = new RecommendationEngine(db2);
  }
  return engineInstance;
}
var LATENCY_THRESHOLDS = {
  excellent: 500,
  // < 500ms = 100 score
  good: 1e3,
  // < 1000ms = 80 score
  acceptable: 2e3,
  // < 2000ms = 60 score
  slow: 5e3
  // < 5000ms = 40 score
  // > 5000ms = 20 score
};
var COST_THRESHOLDS = {
  // Cost per 1M tokens (input + output average)
  cheap: 0.5,
  // < $0.50 = 100 score
  affordable: 2,
  // < $2 = 80 score
  moderate: 5,
  // < $5 = 60 score
  expensive: 15
  // < $15 = 40 score
  // > $15 = 20 score
};
var ScoreAggregator = class {
  repository;
  constructor(db2) {
    this.repository = getEvalRepository(db2);
  }
  /**
   * Aggregate scores for a specific model and task type
   */
  async aggregateModelScores(provider, modelId, taskType, options = {}) {
    const { sinceDate, minEvaluations = 1, persist = true } = options;
    const evaluations = await this.repository.queryEvaluations({
      provider,
      modelId,
      status: "completed",
      limit: 100
    });
    let relevantEvals = evaluations.filter((e) => {
      const benchmarkTaskType = e.benchmarkId.split(".")[0];
      return benchmarkTaskType === taskType;
    });
    if (sinceDate) {
      relevantEvals = relevantEvals.filter(
        (e) => e.completedAt && e.completedAt >= sinceDate
      );
    }
    if (relevantEvals.length < minEvaluations) {
      return null;
    }
    const scores = this.calculateScoreComponents(relevantEvals, provider, modelId);
    const compositeScore = scores.quality * 0.4 + scores.speed * 0.25 + scores.cost * 0.25 + scores.reliability * 0.1;
    const evaluationIds = relevantEvals.map((e) => e.id);
    if (persist) {
      await this.repository.upsertScore({
        provider,
        modelId,
        taskType,
        qualityScore: scores.quality,
        speedScore: scores.speed,
        costScore: scores.cost,
        reliabilityScore: scores.reliability,
        compositeScore,
        evaluationIds
      });
    }
    return {
      id: `${provider}:${modelId}:${taskType}`,
      provider,
      modelId,
      taskType,
      qualityScore: scores.quality,
      speedScore: scores.speed,
      costScore: scores.cost,
      reliabilityScore: scores.reliability,
      compositeScore,
      evaluationIds,
      orgId: null,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  /**
   * Aggregate scores for all models with recent evaluations
   */
  async aggregateAllScores(taskType, options = {}) {
    const evaluations = await this.repository.queryEvaluations({
      status: "completed",
      limit: 1e3
    });
    const byModel = /* @__PURE__ */ new Map();
    for (const eval_ of evaluations) {
      const key = `${eval_.provider}:${eval_.modelId}`;
      if (!byModel.has(key)) {
        byModel.set(key, []);
      }
      byModel.get(key).push(eval_);
    }
    const results = [];
    for (const [key, modelEvals] of byModel) {
      const [provider, modelId] = key.split(":");
      const score = await this.aggregateModelScores(
        provider,
        modelId,
        taskType,
        { ...options, persist: options.persist }
      );
      if (score) {
        results.push(score);
      }
    }
    results.sort((a, b) => b.compositeScore - a.compositeScore);
    return results;
  }
  /**
   * Calculate score components from evaluations
   */
  calculateScoreComponents(evaluations, provider, modelId) {
    if (evaluations.length === 0) {
      return { quality: 50, speed: 50, cost: 50, reliability: 50 };
    }
    const qualityScores = evaluations.map((e) => e.overallScore * 100);
    const qualityAvg = this.average(qualityScores);
    const latencies = evaluations.map((e) => e.latencyP50Ms);
    const avgLatency = this.average(latencies);
    const speedScore = this.latencyToScore(avgLatency);
    const costScore = this.calculateCostScore(evaluations, provider, modelId);
    const successRate = evaluations.filter((e) => e.status === "completed").length / evaluations.length;
    const scoreVariance = this.variance(qualityScores);
    const consistencyBonus = Math.max(0, 20 - scoreVariance);
    const reliabilityScore = successRate * 80 + consistencyBonus;
    return {
      quality: Math.round(qualityAvg),
      speed: Math.round(speedScore),
      cost: Math.round(costScore),
      reliability: Math.round(Math.min(100, reliabilityScore))
    };
  }
  /**
   * Convert latency to 0-100 score
   */
  latencyToScore(latencyMs) {
    if (latencyMs < LATENCY_THRESHOLDS.excellent) return 100;
    if (latencyMs < LATENCY_THRESHOLDS.good) return 80;
    if (latencyMs < LATENCY_THRESHOLDS.acceptable) return 60;
    if (latencyMs < LATENCY_THRESHOLDS.slow) return 40;
    return 20;
  }
  /**
   * Calculate cost score from evaluations or model metadata
   */
  calculateCostScore(evaluations, provider, modelId) {
    const costs = evaluations.filter((e) => e.estimatedCostCents > 0).map((e) => {
      const totalTokens = e.totalInputTokens + e.totalOutputTokens;
      if (totalTokens === 0) return 0;
      return e.estimatedCostCents / 100 / (totalTokens / 1e6);
    }).filter((c) => c > 0);
    if (costs.length > 0) {
      const avgCostPerMillion = this.average(costs);
      return this.costToScore(avgCostPerMillion);
    }
    const discovery = getModelDiscoveryService();
    return 50;
  }
  /**
   * Convert cost per million tokens to 0-100 score
   */
  costToScore(costPerMillion) {
    if (costPerMillion < COST_THRESHOLDS.cheap) return 100;
    if (costPerMillion < COST_THRESHOLDS.affordable) return 80;
    if (costPerMillion < COST_THRESHOLDS.moderate) return 60;
    if (costPerMillion < COST_THRESHOLDS.expensive) return 40;
    return 20;
  }
  /**
   * Calculate average of numbers
   */
  average(values) {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }
  /**
   * Calculate variance of numbers
   */
  variance(values) {
    if (values.length < 2) return 0;
    const avg = this.average(values);
    const squaredDiffs = values.map((v) => Math.pow(v - avg, 2));
    return this.average(squaredDiffs);
  }
};
var aggregatorInstance = null;
function getScoreAggregator(db2) {
  if (!aggregatorInstance) {
    aggregatorInstance = new ScoreAggregator(db2);
  }
  return aggregatorInstance;
}
init_benchmark_registry();
var CATALOG_SERVICE_URL2 = resolveServiceUrl(ServiceId.CATALOG);
var SERVICE_HEADERS = {
  "X-Service-Auth": process.env.CATALOG_INTERNAL_SERVICE_TOKEN || "internal"
};
var PROVIDER_CONFIGS = {
  openai: {
    name: "OpenAI Provider Configuration",
    description: "Configuration for OpenAI API integration",
    tags: ["ai", "llm", "openai", "integration"],
    metadata: {
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      authType: "bearer",
      endpoints: {
        "chat.completions": "/chat/completions",
        "responses": "/responses",
        "embeddings": "/embeddings"
      },
      defaultModel: "gpt-4o-mini",
      supportedOperations: ["chat.completions", "responses", "embeddings"]
    }
  },
  anthropic: {
    name: "Anthropic Provider Configuration",
    description: "Configuration for Anthropic Claude API",
    tags: ["ai", "llm", "anthropic", "integration"],
    metadata: {
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      authType: "header",
      authHeader: "x-api-key",
      endpoints: {
        messages: "/messages"
      },
      // MEASURED, NOT ASSUMED. claude-sonnet-4-20250514 sat here until 24 Aug
      // and Anthropic rejects it — verified the same day through
      // /api/integrations/execute, which answered 502 "Anthropic API error:
      // model: claude-sonnet-4-20250514". The provider's own /v1/models does
      // not list it either. This sync writes the catalog's advertised default,
      // so a dead id here propagates to every caller that trusts the catalog.
      defaultModel: "claude-sonnet-5",
      supportedOperations: ["messages"]
    }
  },
  huggingface: {
    name: "HuggingFace Provider Configuration",
    description: "Configuration for HuggingFace Inference API",
    tags: ["ai", "llm", "huggingface", "integration"],
    metadata: {
      provider: "huggingface",
      baseUrl: "https://router.huggingface.co",
      authType: "bearer",
      endpoints: {
        "chat.completions": "/v1/chat/completions",
        "text.generation": "/v1/chat/completions",
        embeddings: "/v1/embeddings"
      },
      defaultModel: "meta-llama/Llama-3.2-3B-Instruct",
      supportedOperations: ["text.generation", "chat.completions", "embeddings"],
      note: "Uses OpenAI-compatible API format"
    }
  }
};
var CatalogSyncService = class {
  discoveryService = getModelDiscoveryService();
  /**
   * Sync all discovered models to the catalog
   */
  async syncModels(options = {}) {
    const {
      providers = getRegisteredProviders(),
      apiKeys = {},
      dryRun = false,
      forceUpdate = false
    } = options;
    const result = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      resources: [],
      syncedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const supportedProviders = providers.filter(
      (p) => ["openai", "anthropic", "huggingface"].includes(p)
    );
    const discoveryResult = await this.discoveryService.discoverModels({
      providers: supportedProviders,
      apiKeys,
      includeDeprecated: false
    });
    for (const provider of supportedProviders) {
      try {
        const configResource = this.createProviderConfigResource(provider, discoveryResult.models);
        const syncResult = await this.syncResource(configResource, dryRun, forceUpdate);
        this.updateResultCounts(result, syncResult);
        result.resources.push(configResource);
      } catch (error) {
        result.errors.push({
          key: `integrations/ai/${provider}/config`,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
    for (const err of discoveryResult.errors) {
      result.errors.push({
        key: `discovery/${err.provider}`,
        error: err.error
      });
    }
    for (const model of discoveryResult.models) {
      try {
        const modelResource = this.createModelResource(model);
        const syncResult = await this.syncResource(modelResource, dryRun, forceUpdate);
        this.updateResultCounts(result, syncResult);
        result.resources.push(modelResource);
      } catch (error) {
        result.errors.push({
          key: `integrations/ai/${model.provider}/models/${model.modelId}`,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
    return result;
  }
  /**
   * Generate catalog resources without syncing (for preview/export)
   */
  async generateResources(options = {}) {
    const {
      providers = getRegisteredProviders(),
      apiKeys = {}
    } = options;
    const resources = [];
    const supportedProviders = providers.filter(
      (p) => ["openai", "anthropic", "huggingface"].includes(p)
    );
    const discoveryResult = await this.discoveryService.discoverModels({
      providers: supportedProviders,
      apiKeys,
      includeDeprecated: false
    });
    for (const provider of supportedProviders) {
      resources.push(this.createProviderConfigResource(provider, discoveryResult.models));
    }
    for (const model of discoveryResult.models) {
      resources.push(this.createModelResource(model));
    }
    return resources;
  }
  /**
   * Export resources to JSON format (for bootstrap file)
   */
  async exportToJson(options = {}) {
    const resources = await this.generateResources(options);
    return JSON.stringify(resources, null, 2);
  }
  // =============================================================================
  // Private Methods
  // =============================================================================
  /**
   * A default model the provider actually serves, or nothing.
   *
   * PROVIDER_CONFIGS carries a hand-written defaultModel per provider, and this
   * routine used to copy it into the catalog unchanged — a "sync" that
   * propagated whatever a human last typed. Measured 24 Aug: it advertised
   * anthropic's default as claude-sonnet-4-20250514, which that provider's own
   * API rejects with 502, and running the sync wrote it to the catalog with the
   * authority of a refresh (F51).
   *
   * The discovered models passed to generateResources come from the provider's
   * live list. If one is present for this provider, it is a name the provider
   * just told us it serves, which beats a name we wrote down.
   *
   * Returns undefined rather than guessing when nothing was discovered — the
   * constant is then used, and being a stale constant is better than being a
   * fabricated one.
   */
  discoveredDefaultFor(provider, discovered) {
    if (!discovered?.length) return void 0;
    const mine = discovered.filter((m) => m.provider === provider);
    if (!mine.length) return void 0;
    return mine[0].modelId;
  }
  createProviderConfigResource(provider, discovered) {
    const config2 = PROVIDER_CONFIGS[provider];
    if (!config2) {
      throw new Error(`No config template for provider: ${provider}`);
    }
    const live = this.discoveredDefaultFor(provider, discovered);
    const metadata = { ...config2.metadata || {} };
    if (live && metadata.defaultModel !== live) {
      console.log(
        `[catalog-sync] ${provider} defaultModel: template says ${metadata.defaultModel}, provider serves ${live} \u2014 using the provider's`
      );
      metadata.defaultModel = live;
      metadata.defaultModelSource = "provider listing at sync time";
    } else if (!live) {
      metadata.defaultModelSource = "local template \u2014 provider was not listed at sync time";
    }
    return {
      id: `int-${provider}-config`,
      key: `integrations/ai/${provider}/config`,
      name: config2.name || `${provider} Provider Configuration`,
      description: config2.description,
      type: "integration",
      status: "published",
      isBootstrap: true,
      tags: config2.tags || ["ai", "llm", provider, "integration"],
      accessPolicy: {
        visibility: "public",
        actions: {
          read: { anyOf: ["public"] },
          write: { anyOf: ["role:admin"] }
        }
      },
      metadata
    };
  }
  createModelResource(model) {
    const modelIdClean = model.modelId.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").toLowerCase();
    const id = `int-${model.provider}-${modelIdClean}`.slice(0, 64);
    const capabilityTags = model.capabilities || [];
    const isEmbedding = capabilityTags.includes("embedding");
    const isReasoning = capabilityTags.includes("reasoning");
    const tags = [
      "ai",
      isEmbedding ? "embedding" : "llm",
      model.provider,
      "model"
    ];
    if (isReasoning) tags.push("reasoning");
    if (capabilityTags.includes("vision")) tags.push("vision");
    if (capabilityTags.includes("function_calling")) tags.push("function_calling");
    if (capabilityTags.includes("open_source")) tags.push("open-source");
    return {
      id,
      key: `integrations/ai/${model.provider}/models/${model.modelId}`,
      name: model.name || model.modelId,
      description: model.description || `${model.provider} model: ${model.modelId}`,
      type: "integration",
      status: "published",
      isBootstrap: true,
      tags,
      metadata: {
        provider: model.provider,
        modelId: model.modelId,
        displayName: model.name || model.modelId,
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxOutputTokens,
        inputPricePerMillion: model.inputPricePerMillion,
        outputPricePerMillion: model.outputPricePerMillion,
        supportedOperations: isEmbedding ? ["embeddings"] : ["chat.completions"],
        capabilities: model.capabilities,
        deprecated: model.deprecated
      }
    };
  }
  async syncResource(resource, dryRun, forceUpdate) {
    if (dryRun) {
      return "skipped";
    }
    try {
      const existingResponse = await fetch(
        `${CATALOG_SERVICE_URL2}/api/resources?key=${encodeURIComponent(resource.key)}`,
        { headers: SERVICE_HEADERS }
      );
      if (existingResponse.ok) {
        const existing = await existingResponse.json();
        if (existing.length > 0) {
          if (!forceUpdate) {
            return "skipped";
          }
          const updateResponse = await fetch(
            `${CATALOG_SERVICE_URL2}/api/resources/${existing[0].id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json", ...SERVICE_HEADERS },
              body: JSON.stringify({
                name: resource.name,
                description: resource.description,
                tags: resource.tags,
                metadata: resource.metadata
              })
            }
          );
          if (!updateResponse.ok) {
            throw new Error(`Failed to update: ${updateResponse.statusText}`);
          }
          return "updated";
        }
      }
      const createResponse = await fetch(`${CATALOG_SERVICE_URL2}/api/resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...SERVICE_HEADERS },
        body: JSON.stringify(resource)
      });
      if (!createResponse.ok) {
        const detail = await createResponse.text().catch(() => "");
        throw new Error(
          `Failed to create: ${createResponse.status} ${createResponse.statusText}${detail ? ` \u2014 ${detail.slice(0, 200)}` : ""}`
        );
      }
      return "created";
    } catch (error) {
      throw error;
    }
  }
  updateResultCounts(result, status) {
    switch (status) {
      case "created":
        result.created++;
        break;
      case "updated":
        result.updated++;
        break;
      case "skipped":
        result.skipped++;
        break;
    }
  }
};
var syncServiceInstance = null;
function getCatalogSyncService() {
  if (!syncServiceInstance) {
    syncServiceInstance = new CatalogSyncService();
  }
  return syncServiceInstance;
}
function getParam(params, key) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value ?? "";
}
function createEvalRoutes(db2) {
  const router = (0, import_express.Router)();
  const runner = getBenchmarkRunner(db2);
  const repository = getEvalRepository(db2);
  const recommendationEngine = getRecommendationEngine(db2);
  const scoreAggregator = getScoreAggregator(db2);
  router.get("/benchmarks", async (_req, res) => {
    try {
      const taskType = _req.query.taskType;
      let benchmarks;
      if (taskType) {
        const parsed = taskTypeSchema.safeParse(taskType);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid task type",
            details: fromError(parsed.error).message
          });
        }
        benchmarks = getBenchmarksByTaskType(parsed.data);
      } else {
        benchmarks = getAllBenchmarks();
      }
      const summaries = benchmarks.map((b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        version: b.version,
        taskType: b.taskType,
        category: b.category,
        testCaseCount: b.testCases.length
      }));
      res.json({
        benchmarks: summaries,
        summary: getBenchmarkSummary()
      });
    } catch (error) {
      console.error("[eval-routes] Error listing benchmarks:", error);
      res.status(500).json({ error: "Failed to list benchmarks" });
    }
  });
  router.get("/benchmarks/:id", async (req, res) => {
    try {
      const benchmark = getBenchmark(getParam(req.params, "id"));
      if (!benchmark) {
        return res.status(404).json({ error: "Benchmark not found" });
      }
      res.json(benchmark);
    } catch (error) {
      console.error("[eval-routes] Error getting benchmark:", error);
      res.status(500).json({ error: "Failed to get benchmark" });
    }
  });
  router.post("/benchmarks/run", async (req, res) => {
    try {
      const parsed = runBenchmarkRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: fromError(parsed.error).message
        });
      }
      const { provider, modelId, benchmarkId, testCaseIds, seed, mock } = parsed.data;
      let apiKey = "";
      if (!mock) {
        const headerKey = req.headers["x-api-key"];
        const envKeyMap = {
          openai: process.env.OPENAI_API_KEY,
          anthropic: process.env.ANTHROPIC_API_KEY,
          google: process.env.GOOGLE_API_KEY,
          mistral: process.env.MISTRAL_API_KEY,
          cohere: process.env.COHERE_API_KEY,
          huggingface: process.env.HUGGINGFACE_API_KEY
        };
        apiKey = headerKey || envKeyMap[provider] || "";
        if (!apiKey) {
          return res.status(401).json({
            error: "API key required",
            details: `Provide API key in X-API-Key header or set ${provider.toUpperCase()}_API_KEY environment variable, or use mock=true for testing`
          });
        }
      }
      const result = await runner.runBenchmark(
        {
          provider,
          modelId,
          benchmarkId,
          testCaseIds,
          seed,
          parallelism: 3,
          retries: 1,
          scope: "global"
        },
        {
          apiKey,
          parallelism: 3,
          timeout: 3e4,
          retries: 1,
          mockMode: mock
        }
      );
      res.json(result);
    } catch (error) {
      console.error("[eval-routes] Error running benchmark:", error);
      res.status(500).json({
        error: "Failed to run benchmark",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  router.get("/evaluations", async (req, res) => {
    try {
      const query = {
        provider: req.query.provider,
        modelId: req.query.modelId,
        benchmarkId: req.query.benchmarkId,
        status: req.query.status,
        limit: req.query.limit ? parseInt(req.query.limit, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset, 10) : 0
      };
      const evaluations = await repository.queryEvaluations(query);
      const summaries = evaluations.map((e) => ({
        id: e.id,
        provider: e.provider,
        modelId: e.modelId,
        benchmarkId: e.benchmarkId,
        benchmarkVersion: e.benchmarkVersion,
        overallScore: e.overallScore,
        accuracy: e.accuracy,
        latencyP50Ms: e.latencyP50Ms,
        latencyP95Ms: e.latencyP95Ms,
        status: e.status,
        startedAt: e.startedAt,
        completedAt: e.completedAt,
        testCaseCount: e.testCaseResults.length
      }));
      res.json({
        evaluations: summaries,
        count: summaries.length,
        limit: query.limit,
        offset: query.offset
      });
    } catch (error) {
      console.error("[eval-routes] Error querying evaluations:", error);
      res.status(500).json({ error: "Failed to query evaluations" });
    }
  });
  router.get("/evaluations/:id", async (req, res) => {
    try {
      const evaluation = await repository.getEvaluation(getParam(req.params, "id"));
      if (!evaluation) {
        return res.status(404).json({ error: "Evaluation not found" });
      }
      res.json(evaluation);
    } catch (error) {
      console.error("[eval-routes] Error getting evaluation:", error);
      res.status(500).json({ error: "Failed to get evaluation" });
    }
  });
  router.get("/scores", async (req, res) => {
    try {
      const query = {
        provider: req.query.provider,
        modelId: req.query.modelId,
        taskType: req.query.taskType
      };
      const scores = await repository.queryScores(query);
      res.json({
        scores,
        count: scores.length
      });
    } catch (error) {
      console.error("[eval-routes] Error querying scores:", error);
      res.status(500).json({ error: "Failed to query scores" });
    }
  });
  router.post("/scores/aggregate", async (req, res) => {
    try {
      const taskType = taskTypeSchema.safeParse(req.body.taskType);
      if (!taskType.success) {
        return res.status(400).json({
          error: "Invalid task type",
          details: fromError(taskType.error).message
        });
      }
      const scores = await scoreAggregator.aggregateAllScores(taskType.data, {
        persist: true
      });
      res.json({
        message: "Score aggregation complete",
        modelsProcessed: scores.length,
        scores
      });
    } catch (error) {
      console.error("[eval-routes] Error aggregating scores:", error);
      res.status(500).json({ error: "Failed to aggregate scores" });
    }
  });
  router.post("/recommendations", async (req, res) => {
    try {
      const parsed = recommendationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: fromError(parsed.error).message
        });
      }
      const recommendations = await recommendationEngine.getRecommendations(
        parsed.data,
        { useCache: true }
      );
      res.json(recommendations);
    } catch (error) {
      console.error("[eval-routes] Error getting recommendations:", error);
      res.status(500).json({ error: "Failed to get recommendations" });
    }
  });
  router.get("/models", async (req, res) => {
    try {
      const taskType = req.query.taskType;
      const providers = req.query.providers ? req.query.providers.split(",") : void 0;
      let models;
      if (taskType) {
        const parsed = taskTypeSchema.safeParse(taskType);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid task type",
            details: fromError(parsed.error).message
          });
        }
        models = await getModelsForTask(parsed.data, { providers });
      } else {
        const result = await discoverAllModels({ providers });
        models = result.models;
      }
      res.json({
        models,
        count: models.length
      });
    } catch (error) {
      console.error("[eval-routes] Error discovering models:", error);
      res.status(500).json({ error: "Failed to discover models" });
    }
  });
  router.post("/catalog/sync", async (req, res) => {
    try {
      const syncService = getCatalogSyncService();
      const providers = req.body.providers ? req.body.providers : void 0;
      const dryRun = req.body.dryRun === true;
      const forceUpdate = req.body.forceUpdate === true;
      const apiKeys = {};
      const orgId = req.headers["x-org-id"] || process.env.SYMBIA_ORG_ID;
      const principal = process.env.INTEGRATIONS_SERVICE_PRINCIPAL_ID || "650e8400-e29b-41d4-a716-446655440000";
      for (const provider of providers ?? ["openai", "anthropic", "huggingface"]) {
        try {
          const cred = await getCredential(principal, orgId ?? null, provider, "");
          if (cred?.apiKey) apiKeys[provider] = cred.apiKey;
        } catch {
        }
      }
      const result = await syncService.syncModels({
        providers,
        dryRun,
        forceUpdate,
        apiKeys
      });
      res.json({
        message: dryRun ? "Dry run complete" : "Catalog sync complete",
        ...result
      });
    } catch (error) {
      console.error("[eval-routes] Error syncing to catalog:", error);
      res.status(500).json({
        error: "Failed to sync to catalog",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  router.get("/catalog/preview", async (req, res) => {
    try {
      const syncService = getCatalogSyncService();
      const providers = req.query.providers ? req.query.providers.split(",") : void 0;
      const resources = await syncService.generateResources({ providers });
      res.json({
        resources,
        count: resources.length,
        providers: [...new Set(resources.map((r) => r.metadata.provider).filter(Boolean))]
      });
    } catch (error) {
      console.error("[eval-routes] Error previewing catalog resources:", error);
      res.status(500).json({ error: "Failed to preview catalog resources" });
    }
  });
  router.get("/catalog/export", async (req, res) => {
    try {
      const syncService = getCatalogSyncService();
      const providers = req.query.providers ? req.query.providers.split(",") : void 0;
      const json3 = await syncService.exportToJson({ providers });
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="integrations-bootstrap-${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.json"`
      );
      res.send(json3);
    } catch (error) {
      console.error("[eval-routes] Error exporting catalog resources:", error);
      res.status(500).json({ error: "Failed to export catalog resources" });
    }
  });
  return router;
}
async function initializeModelEvalSystem() {
  const { initializeBuiltinBenchmarks: initializeBuiltinBenchmarks2 } = await Promise.resolve().then(() => (init_benchmark_registry(), benchmark_registry_exports));
  initializeBuiltinBenchmarks2();
  console.log("[model-eval] System initialized");
}
init_schema();
init_db();
var ChannelProviderRegistry = class {
  providers = /* @__PURE__ */ new Map();
  register(provider, enabled = true) {
    this.providers.set(provider.type, { provider, enabled });
    console.log(`[channels] Registered provider: ${provider.type} (${provider.name})`);
  }
  get(type) {
    const entry = this.providers.get(type);
    return entry?.enabled ? entry.provider : void 0;
  }
  getAll() {
    return Array.from(this.providers.values()).filter((e) => e.enabled).map((e) => e.provider);
  }
  isRegistered(type) {
    return this.providers.has(type) && this.providers.get(type).enabled;
  }
  setEnabled(type, enabled) {
    const entry = this.providers.get(type);
    if (entry) {
      entry.enabled = enabled;
    }
  }
};
var channelProviders = new ChannelProviderRegistry();
var TELEGRAM_API_BASE = "https://api.telegram.org";
var POLLING_INTERVAL_MS = 1e3;
var POLLING_TIMEOUT_S = 30;
var activePollers = /* @__PURE__ */ new Map();
var TelegramProvider = class {
  type = "telegram";
  name = "Telegram";
  connectionMode = "webhook";
  capabilities = {
    directMessages: true,
    groupChats: true,
    threads: false,
    // Telegram has reply threads but not true threading
    reactions: true,
    fileAttachments: true,
    voiceMessages: true,
    edits: true,
    deletions: true,
    typing: true,
    readReceipts: false
  };
  formatting = {
    maxLength: 4096,
    supportsMarkdown: true,
    supportsHtml: true,
    supportsMentions: true,
    supportsEmoji: true
  };
  /**
   * Call Telegram Bot API
   */
  async callApi(botToken, method, params) {
    const url = `${TELEGRAM_API_BASE}/bot${botToken}/${method}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: params ? JSON.stringify(params) : void 0
    });
    return response.json();
  }
  async initConnection(ctx, credential, config2) {
    try {
      const meResponse = await this.callApi(credential, "getMe");
      if (!meResponse.ok || !meResponse.result) {
        return {
          success: false,
          status: "error",
          error: meResponse.description || "Invalid bot token"
        };
      }
      const bot = meResponse.result;
      const usePolling = config2?.usePolling === true || process.env.TELEGRAM_USE_POLLING === "true";
      if (usePolling) {
        console.log(`[telegram] Using polling mode for connection ${ctx.connectionId}`);
        await this.callApi(credential, "deleteWebhook", {
          drop_pending_updates: config2?.dropPendingUpdates ?? false
        });
        this.startPolling(ctx.connectionId, credential);
        return {
          success: true,
          status: "connected",
          metadata: {
            botId: bot.id,
            botUsername: bot.username,
            botName: `${bot.first_name}${bot.last_name ? ` ${bot.last_name}` : ""}`,
            connectionMode: "polling"
          }
        };
      }
      const baseUrl = config2?.webhookBaseUrl || process.env.INTEGRATIONS_WEBHOOK_BASE_URL || "https://api.symbia.ai";
      const webhookPath = `/api/integrations/channels/telegram/webhook/${ctx.connectionId}`;
      const webhookUrl = `${baseUrl}${webhookPath}`;
      const webhookSecret = createHmac("sha256", credential).update(ctx.connectionId).digest("hex").slice(0, 32);
      const webhookResponse = await this.callApi(credential, "setWebhook", {
        url: webhookUrl,
        secret_token: webhookSecret,
        allowed_updates: ["message", "edited_message", "channel_post"],
        drop_pending_updates: config2?.dropPendingUpdates ?? false
      });
      if (!webhookResponse.ok) {
        return {
          success: false,
          status: "error",
          error: webhookResponse.description || "Failed to set webhook"
        };
      }
      return {
        success: true,
        status: "connected",
        webhookUrl,
        webhookSecret,
        metadata: {
          botId: bot.id,
          botUsername: bot.username,
          botName: `${bot.first_name}${bot.last_name ? ` ${bot.last_name}` : ""}`,
          connectionMode: "webhook"
        }
      };
    } catch (error) {
      return {
        success: false,
        status: "error",
        error: error instanceof Error ? error.message : "Connection failed"
      };
    }
  }
  /**
   * Start polling loop for a connection
   */
  startPolling(connectionId, botToken) {
    if (activePollers.has(connectionId)) {
      console.log(`[telegram] Poller already running for ${connectionId}`);
      return;
    }
    let running = true;
    let offset = 0;
    const poller = {
      running: true,
      offset: 0,
      stop: () => {
        running = false;
        poller.running = false;
      }
    };
    activePollers.set(connectionId, poller);
    const poll = async () => {
      while (running) {
        try {
          const response = await this.callApi(botToken, "getUpdates", {
            offset: offset > 0 ? offset : void 0,
            timeout: POLLING_TIMEOUT_S,
            allowed_updates: ["message", "edited_message", "channel_post"]
          });
          if (!response.ok || !response.result) {
            console.error(`[telegram] Polling error for ${connectionId}:`, response.description);
            await this.sleep(POLLING_INTERVAL_MS * 5);
            continue;
          }
          for (const update of response.result) {
            offset = update.update_id + 1;
            poller.offset = offset;
            const parsed = this.parseWebhook({}, update);
            if (parsed.type === "message" && parsed.message) {
              parsed.message.connectionId = connectionId;
              const runId = `run_poll_${randomUUID().slice(0, 8)}`;
              console.log(
                `[telegram] Polled message for ${connectionId}: ${parsed.message.text?.slice(0, 50)}...`
              );
              handleInboundMessage(parsed.message, runId).catch((error) => {
                console.error(`[telegram] Error handling inbound message:`, error);
              });
            }
          }
        } catch (error) {
          console.error(`[telegram] Polling error for ${connectionId}:`, error);
          await this.sleep(POLLING_INTERVAL_MS * 5);
        }
      }
      activePollers.delete(connectionId);
      console.log(`[telegram] Polling stopped for ${connectionId}`);
    };
    poll().catch((error) => {
      console.error(`[telegram] Fatal polling error for ${connectionId}:`, error);
      activePollers.delete(connectionId);
    });
    console.log(`[telegram] Polling started for ${connectionId}`);
  }
  /**
   * Stop polling for a connection
   */
  stopPolling(connectionId) {
    const poller = activePollers.get(connectionId);
    if (poller) {
      poller.stop();
    }
  }
  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  async getStatus(ctx, sessionData) {
    const botToken = sessionData?.botToken;
    if (!botToken) {
      return {
        status: "error",
        error: "No bot token in session data"
      };
    }
    const isPolling = activePollers.has(ctx.connectionId);
    try {
      const meResponse = await this.callApi(botToken, "getMe");
      if (!meResponse.ok || !meResponse.result) {
        return {
          status: "error",
          error: meResponse.description || "Failed to get bot info"
        };
      }
      if (isPolling) {
        const poller = activePollers.get(ctx.connectionId);
        return {
          status: poller?.running ? "connected" : "error",
          channelAccountId: String(meResponse.result.id),
          channelAccountName: meResponse.result.username,
          lastPingAt: /* @__PURE__ */ new Date(),
          metadata: {
            connectionMode: "polling",
            pollingOffset: poller?.offset
          }
        };
      }
      const webhookResponse = await this.callApi(botToken, "getWebhookInfo");
      const webhook = webhookResponse.result;
      const hasError = webhook?.last_error_message;
      return {
        status: hasError ? "error" : "connected",
        channelAccountId: String(meResponse.result.id),
        channelAccountName: meResponse.result.username,
        lastPingAt: /* @__PURE__ */ new Date(),
        error: webhook?.last_error_message,
        metadata: {
          connectionMode: "webhook",
          pendingUpdates: webhook?.pending_update_count,
          webhookUrl: webhook?.url
        }
      };
    } catch (error) {
      return {
        status: "error",
        error: error instanceof Error ? error.message : "Status check failed"
      };
    }
  }
  async disconnect(ctx, sessionData) {
    const botToken = sessionData?.botToken;
    this.stopPolling(ctx.connectionId);
    if (!botToken) {
      return { success: true };
    }
    try {
      const response = await this.callApi(botToken, "deleteWebhook", {
        drop_pending_updates: true
      });
      return {
        success: response.ok,
        error: response.ok ? void 0 : response.description
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Disconnect failed"
      };
    }
  }
  async sendMessage(ctx, message, credential, sessionData) {
    try {
      const parseMode = message.formatting?.parseMode === "html" ? "HTML" : message.formatting?.parseMode === "markdown" ? "MarkdownV2" : void 0;
      const params = {
        chat_id: message.chatId,
        text: message.text,
        parse_mode: parseMode,
        disable_web_page_preview: message.formatting?.disablePreview,
        disable_notification: message.formatting?.silent
      };
      if (message.replyToMessageId) {
        params.reply_to_message_id = parseInt(message.replyToMessageId);
      }
      const response = await this.callApi(
        credential,
        "sendMessage",
        params
      );
      if (!response.ok || !response.result) {
        return {
          success: false,
          error: response.description || "Failed to send message"
        };
      }
      return {
        success: true,
        messageId: String(response.result.message_id),
        timestamp: new Date(response.result.date * 1e3),
        metadata: {
          chatId: response.result.chat.id
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Send failed"
      };
    }
  }
  verifyWebhook(headers, body, secret) {
    const receivedSecret = headers["x-telegram-bot-api-secret-token"];
    if (!secret) {
      return { valid: true };
    }
    if (receivedSecret !== secret) {
      return {
        valid: false,
        error: "Invalid webhook secret"
      };
    }
    return { valid: true };
  }
  parseWebhook(headers, body) {
    const update = body;
    const telegramMessage = update.message || update.edited_message || update.channel_post || update.edited_channel_post;
    if (!telegramMessage) {
      return { type: "unknown", raw: body };
    }
    const isEdited = !!update.edited_message || !!update.edited_channel_post;
    const chatTypeMap = {
      private: "private",
      group: "group",
      supergroup: "group",
      channel: "channel"
    };
    let contentType = "text";
    if (telegramMessage.photo) contentType = "image";
    else if (telegramMessage.document) contentType = "document";
    else if (telegramMessage.audio) contentType = "audio";
    else if (telegramMessage.video) contentType = "video";
    else if (telegramMessage.voice) contentType = "audio";
    else if (telegramMessage.sticker) contentType = "sticker";
    const message = {
      id: String(telegramMessage.message_id),
      channelType: "telegram",
      connectionId: "",
      // Will be filled by the route handler
      contentType,
      text: telegramMessage.text || telegramMessage.caption,
      sender: {
        id: String(telegramMessage.from?.id || telegramMessage.chat.id),
        name: telegramMessage.from ? `${telegramMessage.from.first_name}${telegramMessage.from.last_name ? ` ${telegramMessage.from.last_name}` : ""}` : telegramMessage.chat.title,
        username: telegramMessage.from?.username || telegramMessage.chat.username,
        isBot: telegramMessage.from?.is_bot
      },
      chat: {
        id: String(telegramMessage.chat.id),
        type: chatTypeMap[telegramMessage.chat.type] || "private",
        name: telegramMessage.chat.title || `${telegramMessage.chat.first_name || ""}${telegramMessage.chat.last_name ? ` ${telegramMessage.chat.last_name}` : ""}`.trim() || void 0
      },
      replyToMessageId: telegramMessage.reply_to_message ? String(telegramMessage.reply_to_message.message_id) : void 0,
      timestamp: new Date(telegramMessage.date * 1e3).toISOString(),
      editedAt: isEdited ? (/* @__PURE__ */ new Date()).toISOString() : void 0,
      raw: body
    };
    return {
      type: "message",
      message,
      raw: body
    };
  }
  formatMessage(text3, options) {
    let formatted = text3;
    if (options?.parseMode === "markdown") {
      formatted = text3.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
    }
    if (options?.truncate && formatted.length > this.formatting.maxLength) {
      formatted = formatted.slice(0, this.formatting.maxLength - 3) + "...";
    }
    return formatted;
  }
  getDefaultConfig() {
    return {
      channelType: "telegram",
      connectionMode: "webhook",
      capabilities: this.capabilities,
      formatting: this.formatting
    };
  }
};
var telegramProvider = new TelegramProvider();
init_schema();
init_schema();
init_db();
init_db();
var MESSAGING_SERVICE_URL = resolveServiceUrl(ServiceId.MESSAGING);
var chatToConversationMap = /* @__PURE__ */ new Map();
var CHANNEL_ASSISTANT = process.env.CHANNEL_ASSISTANT_KEY || "coordinator";
async function handleInboundMessage(payload, runId) {
  console.log(`[bridge] Inbound message received:`, {
    channelType: payload.channelType,
    connectionId: payload.connectionId,
    chatId: payload.chat.id,
    senderName: payload.sender.name,
    textPreview: payload.text?.slice(0, 50),
    runId
  });
  try {
    const [connection] = await db.select().from(channelConnections).where(eq(channelConnections.id, payload.connectionId)).limit(1);
    if (!connection) {
      console.error(`[bridge] Connection not found: ${payload.connectionId}`);
      return;
    }
    const orgId = connection.orgId || void 0;
    const conversationId = await findOrCreateConversation(
      payload,
      orgId,
      connection.userId
    );
    if (!conversationId) {
      console.error(`[bridge] Failed to find/create conversation for chat: ${payload.chat.id}`);
      return;
    }
    await postMessageToConversation(
      conversationId,
      payload,
      connection.userId,
      orgId,
      runId
    );
    await db.update(channelConnections).set({
      messagesReceived: (connection.messagesReceived || 0) + 1,
      lastMessageAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(channelConnections.id, payload.connectionId));
    console.log(`[bridge] Message routed to conversation: ${conversationId}`);
  } catch (error) {
    console.error(`[bridge] Error handling inbound message:`, error);
  }
}
async function findOrCreateConversation(message, orgId, ownerId) {
  const chatKey = `${message.channelType}:${message.chat.id}`;
  const cached = chatToConversationMap.get(chatKey);
  if (cached) {
    console.log(`[bridge] Found cached conversation: ${cached}`);
    return cached;
  }
  try {
    const searchResponse = await fetch(
      `${MESSAGING_SERVICE_URL}/api/internal/conversations/by-channel?` + // connectionId is deliberately NOT a filter. Including it made this
      // fallback as reconnect-fragile as the cache it was meant to back up:
      // after a reconnect, neither could find the conversation that was
      // sitting there, so a new one was created every time.
      new URLSearchParams({
        channelType: message.channelType,
        chatId: message.chat.id
      }),
      {
        headers: {
          "X-Service-Id": "integrations",
          // The admission every service now shares (@symbia/auth). X-Service-Id
          // alone opened exactly one internal route on messaging and nothing
          // else, so every conversation this bridge tried to create answered
          // 401 — measured 23 Aug, with a real Twitch message already in hand.
          "X-Service-Auth": process.env.SYMBIA_INTERNAL_SERVICE_TOKEN || "internal",
          "Content-Type": "application/json"
        }
      }
    );
    if (searchResponse.ok) {
      const data = await searchResponse.json();
      if (data.conversationId) {
        chatToConversationMap.set(chatKey, data.conversationId);
        console.log(`[bridge] Found existing conversation via API: ${data.conversationId}`);
        return data.conversationId;
      }
    }
  } catch (error) {
    console.log(`[bridge] Channel lookup not available, will create new conversation`);
  }
  const conversationName = message.chat.name || `${message.channelType} - ${message.sender.name || message.sender.username || "Unknown"}`;
  const conversationResponse = await fetch(
    `${MESSAGING_SERVICE_URL}/api/conversations`,
    {
      method: "POST",
      headers: {
        "X-Service-Id": "integrations",
        // The admission every service now shares (@symbia/auth). X-Service-Id
        // alone opened exactly one internal route on messaging and nothing
        // else, so every conversation this bridge tried to create answered
        // 401 — measured 23 Aug, with a real Twitch message already in hand.
        "X-Service-Auth": process.env.SYMBIA_INTERNAL_SERVICE_TOKEN || "internal",
        "X-As-User-Id": ownerId,
        "Content-Type": "application/json",
        ...orgId && { "X-Org-Id": orgId }
      },
      body: JSON.stringify({
        type: message.chat.type === "private" ? "private" : "group",
        name: conversationName,
        // AN ASSISTANT PARTICIPANT, OR NOTHING CAN EVER ANSWER.
        //
        // Measured 23 Aug: a Twitch message reached the conversation and was
        // never replied to. messaging's notifyAssistants calls
        // getAssistantParticipants and returns immediately when the list is
        // empty, and this bridge created every channel conversation with no
        // participants but its own service principal. So no assistant was
        // notified, no assistant responded, and the outbound event — which
        // messaging only emits on the assistant-response path — never fired.
        // The inbound half worked perfectly the whole time, which is what made
        // it look like a reply problem rather than a membership one.
        //
        // The key is a uuid-free convention messaging enforces: user_type
        // 'agent' and a user_id prefixed `assistant:`.
        participants: [{
          userId: `assistant:${CHANNEL_ASSISTANT}`,
          userType: "agent"
        }],
        metadata: {
          channel: {
            type: message.channelType,
            connectionId: message.connectionId,
            chatId: message.chat.id,
            chatType: message.chat.type,
            chatName: message.chat.name
          },
          channelSender: {
            id: message.sender.id,
            name: message.sender.name,
            username: message.sender.username
          }
        }
      })
    }
  );
  if (!conversationResponse.ok) {
    const errorText = await conversationResponse.text();
    console.error(`[bridge] Failed to create conversation:`, errorText);
    return null;
  }
  const conversation = await conversationResponse.json();
  chatToConversationMap.set(chatKey, conversation.id);
  console.log(`[bridge] Created new conversation: ${conversation.id}`);
  return conversation.id;
}
async function postMessageToConversation(conversationId, message, userId, orgId, runId) {
  const content = message.text || "[Attachment]";
  const response = await fetch(
    `${MESSAGING_SERVICE_URL}/api/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: {
        "X-Service-Id": "integrations",
        // The admission every service now shares (@symbia/auth). X-Service-Id
        // alone opened exactly one internal route on messaging and nothing
        // else, so every conversation this bridge tried to create answered
        // 401 — measured 23 Aug, with a real Twitch message already in hand.
        "X-Service-Auth": process.env.SYMBIA_INTERNAL_SERVICE_TOKEN || "internal",
        "X-As-User-Id": userId,
        "Content-Type": "application/json",
        ...orgId && { "X-Org-Id": orgId }
      },
      body: JSON.stringify({
        content,
        contentType: message.contentType || "text",
        senderType: "user",
        metadata: {
          _channelMessage: {
            id: message.id,
            channelType: message.channelType,
            connectionId: message.connectionId,
            sender: message.sender,
            timestamp: message.timestamp,
            replyToMessageId: message.replyToMessageId
          },
          channelSender: {
            id: message.sender.id,
            name: message.sender.name,
            username: message.sender.username
          },
          ...message.attachments?.length && { attachments: message.attachments }
        }
      })
    }
  );
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to post message: ${errorText}`);
  }
  console.log(`[bridge] Posted message to conversation ${conversationId}`);
}
init_schema();
init_db();
var deafSince = /* @__PURE__ */ new Map();
var gaps = [];
var MAX_GAPS = 50;
function markUnobserved(channelType, reason) {
  if (deafSince.has(channelType)) return;
  deafSince.set(channelType, { at: /* @__PURE__ */ new Date(), reason });
  console.warn(`[gap] ${channelType} is no longer observed (${reason}) \u2014 messages sent from now until reconnect cannot be recovered`);
}
function markObserved(channelType) {
  const start = deafSince.get(channelType);
  if (!start) return null;
  deafSince.delete(channelType);
  const to = /* @__PURE__ */ new Date();
  const seconds = Math.round((to.getTime() - start.at.getTime()) / 1e3);
  const gap = {
    channelType,
    from: start.at.toISOString(),
    to: to.toISOString(),
    seconds,
    reason: start.reason
  };
  gaps.push(gap);
  if (gaps.length > MAX_GAPS) gaps.shift();
  console.warn(
    `[gap] ${channelType} observed again after ${seconds}s \u2014 any message sent between ${gap.from} and ${gap.to} was not received and cannot be replayed`
  );
  return gap;
}
function listGaps() {
  const [channelType, start] = [...deafSince.entries()][0] ?? [];
  return {
    closed: [...gaps],
    open: start ? {
      channelType,
      since: start.at.toISOString(),
      seconds: Math.round((Date.now() - start.at.getTime()) / 1e3),
      reason: start.reason
    } : null
  };
}
async function fileGapOnConnection(connectionId, gap) {
  try {
    const [row] = await db.select().from(channelConnections).where(eq(channelConnections.id, connectionId)).limit(1);
    if (!row) return;
    const session = row.sessionData ?? {};
    const prior = Array.isArray(session.observationGaps) ? session.observationGaps : [];
    await db.update(channelConnections).set({
      sessionData: { ...session, observationGaps: [...prior, gap].slice(-20) },
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(channelConnections.id, connectionId));
  } catch (error) {
    console.error("[gap] could not file gap on connection:", error);
  }
}
var HELIX = "https://api.twitch.tv/helix";
var EVENTSUB_WS = "wss://eventsub.wss.twitch.tv/ws";
var MAX_MESSAGE = 500;
var TwitchProvider = class {
  type = "twitch";
  name = "Twitch Chat";
  connectionMode = "websocket";
  /**
   * Chat reads a *user* token; the registered twitch integration's credential
   * is the app's clientId:clientSecret. Same platform, two credentials, so they
   * cannot share the key "twitch" without one overwriting the other.
   */
  credentialKey = "twitch:chat";
  capabilities = {
    // Twitch chat has whispers, but they are a different endpoint with a
    // different scope and this provider does not implement them, so the
    // capability is false because it is unbuilt — not because Twitch lacks it.
    directMessages: false,
    groupChats: true,
    threads: false,
    reactions: false,
    fileAttachments: false,
    voiceMessages: false,
    edits: false,
    deletions: true,
    typing: false,
    readReceipts: false
  };
  formatting = {
    supportsMarkdown: false,
    supportsHtml: false,
    supportsMentions: true,
    supportsEmoji: true,
    maxLength: MAX_MESSAGE
  };
  /** connectionId -> live socket. Process-local; see F29. */
  live = /* @__PURE__ */ new Map();
  /**
   * Called when a connect replaces an existing socket for the same channel.
   * Set by the channel layer, which owns the connection records; the provider
   * deliberately holds no database handle of its own.
   */
  onSuperseded;
  /**
   * Message ids this provider sent, so it does not answer itself.
   *
   * THE FIRST VERSION FILTERED ON THE SENDER'S ACCOUNT — skip anything whose
   * chatter_user_id is the bot's. That is wrong whenever the bot and the
   * broadcaster are the same account, which is the ordinary case for someone
   * running chat on their own stream: it discards every message the streamer
   * types. Measured as a design error before it shipped, by trying to work out
   * how the owner of the channel would test it.
   *
   * Filtering on what we sent is the accurate statement of the intent. Bounded
   * because a long stream would otherwise grow it without limit.
   */
  sentIds = /* @__PURE__ */ new Set();
  remember(id) {
    if (!id) return;
    this.sentIds.add(id);
    if (this.sentIds.size > 500) {
      this.sentIds.delete(this.sentIds.values().next().value);
    }
  }
  // MARK: - Helix
  /**
   * `credential` is "<clientId>:<userToken>", split on the FIRST colon only.
   * Twitch tokens are alphanumeric, but the OAuth executor learned this the
   * hard way with a secret that contained one, and the same rule is applied
   * here rather than rediscovered.
   */
  parse(credential) {
    const i = credential.indexOf(":");
    if (i < 0) {
      throw new Error(
        "twitch credential must be '<clientId>:<userToken>' \u2014 no colon found"
      );
    }
    return { clientId: credential.slice(0, i), token: credential.slice(i + 1) };
  }
  async helix(credential, path, init = {}) {
    const { clientId, token } = this.parse(credential);
    const res = await fetch(`${HELIX}${path}`, {
      ...init,
      headers: {
        "Client-Id": clientId,
        Authorization: `Bearer ${token}`,
        ...init.body ? { "Content-Type": "application/json" } : {},
        ...init.headers
      }
    });
    const body = res.status === 204 ? void 0 : await res.json().catch(() => void 0);
    if (!res.ok) {
      const msg = body?.message;
      return { ok: false, status: res.status, error: msg || `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, data: body };
  }
  async resolveUser(credential, login) {
    const q = login ? `?login=${encodeURIComponent(login)}` : "";
    const r = await this.helix(
      credential,
      `/users${q}`
    );
    if (!r.ok) throw new Error(r.error);
    const u = r.data?.data?.[0];
    if (!u) throw new Error(login ? `no such twitch user: ${login}` : "token resolves to no user");
    return u;
  }
  // MARK: - Connection
  async initConnection(ctx, credential, config2) {
    const channel = config2?.channel?.replace(/^#/, "");
    try {
      const bot = await this.resolveUser(credential);
      const broadcaster = channel ? await this.resolveUser(credential, channel) : bot;
      for (const [id, live] of this.live) {
        if (live.broadcasterId !== broadcaster.id || id === ctx.connectionId) continue;
        console.log(`[twitch] replacing existing connection ${id} for #${live.login}`);
        live.closing = true;
        try {
          live.ws.close();
        } catch {
        }
        this.live.delete(id);
        this.onSuperseded?.(id, ctx.connectionId);
      }
      await this.open(ctx.connectionId, credential, broadcaster.id, bot.id, broadcaster.login);
      return {
        success: true,
        status: "connected",
        metadata: {
          broadcasterId: broadcaster.id,
          broadcasterLogin: broadcaster.login,
          botUserId: bot.id,
          transport: "eventsub-websocket"
        }
      };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return { success: false, status: "error", error };
    }
  }
  /**
   * Open the socket and subscribe once Twitch sends the welcome.
   *
   * ORDER MATTERS AND IS NOT OPTIONAL. The subscription request carries the
   * session id, and the session id only exists after `session_welcome` arrives.
   * Subscribing before then fails, and Twitch closes any socket that has no
   * subscription within ten seconds — so a failed subscribe looks like an
   * unexplained disconnect rather than an error.
   */
  open(connectionId, credential, broadcasterId, botUserId, login, url = EVENTSUB_WS) {
    return new Promise((resolve, reject) => {
      const ws = new wrapper_default(url);
      const entry = {
        ws,
        broadcasterId,
        botUserId,
        login,
        connectedAt: /* @__PURE__ */ new Date(),
        closing: false
      };
      this.live.set(connectionId, entry);
      let settled = false;
      const fail = (msg) => {
        entry.error = msg;
        if (!settled) {
          settled = true;
          reject(new Error(msg));
        }
      };
      ws.addEventListener("message", async (evt) => {
        let msg;
        try {
          msg = JSON.parse(typeof evt.data === "string" ? evt.data : String(evt.data));
        } catch {
          return;
        }
        const type = msg.metadata?.message_type;
        if (type === "session_welcome") {
          entry.sessionId = msg.payload?.session?.id;
          const sub = await this.subscribe(credential, entry.sessionId, broadcasterId, botUserId);
          if (!sub.ok) return fail(sub.error || "subscribe failed");
          if (!settled) {
            settled = true;
            resolve();
          }
          const gap = markObserved("twitch");
          if (gap) void fileGapOnConnection(connectionId, gap);
          void this.pruneStaleSubscriptions(credential);
          return;
        }
        if (type === "session_reconnect") {
          const next = msg.payload?.session?.reconnect_url;
          if (next) {
            this.open(connectionId, credential, broadcasterId, botUserId, login, next).then(() => {
              entry.closing = true;
              ws.close();
            }).catch((e) => console.error("[twitch] reconnect failed:", e));
          }
          return;
        }
        if (type === "notification") {
          entry.lastEventAt = /* @__PURE__ */ new Date();
          const ev = msg.payload?.event;
          if (!ev) return;
          if (this.sentIds.has(ev.message_id)) return;
          const inbound = this.toInbound(connectionId, ev);
          try {
            await handleInboundMessage(inbound, `twitch:${msg.metadata?.message_id ?? ""}`);
          } catch (e) {
            console.error("[twitch] inbound handling failed:", e);
          }
        }
      });
      ws.addEventListener("error", () => fail("websocket error"));
      ws.addEventListener("close", (evt) => {
        markUnobserved("twitch", entry.closing ? "socket closed deliberately (handover or supersede)" : `socket closed (${evt.code}${evt.reason ? `: ${evt.reason}` : ""})`);
        if (entry.closing) return;
        entry.error = `socket closed (${evt.code}${evt.reason ? `: ${evt.reason}` : ""})`;
        fail(entry.error);
      });
      setTimeout(() => fail("no session_welcome within 15s"), 15e3).unref?.();
    });
  }
  async subscribe(credential, sessionId, broadcasterId, userId) {
    return this.helix(credential, "/eventsub/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        type: "channel.chat.message",
        version: "1",
        condition: { broadcaster_user_id: broadcasterId, user_id: userId },
        transport: { method: "websocket", session_id: sessionId }
      })
    });
  }
  /**
   * Delete subscriptions Twitch is still holding for sockets that are gone.
   *
   * EVERY RESTART LEAKS ONE. A subscription is bound to a websocket session, so
   * when the socket dies the subscription survives as `websocket_disconnected`
   * and a fresh connect adds another. Measured 24 Aug after four rebuilds in
   * half an hour: Twitch held six subscriptions for this channel, five of them
   * dead. Twitch caps subscriptions per client, so this drifts toward a ceiling
   * where a reconnect starts failing for a reason that has nothing to do with
   * the reconnect.
   *
   * It also made the channel undiagnosable: asking Twitch what it was watching
   * returned six answers, five of which were history.
   *
   * Best-effort by design. Failing a connect because cleanup failed would trade
   * a tidy account for a live channel, which is the wrong way round.
   */
  async pruneStaleSubscriptions(credential) {
    try {
      const list = await this.helix(
        credential,
        "/eventsub/subscriptions",
        { method: "GET" }
      );
      if (!list.ok) return;
      const subs = list.data?.data ?? [];
      const dead = subs.filter((s) => s.status !== "enabled");
      if (dead.length === 0) return;
      let removed = 0;
      for (const s of dead) {
        const del = await this.helix(
          credential,
          `/eventsub/subscriptions?id=${encodeURIComponent(s.id)}`,
          { method: "DELETE" }
        );
        if (del.ok) removed += 1;
      }
      console.log(
        `[twitch] pruned ${removed} of ${dead.length} stale subscription(s); ${subs.length - dead.length} enabled remain`
      );
    } catch (e) {
      console.warn(
        "[twitch] subscription prune failed (continuing):",
        e instanceof Error ? e.message : e
      );
    }
  }
  toInbound(connectionId, ev) {
    return {
      id: ev.message_id,
      channelType: "twitch",
      connectionId,
      contentType: "text",
      text: ev.message?.text ?? "",
      sender: {
        id: ev.chatter_user_id,
        name: ev.chatter_user_name || ev.chatter_user_login,
        username: ev.chatter_user_login
      },
      chat: {
        id: ev.broadcaster_user_id,
        type: "group",
        name: `#${ev.broadcaster_user_login}`
      },
      replyToMessageId: ev.reply?.parent_message_id,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      raw: ev
    };
  }
  async getStatus(ctx) {
    const entry = this.live.get(ctx.connectionId);
    if (!entry) {
      return { status: "disconnected", error: "no socket in this process \u2014 see F29" };
    }
    const open = entry.ws.readyState === wrapper_default.OPEN;
    return {
      status: open ? "connected" : "error",
      channelAccountId: entry.broadcasterId,
      channelAccountName: `#${entry.login}`,
      lastPingAt: entry.lastEventAt,
      error: open ? void 0 : entry.error || `readyState ${entry.ws.readyState}`,
      metadata: {
        sessionId: entry.sessionId,
        connectedAt: entry.connectedAt.toISOString(),
        // Distinguished deliberately: a chat nobody has typed in looks
        // identical to a subscription that never delivered.
        lastEventAt: entry.lastEventAt?.toISOString() ?? "no chat message has arrived since connecting; this does not assert the subscription works"
      }
    };
  }
  async disconnect(ctx) {
    const entry = this.live.get(ctx.connectionId);
    if (!entry) return { success: true };
    entry.closing = true;
    try {
      entry.ws.close();
    } catch {
    }
    this.live.delete(ctx.connectionId);
    return { success: true };
  }
  // MARK: - Outbound
  async sendMessage(ctx, message, credential) {
    const entry = this.live.get(ctx.connectionId);
    const broadcasterId = entry?.broadcasterId ?? message.chatId;
    const senderId = entry?.botUserId;
    if (!senderId) {
      return { success: false, error: "not connected \u2014 sender_id is only known from a live connection" };
    }
    const parts = this.splitForChannel(message.text ?? "");
    if (parts.length === 0) return { success: false, error: "nothing to send" };
    if (parts.length > 1) {
      console.log(`[twitch] answer is ${(message.text ?? "").length} chars \u2014 sending as ${parts.length} messages`);
    }
    let firstId;
    for (const [i, part] of parts.entries()) {
      const r = await this.helix(credential, "/chat/messages", {
        method: "POST",
        body: JSON.stringify({
          broadcaster_id: broadcasterId,
          sender_id: senderId,
          message: part,
          // Only the first part answers the parent. Threading every part to it
          // renders as several separate replies to the same message.
          ...i === 0 && message.replyToMessageId ? { reply_parent_message_id: message.replyToMessageId } : {}
        })
      });
      if (!r.ok) {
        return {
          success: false,
          messageId: firstId,
          error: parts.length > 1 ? `sent ${i} of ${parts.length} parts, then failed: ${r.error}` : r.error
        };
      }
      const out = r.data?.data?.[0];
      if (out && out.is_sent === false) {
        const why = out.drop_reason ? `twitch dropped it (${out.drop_reason.code}): ${out.drop_reason.message}` : "twitch accepted the call and did not send the message, with no reason given";
        return {
          success: false,
          messageId: firstId ?? out.message_id,
          error: parts.length > 1 ? `part ${i + 1} of ${parts.length}: ${why}` : why
        };
      }
      this.remember(out?.message_id);
      if (i === 0) firstId = out?.message_id;
    }
    return { success: true, messageId: firstId, timestamp: /* @__PURE__ */ new Date() };
  }
  // MARK: - Webhook surface (not this transport)
  verifyWebhook() {
    return { valid: false, error: "twitch chat uses the EventSub WebSocket transport; there is no webhook to verify" };
  }
  parseWebhook(_h, body) {
    return { type: "unknown", raw: body };
  }
  formatMessage(text3, options) {
    const flat = text3.replace(/\s*\n+\s*/g, " ").trim();
    if (flat.length <= MAX_MESSAGE) return flat;
    return options?.truncate ? flat.slice(0, MAX_MESSAGE - 1) + "\u2026" : flat;
  }
  /**
   * Split a long answer into messages Twitch will accept, instead of cutting it.
   *
   * WHY. Brian, 24 Aug: "still times out on long responses (just cuts off)".
   * It was not a timeout. Twitch rejects anything over 500 characters outright
   * — measured against the Helix API: 484 chars is_sent true, 504 chars HTTP
   * 422 "The message is too large. Max message length is 500." — and this
   * provider was calling formatMessage with truncate:true, so a 2031-character
   * answer became 499 characters and an ellipsis. The send then reported
   * success, because sending a truncated message does succeed.
   *
   * Splitting rather than truncating because the tail of an answer is where the
   * caveats live. Today's grounded coordinator ends its replies with what the
   * data does not cover, which is precisely the part a 500-character cut
   * removes — leaving the confident half and discarding the honest half.
   *
   * Boundaries are tried in order: sentence, then clause, then word. Never
   * mid-word. Parts are numbered when there is more than one, and the numbering
   * is measured into the budget rather than added on top of it.
   *
   * Beyond `maxParts` it stops and says how much was dropped. A flood of twenty
   * messages is its own kind of unreadable, and Twitch rate-limits at about
   * twenty messages per thirty seconds.
   */
  splitForChannel(text3, maxParts = 5) {
    const flat = text3.replace(/\s*\n+\s*/g, " ").trim();
    if (flat.length <= MAX_MESSAGE) return flat ? [flat] : [];
    const budget = MAX_MESSAGE - 8;
    const parts = [];
    let rest = flat;
    while (rest.length > 0 && parts.length < maxParts) {
      if (rest.length <= budget) {
        parts.push(rest);
        rest = "";
        break;
      }
      const window = rest.slice(0, budget);
      let cut = Math.max(
        window.lastIndexOf(". "),
        window.lastIndexOf("! "),
        window.lastIndexOf("? ")
      );
      if (cut > budget * 0.5) cut += 1;
      else {
        const clause = Math.max(window.lastIndexOf("; "), window.lastIndexOf(", "));
        cut = clause > budget * 0.5 ? clause + 1 : window.lastIndexOf(" ");
      }
      if (cut <= 0) cut = budget;
      parts.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest.length > 0) {
      const note = `\u2026[${rest.length} more characters not sent]`;
      const last = parts.pop() ?? "";
      parts.push(`${last.slice(0, budget - note.length).trim()} ${note}`);
    }
    return parts.length > 1 ? parts.map((p, i) => `${p} (${i + 1}/${parts.length})`) : parts;
  }
  getDefaultConfig() {
    return {
      // Chat is one room, not a set of private conversations, so every message
      // shares a conversation rather than opening one per chatter.
      allowGroupChats: true
    };
  }
};
var twitchProvider = new TwitchProvider();
var VALUE_PATTERNS = outbound_exports.VALUE_PATTERNS;
var REDACTED = outbound_exports.REDACTED;
var scan = outbound_exports.scan;
var redactOutbound = outbound_exports.redactOutbound;
init_schema();
init_db();
async function markSuperseded(supersededId, byConnectionId) {
  try {
    await db.update(channelConnections).set({
      status: "disconnected",
      disconnectedAt: /* @__PURE__ */ new Date(),
      // Says which connection took over, so a row that stopped is
      // distinguishable from one that failed.
      lastError: `superseded by ${byConnectionId}`,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(channelConnections.id, supersededId));
    console.log(`[channels] ${supersededId} marked superseded by ${byConnectionId}`);
  } catch (error) {
    console.error(`[channels] could not mark ${supersededId} superseded:`, error);
  }
}
function gated(provider) {
  const original = provider.sendMessage.bind(provider);
  provider.sendMessage = async function(ctx, message, credential) {
    const result = redactOutbound(message.text ?? "");
    if (!result.clean) {
      console.warn(
        `[redact] ${provider.type} outbound: masked ${result.fired.join(", ")} on connection ${ctx.connectionId}`
      );
    }
    return original(ctx, { ...message, text: result.text }, credential);
  };
  return provider;
}
function initializeChannelProviders() {
  channelProviders.register(gated(telegramProvider));
  twitchProvider.onSuperseded = (supersededId, byConnectionId) => {
    void markSuperseded(supersededId, byConnectionId);
  };
  channelProviders.register(gated(twitchProvider));
  console.log(`[channels] Initialized ${channelProviders.getAll().length} channel provider(s)`);
}
var store = /* @__PURE__ */ new Map();
var STALE_AFTER_MS = 15e3;
function recordHeartbeat(channelType, body) {
  const prev = store.get(channelType);
  const beat = { ...body, at: (/* @__PURE__ */ new Date()).toISOString() };
  store.set(channelType, {
    beat,
    receivedAtMs: Date.now(),
    seq: (prev?.seq ?? 0) + 1
  });
  return beat;
}
function readHealth(channelType) {
  const s = store.get(channelType);
  if (!s) {
    return {
      channelType,
      state: "never-reported",
      because: "no renderer has ever sent a heartbeat to this process",
      ageSeconds: null,
      heartbeats: 0,
      last: null,
      doesNotAssert: "that nothing is broadcasting. A renderer that never learned to report looks identical from here to one that is not running."
    };
  }
  const ageMs = Date.now() - s.receivedAtMs;
  const ageSeconds = Math.round(ageMs / 100) / 10;
  if (ageMs > STALE_AFTER_MS) {
    return {
      channelType,
      state: "unobserved",
      because: `the last heartbeat arrived ${ageSeconds}s ago, past the ${STALE_AFTER_MS / 1e3}s staleness bound`,
      ageSeconds,
      heartbeats: s.seq,
      last: s.beat,
      doesNotAssert: "that the broadcast is down. The renderer may be pushing frames and have lost only its route to this service. Silence is silence."
    };
  }
  const { fps, fpsDeclared, encoderRestarts } = s.beat;
  const reasons = [];
  if (typeof fps === "number" && typeof fpsDeclared === "number" && fpsDeclared > 0) {
    if (fps < fpsDeclared * 0.9) {
      reasons.push(
        `reported ${fps}fps against a declared ${fpsDeclared} \u2014 the encoder advances timestamps at the declared rate, so the stream clock falls behind wall clock while this holds`
      );
    }
  }
  if (typeof encoderRestarts === "number" && encoderRestarts > 0) {
    reasons.push(
      `${encoderRestarts} encoder restart(s) this run \u2014 each one is a new RTMP session, which a viewer sees as the stream dropping`
    );
  }
  if (reasons.length) {
    return {
      channelType,
      state: "degraded",
      because: reasons.join("; "),
      ageSeconds,
      heartbeats: s.seq,
      last: s.beat,
      doesNotAssert: "anything about picture quality, audio, or what a viewer can actually see. These are the renderer's own numbers about its own pipeline."
    };
  }
  return {
    channelType,
    state: "live",
    because: `heartbeat ${ageSeconds}s old, reporting ${fps ?? "?"}fps against a declared ${fpsDeclared ?? "?"} with no encoder restarts`,
    ageSeconds,
    heartbeats: s.seq,
    last: s.beat,
    doesNotAssert: "that Twitch is ingesting. This is the renderer reporting on itself; whether the platform on the other end accepted the stream is a question for that platform, and getStreams answers it."
  };
}
function readAll() {
  return [...store.keys()].map(readHealth);
}
var MESSAGING_SERVICE_URL2 = resolveServiceUrl(ServiceId.MESSAGING);
function getParam2(params, key) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value ?? "";
}
async function updateConnectionStatus(connectionId, newStatus, updates = {}) {
  const [current] = await db.select().from(channelConnections).where(eq(channelConnections.id, connectionId)).limit(1);
  if (!current) {
    console.error(`[channels] Connection not found: ${connectionId}`);
    return;
  }
  const previousStatus = current.status;
  await db.update(channelConnections).set({
    status: newStatus,
    updatedAt: /* @__PURE__ */ new Date(),
    ...updates
  }).where(eq(channelConnections.id, connectionId));
  if (previousStatus !== newStatus) {
    const statusEvent = {
      connectionId,
      channelType: current.channelType,
      previousStatus,
      newStatus,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    await emitEvent("channel.status.changed", statusEvent, `run_${randomUUID2().slice(0, 8)}`);
    console.log(`[channels] Status changed: ${connectionId} ${previousStatus} -> ${newStatus}`);
  }
}
function createChannelRoutes() {
  const router = (0, import_express2.Router)();
  initializeChannelProviders();
  router.get("/", async (_req, res) => {
    const providers = channelProviders.getAll();
    res.json({
      channels: providers.map((p) => ({
        type: p.type,
        name: p.name,
        connectionMode: p.connectionMode,
        capabilities: p.capabilities,
        formatting: p.formatting
      }))
    });
  });
  router.get("/observation-gaps", authMiddleware, (_req, res) => {
    const { closed, open } = listGaps();
    res.json({
      open,
      closed,
      totalSecondsUnobserved: closed.reduce((n, g) => n + g.seconds, 0),
      // Stated rather than implied: this counts only what this process saw.
      scope: "since this service process started \u2014 gaps from earlier processes are filed on the connection rows that resumed observation",
      replay: "none \u2014 Twitch EventSub does not redeliver, so anything sent inside a gap is unrecoverable"
    });
  });
  router.get("/broadcast/health", authMiddleware, (_req, res) => {
    res.json({ broadcasts: readAll(), staleAfterSeconds: STALE_AFTER_MS / 1e3 });
  });
  router.post("/:channelType/broadcast/health", async (req, res) => {
    const channelType = getParam2(req.params, "channelType");
    const parsed = channelTypeSchema.safeParse(channelType);
    if (!parsed.success) {
      res.status(400).json({ error: `Invalid channel type: ${channelType}` });
      return;
    }
    const beat = recordHeartbeat(parsed.data, req.body ?? {});
    res.json({ recorded: beat, health: readHealth(parsed.data) });
  });
  router.get("/:channelType/broadcast/health", async (req, res) => {
    const channelType = getParam2(req.params, "channelType");
    const parsed = channelTypeSchema.safeParse(channelType);
    if (!parsed.success) {
      res.status(400).json({ error: `Invalid channel type: ${channelType}` });
      return;
    }
    res.json(readHealth(parsed.data));
  });
  router.get("/:channelType", async (req, res) => {
    const channelType = getParam2(req.params, "channelType");
    const parseResult = channelTypeSchema.safeParse(channelType);
    if (!parseResult.success) {
      res.status(400).json({ error: `Invalid channel type: ${channelType}` });
      return;
    }
    const provider = channelProviders.get(parseResult.data);
    if (!provider) {
      res.status(404).json({ error: `Channel provider not available: ${channelType}` });
      return;
    }
    res.json({
      type: provider.type,
      name: provider.name,
      connectionMode: provider.connectionMode,
      capabilities: provider.capabilities,
      formatting: provider.formatting,
      defaultConfig: provider.getDefaultConfig()
    });
  });
  router.get("/:channelType/connections", authMiddleware, async (req, res) => {
    const channelType = getParam2(req.params, "channelType");
    const user = req.user;
    const parseResult = channelTypeSchema.safeParse(channelType);
    if (!parseResult.success) {
      res.status(400).json({ error: `Invalid channel type: ${channelType}` });
      return;
    }
    try {
      const connections = await db.select({
        id: channelConnections.id,
        channelType: channelConnections.channelType,
        channelAccountId: channelConnections.channelAccountId,
        channelAccountName: channelConnections.channelAccountName,
        status: channelConnections.status,
        lastMessageAt: channelConnections.lastMessageAt,
        messagesReceived: channelConnections.messagesReceived,
        messagesSent: channelConnections.messagesSent,
        createdAt: channelConnections.createdAt,
        connectedAt: channelConnections.connectedAt
      }).from(channelConnections).where(
        and(
          eq(channelConnections.channelType, parseResult.data),
          eq(channelConnections.orgId, user.orgId)
        )
      );
      res.json({ connections });
    } catch (error) {
      console.error("[channels] Error listing connections:", error);
      res.status(500).json({ error: "Failed to list connections" });
    }
  });
  router.post("/:channelType/connect", authMiddleware, async (req, res) => {
    const channelType = getParam2(req.params, "channelType");
    const user = req.user;
    const token = req.token;
    const config2 = req.body.config || {};
    const parseResult = channelTypeSchema.safeParse(channelType);
    if (!parseResult.success) {
      res.status(400).json({ error: `Invalid channel type: ${channelType}` });
      return;
    }
    const provider = channelProviders.get(parseResult.data);
    if (!provider) {
      res.status(404).json({ error: `Channel provider not available: ${channelType}` });
      return;
    }
    try {
      const credKey = provider.credentialKey ?? channelType;
      const credential = await getCredential(user.id, user.orgId, credKey, token);
      if (!credential?.apiKey) {
        res.status(400).json({
          error: `No ${credKey} credentials configured. Add your credentials in Settings.`
        });
        return;
      }
      const connectionId = randomUUID2();
      const integrationId = `channel-${channelType}-${user.orgId}`;
      await db.insert(channelConnections).values({
        id: connectionId,
        integrationId,
        userId: user.id,
        orgId: user.orgId,
        channelType: parseResult.data,
        credentialId: credential.credentialId,
        status: "pending"
      });
      const ctx = {
        connectionId,
        userId: user.id,
        orgId: user.orgId,
        credentialId: credential.credentialId,
        authToken: token
      };
      const result = await provider.initConnection(ctx, credential.apiKey, config2);
      if (result.success) {
        await updateConnectionStatus(connectionId, result.status, {
          // WHICH ACCOUNT THIS CONNECTION ACTUALLY WATCHES.
          //
          // These read botId/accountId only, which is Telegram's shape. Twitch
          // returns broadcasterId/broadcasterLogin, so every Twitch row stored
          // null for both. Measured 24 Aug: a connection subscribed to the
          // wrong channel reported `connected` with a null account, and nothing
          // in the API could say which chat it was listening to. The bug took
          // an hour to find because the record could not contradict it.
          channelAccountId: result.metadata?.botId?.toString() || result.metadata?.accountId?.toString() || result.metadata?.broadcasterId?.toString(),
          channelAccountName: result.metadata?.botUsername?.toString() || result.metadata?.accountName?.toString() || (result.metadata?.broadcasterLogin ? `#${result.metadata.broadcasterLogin}` : void 0),
          webhookUrl: result.webhookUrl,
          webhookSecret: result.webhookSecret,
          webhookVerified: !!result.webhookUrl,
          qrCode: result.qrCode,
          qrExpiresAt: result.qrExpiresAt,
          connectedAt: result.status === "connected" ? /* @__PURE__ */ new Date() : void 0,
          // NO CREDENTIAL IN HERE.
          //
          // This stored `botToken: credential.apiKey` — the live user token in
          // plaintext on the connection row, duplicating a secret the row
          // already references by credentialId. Anything that could read a
          // connection could read the token, and a record dump carried it.
          // The reconnect path resolves the credential by id like every other
          // caller; what it genuinely needs to restore is the config.
          sessionData: {
            config: config2,
            ...result.metadata
          },
          metadata: result.metadata
        });
        res.json({
          success: true,
          connectionId,
          status: result.status,
          qrCode: result.qrCode,
          qrExpiresAt: result.qrExpiresAt?.toISOString(),
          authUrl: result.authUrl,
          webhookUrl: result.webhookUrl,
          channelAccountId: result.metadata?.botId || result.metadata?.accountId,
          channelAccountName: result.metadata?.botUsername || result.metadata?.accountName
        });
      } else {
        await updateConnectionStatus(connectionId, "error", {
          lastError: result.error,
          errorCount: 1,
          consecutiveErrors: 1
        });
        res.status(400).json({
          success: false,
          connectionId,
          error: result.error
        });
      }
    } catch (error) {
      console.error("[channels] Connection error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Connection failed"
      });
    }
  });
  router.get(
    "/:channelType/connections/:connectionId/status",
    authMiddleware,
    async (req, res) => {
      const channelType = getParam2(req.params, "channelType");
      const connectionId = getParam2(req.params, "connectionId");
      const user = req.user;
      try {
        const [connection] = await db.select().from(channelConnections).where(
          and(
            eq(channelConnections.id, connectionId),
            eq(channelConnections.orgId, user.orgId)
          )
        ).limit(1);
        if (!connection) {
          res.status(404).json({ error: "Connection not found" });
          return;
        }
        const provider = channelProviders.get(connection.channelType);
        if (!provider) {
          res.status(500).json({ error: "Channel provider not available" });
          return;
        }
        const ctx = {
          connectionId,
          userId: user.id,
          orgId: user.orgId
        };
        const status = await provider.getStatus(
          ctx,
          connection.sessionData
        );
        await updateConnectionStatus(connectionId, status.status, {
          lastPingAt: status.lastPingAt,
          lastError: status.error,
          metadata: status.metadata
        });
        res.json({
          connectionId,
          channelType: connection.channelType,
          status: status.status,
          channelAccountId: status.channelAccountId || connection.channelAccountId,
          channelAccountName: status.channelAccountName || connection.channelAccountName,
          lastPingAt: status.lastPingAt?.toISOString(),
          lastMessageAt: connection.lastMessageAt?.toISOString(),
          messagesReceived: connection.messagesReceived,
          messagesSent: connection.messagesSent,
          error: status.error
        });
      } catch (error) {
        console.error("[channels] Status check error:", error);
        res.status(500).json({ error: "Failed to check status" });
      }
    }
  );
  router.post(
    "/:channelType/connections/:connectionId/disconnect",
    authMiddleware,
    async (req, res) => {
      const channelType = getParam2(req.params, "channelType");
      const connectionId = getParam2(req.params, "connectionId");
      const user = req.user;
      try {
        const [connection] = await db.select().from(channelConnections).where(
          and(
            eq(channelConnections.id, connectionId),
            eq(channelConnections.orgId, user.orgId)
          )
        ).limit(1);
        if (!connection) {
          res.status(404).json({ error: "Connection not found" });
          return;
        }
        const provider = channelProviders.get(connection.channelType);
        if (!provider) {
          res.status(500).json({ error: "Channel provider not available" });
          return;
        }
        const ctx = {
          connectionId,
          userId: user.id,
          orgId: user.orgId
        };
        const result = await provider.disconnect(
          ctx,
          connection.sessionData
        );
        await updateConnectionStatus(connectionId, "disconnected", {
          disconnectedAt: /* @__PURE__ */ new Date()
        });
        res.json({
          success: result.success,
          connectionId,
          status: "disconnected",
          error: result.error
        });
      } catch (error) {
        console.error("[channels] Disconnect error:", error);
        res.status(500).json({ error: "Failed to disconnect" });
      }
    }
  );
  router.delete(
    "/:channelType/connections/:connectionId",
    authMiddleware,
    async (req, res) => {
      const connectionId = getParam2(req.params, "connectionId");
      const user = req.user;
      try {
        const [connection] = await db.select().from(channelConnections).where(
          and(
            eq(channelConnections.id, connectionId),
            eq(channelConnections.orgId, user.orgId)
          )
        ).limit(1);
        if (!connection) {
          res.status(404).json({ error: "Connection not found" });
          return;
        }
        if (connection.status === "connected") {
          const provider = channelProviders.get(connection.channelType);
          if (provider) {
            await provider.disconnect(
              { connectionId, userId: user.id, orgId: user.orgId },
              connection.sessionData
            );
          }
        }
        await db.delete(channelConnections).where(eq(channelConnections.id, connectionId));
        res.json({ success: true, connectionId });
      } catch (error) {
        console.error("[channels] Delete error:", error);
        res.status(500).json({ error: "Failed to delete connection" });
      }
    }
  );
  router.post("/:channelType/webhook/:connectionId", async (req, res) => {
    const channelType = getParam2(req.params, "channelType");
    const connectionId = getParam2(req.params, "connectionId");
    const startTime = Date.now();
    const parseResult = channelTypeSchema.safeParse(channelType);
    if (!parseResult.success) {
      res.status(400).json({ error: `Invalid channel type: ${channelType}` });
      return;
    }
    const provider = channelProviders.get(parseResult.data);
    if (!provider) {
      res.status(404).json({ error: `Channel provider not available: ${channelType}` });
      return;
    }
    try {
      const [connection] = await db.select().from(channelConnections).where(eq(channelConnections.id, connectionId)).limit(1);
      if (!connection) {
        res.status(404).json({ error: "Connection not found" });
        return;
      }
      const headers = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === "string") {
          headers[key.toLowerCase()] = value;
        }
      }
      const verification = provider.verifyWebhook(
        headers,
        req.body,
        connection.webhookSecret || void 0
      );
      if (!verification.valid) {
        console.warn(`[channels] Webhook verification failed for ${connectionId}: ${verification.error}`);
        res.status(403).json({ error: verification.error || "Webhook verification failed" });
        return;
      }
      if (verification.challenge) {
        res.send(verification.challenge);
        return;
      }
      const parsed = provider.parseWebhook(headers, req.body);
      if (parsed.type === "message" && parsed.message) {
        parsed.message.connectionId = connectionId;
        await db.update(channelConnections).set({
          messagesReceived: (connection.messagesReceived || 0) + 1,
          lastMessageAt: /* @__PURE__ */ new Date(),
          updatedAt: /* @__PURE__ */ new Date(),
          consecutiveErrors: 0
          // Reset on successful message
        }).where(eq(channelConnections.id, connectionId));
        const runId = `run_msg_${randomUUID2().slice(0, 8)}`;
        console.log(
          `[channels] Inbound message from ${channelType}/${connectionId}: ${parsed.message.text?.slice(0, 50)}...`
        );
        handleInboundMessage(parsed.message, runId).catch((error) => {
          console.error(`[channels] Error handling inbound message:`, error);
        });
      } else if (parsed.type === "status" && parsed.statusUpdate) {
        if (parsed.statusUpdate.newStatus) {
          await updateConnectionStatus(connectionId, parsed.statusUpdate.newStatus, {});
        }
      }
      await emitEvent(
        "channel.webhook.received",
        {
          channelType: parseResult.data,
          connectionId,
          webhookPath: req.path,
          method: req.method,
          headers,
          body: req.body,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        },
        `run_wh_${randomUUID2().slice(0, 8)}`
      );
      res.json({ ok: true });
    } catch (error) {
      console.error("[channels] Webhook processing error:", error);
      const [currentConn] = await db.select({
        errorCount: channelConnections.errorCount,
        consecutiveErrors: channelConnections.consecutiveErrors
      }).from(channelConnections).where(eq(channelConnections.id, connectionId)).limit(1);
      await db.update(channelConnections).set({
        errorCount: (currentConn?.errorCount || 0) + 1,
        consecutiveErrors: (currentConn?.consecutiveErrors || 0) + 1,
        lastError: error instanceof Error ? error.message : "Unknown error",
        lastErrorAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(channelConnections.id, connectionId));
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });
  router.get("/:channelType/webhook/:connectionId", async (req, res) => {
    const channelType = getParam2(req.params, "channelType");
    const connectionId = getParam2(req.params, "connectionId");
    const parseResult = channelTypeSchema.safeParse(channelType);
    if (!parseResult.success) {
      res.status(400).json({ error: `Invalid channel type: ${channelType}` });
      return;
    }
    const provider = channelProviders.get(parseResult.data);
    if (!provider) {
      res.status(404).json({ error: `Channel provider not available: ${channelType}` });
      return;
    }
    const [connection] = await db.select().from(channelConnections).where(eq(channelConnections.id, connectionId)).limit(1);
    if (!connection) {
      res.status(404).json({ error: "Connection not found" });
      return;
    }
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") {
        headers[key.toLowerCase()] = value;
      }
    }
    const verification = provider.verifyWebhook(
      headers,
      req.query,
      connection.webhookSecret || void 0
    );
    if (verification.challenge) {
      res.send(verification.challenge);
      return;
    }
    res.json({ ok: true, connectionId });
  });
  router.post(
    "/:channelType/connections/:connectionId/send",
    authMiddleware,
    async (req, res) => {
      const channelType = getParam2(req.params, "channelType");
      const connectionId = getParam2(req.params, "connectionId");
      const user = req.user;
      const token = req.token;
      const { chatId, text: text3, replyToMessageId, formatting } = req.body;
      if (!chatId || !text3) {
        res.status(400).json({ error: "chatId and text are required" });
        return;
      }
      try {
        const [connection] = await db.select().from(channelConnections).where(
          and(
            eq(channelConnections.id, connectionId),
            eq(channelConnections.orgId, user.orgId)
          )
        ).limit(1);
        if (!connection) {
          res.status(404).json({ error: "Connection not found" });
          return;
        }
        if (connection.status !== "connected") {
          res.status(400).json({ error: `Connection is not active (status: ${connection.status})` });
          return;
        }
        const provider = channelProviders.get(connection.channelType);
        if (!provider) {
          res.status(500).json({ error: "Channel provider not available" });
          return;
        }
        const credKey = provider.credentialKey ?? connection.channelType;
        const credential = await getCredential(
          user.id,
          user.orgId,
          credKey,
          token
        );
        if (!credential?.apiKey) {
          res.status(400).json({ error: "No credentials available" });
          return;
        }
        const ctx = {
          connectionId,
          userId: user.id,
          orgId: user.orgId
        };
        const result = await provider.sendMessage(
          ctx,
          {
            channelType: connection.channelType,
            connectionId,
            chatId,
            contentType: "text",
            text: text3,
            replyToMessageId,
            formatting
          },
          credential.apiKey,
          connection.sessionData
        );
        if (result.success) {
          await db.update(channelConnections).set({
            messagesSent: (connection.messagesSent || 0) + 1,
            updatedAt: /* @__PURE__ */ new Date()
          }).where(eq(channelConnections.id, connectionId));
          void recordOutboundToConversation(connection, chatId, text3, result.messageId).catch((e) => console.error("[channels] sent, but could not record it:", e));
          res.json({
            success: true,
            messageId: result.messageId,
            timestamp: result.timestamp?.toISOString()
          });
        } else {
          console.error(
            `[channels] ${connection.channelType} send failed on connection ${connectionId} (chat ${chatId}): ${result.error ?? "provider gave no reason"}`
          );
          res.status(400).json({
            success: false,
            error: result.error,
            // Named so a caller can tell a rejected message from a channel that
            // was not ready, without parsing prose meant for a human.
            failure: "provider-rejected"
          });
        }
      } catch (error) {
        console.error(
          `[channels] Send threw on connection ${connectionId}:`,
          error instanceof Error ? error.message : error
        );
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  );
  return router;
}
async function recordOutboundToConversation(connection, chatId, text3, providerMessageId) {
  const headers = {
    "Content-Type": "application/json",
    "X-Service-Id": "integrations",
    "X-Service-Auth": process.env.SYMBIA_INTERNAL_SERVICE_TOKEN || "internal",
    ...connection.orgId ? { "X-Org-Id": connection.orgId } : {}
  };
  const found = await fetch(
    `${MESSAGING_SERVICE_URL2}/api/internal/conversations/by-channel?` + new URLSearchParams({ channelType: connection.channelType, chatId }),
    { headers }
  );
  if (!found.ok) return;
  const { conversationId } = await found.json();
  if (!conversationId) return;
  const written = await fetch(`${MESSAGING_SERVICE_URL2}/api/conversations/${conversationId}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      content: text3,
      sender_type: "agent",
      sender_id: "channel:outbound",
      metadata: {
        // Marks this as already-delivered, so nothing downstream reads it as a
        // reply that still needs sending and posts it to the channel twice.
        channelOutbound: { channelType: connection.channelType, chatId, providerMessageId }
      }
    })
  });
  if (!written.ok) {
    const detail = await written.text().catch(() => "");
    console.error(
      `[channels] delivered to ${connection.channelType} but the conversation record failed (${written.status}): ${detail.slice(0, 160)}`
    );
  }
}
init_schema();
init_db();
var IDENTITY_SERVICE_URL2 = resolveServiceUrl(ServiceId.IDENTITY);
var SWEEP_MS = Number(process.env.CHANNEL_SUPERVISOR_INTERVAL_MS || 6e4);
var BOOT_DELAY_MS = Number(process.env.CHANNEL_SUPERVISOR_BOOT_DELAY_MS || 8e3);
var REFRESH_WITHIN_MS = Number(process.env.CHANNEL_REFRESH_WITHIN_MS || 15 * 6e4);
init_db();
init_schema();
var PRICING_AS_OF = "2026-08-24";
var PRICING_SOURCE = "provider public pricing pages, transcribed by hand";
var MODEL_PRICES = {
  // Anthropic
  "claude-sonnet-5": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-opus-5": { inputPerMillion: 15, outputPerMillion: 75 },
  "claude-haiku-4-5-20251001": { inputPerMillion: 0.8, outputPerMillion: 4 },
  "claude-3-5-sonnet-20241022": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-3-haiku-20240307": { inputPerMillion: 0.25, outputPerMillion: 1.25 },
  // OpenAI
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10 },
  // Local. Not free — it burns the host's CPU and, on a shared machine,
  // competes with the encoder — but it is not billed by a provider, and
  // pretending otherwise would put invented money on a streamer's invoice.
  "qwen2-5-0-5b-instruct-q4-k-m": { inputPerMillion: 0, outputPerMillion: 0 }
};
function lookup(model) {
  if (!model) return void 0;
  const direct = MODEL_PRICES[model];
  if (direct) return direct;
  const bare = model.includes("/") ? model.slice(model.indexOf("/") + 1) : void 0;
  return bare ? MODEL_PRICES[bare] : void 0;
}
function estimateCost(model, promptTokens, completionTokens) {
  const base = { pricingAsOf: PRICING_AS_OF, pricingSource: PRICING_SOURCE };
  const price = lookup(model);
  if (!price) {
    return { ...base, costMicros: null, priced: false, reason: `no price on file for model "${model}"` };
  }
  if (promptTokens == null || completionTokens == null) {
    return {
      ...base,
      costMicros: null,
      priced: false,
      reason: "prompt and completion tokens are priced separately and this call reported only one of them"
    };
  }
  const dollars = promptTokens / 1e6 * price.inputPerMillion + completionTokens / 1e6 * price.outputPerMillion;
  return { ...base, costMicros: Math.round(dollars * 1e6), priced: true };
}
init_schema();
init_db();
var IDENTITY_SERVICE_URL3 = resolveServiceUrl(ServiceId.IDENTITY);
var LIMIT_KEY = "modelSpendMicros";
var LIMIT_TTL_MS = 6e4;
var limitCache = /* @__PURE__ */ new Map();
async function planSpendLimit(orgId) {
  const hit = limitCache.get(orgId);
  if (hit && Date.now() - hit.at < LIMIT_TTL_MS) return hit.micros;
  let micros;
  try {
    const r = await fetch(
      `${IDENTITY_SERVICE_URL3}/api/internal/orgs/${encodeURIComponent(orgId)}/limits`,
      { headers: { "X-Service-Id": "integrations" } }
    );
    if (r.ok) {
      const body = await r.json();
      const v = body.limits?.[LIMIT_KEY];
      if (typeof v === "number" && v > 0) micros = v;
    }
  } catch {
  }
  limitCache.set(orgId, { at: Date.now(), micros });
  return micros;
}
var CAP_MICROS = Number(process.env.GATEWAY_SPEND_CAP_MICROS || 0);
var WINDOW_HOURS = Number(process.env.GATEWAY_SPEND_WINDOW_HOURS || 24);
async function checkSpendCap(orgId) {
  const base = { spentMicros: 0, capMicros: CAP_MICROS, windowHours: WINDOW_HOURS };
  if (!orgId) {
    return {
      ...base,
      allowed: true,
      enforced: false,
      capSource: "none",
      reason: "no orgId on the request; nothing to meter against"
    };
  }
  const planMicros = await planSpendLimit(orgId);
  const capMicros = planMicros ?? CAP_MICROS;
  const capSource = planMicros ? "plan" : "config";
  base.capMicros = capMicros;
  if (!capMicros || capMicros <= 0) {
    return { ...base, allowed: true, enforced: false, capSource: "none", reason: "no cap configured" };
  }
  try {
    const since = new Date(Date.now() - WINDOW_HOURS * 36e5);
    const [row] = await db.select({ spent: sql`coalesce(sum(${executionLogs.estimatedCostMicros}), 0)::bigint` }).from(executionLogs).where(and(
      sql`${executionLogs.orgId} = ${orgId}`,
      sql`${executionLogs.startedAt} >= ${since}`
    ));
    const spentMicros = Number(row?.spent ?? 0);
    if (spentMicros >= capMicros) {
      return {
        ...base,
        spentMicros,
        allowed: false,
        enforced: true,
        capSource,
        reason: `org has spent ${spentMicros} of ${capMicros} micros in the last ${WINDOW_HOURS}h (ceiling from ${capSource}; estimated from the price table, not billed)`
      };
    }
    return { ...base, spentMicros, allowed: true, enforced: true, capSource };
  } catch (error) {
    console.error("[spend-guard] could not read spend; allowing the call:", error);
    return {
      ...base,
      allowed: true,
      enforced: false,
      capSource: "none",
      reason: "spend could not be read; not enforced for this call"
    };
  }
}
init_db();
var EXTERNAL_TYPES = /* @__PURE__ */ new Set(["openapi", "mcp"]);
function isExternallyRegistered(type) {
  return EXTERNAL_TYPES.has(String(type || "").toLowerCase());
}
async function ensureRegistryTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS registered_integrations (
      key VARCHAR(255) PRIMARY KEY,
      type VARCHAR(50) NOT NULL,
      definition JSONB NOT NULL,
      registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `);
}
async function rememberIntegration(integration) {
  if (!isExternallyRegistered(integration.type)) return;
  try {
    await ensureRegistryTable();
    await db.execute(sql`
      INSERT INTO registered_integrations (key, type, definition, updated_at)
      VALUES (${integration.key}, ${integration.type}, ${JSON.stringify(integration)}::jsonb, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET
        type = EXCLUDED.type,
        definition = EXCLUDED.definition,
        updated_at = CURRENT_TIMESTAMP
    `);
    console.log(`[registry-store] remembered ${integration.key} (${integration.type})`);
  } catch (error) {
    console.error(`[registry-store] could not remember ${integration.key}:`, error);
  }
}
var apiDocumentation = {
  openapi: "3.0.3",
  info: {
    title: "Symbia Integrations Service",
    description: "Centralized gateway for third-party API traffic. Sole bridge to the external world in most Symbia networks.",
    version: "2.0.0"
  },
  servers: [
    {
      url: "http://localhost:5007",
      description: "Local development"
    }
  ],
  tags: [
    { name: "Execute", description: "Execute operations via providers" },
    { name: "Providers", description: "Provider configuration and discovery" },
    { name: "Registry", description: "Integration registry management" },
    { name: "MCP", description: "MCP server and client endpoints" },
    { name: "Usage", description: "Usage analytics" },
    { name: "Health", description: "Service health and monitoring" },
    { name: "Database", description: "Database management (in-memory mode)" }
  ],
  paths: {
    "/api/integrations/execute": {
      post: {
        tags: ["Execute"],
        summary: "Execute an LLM operation",
        description: "Execute a chat completion or embedding operation through a configured provider",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ExecuteRequest" }
            }
          }
        },
        responses: {
          "200": {
            description: "Successful execution",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ExecuteResponse" }
              }
            }
          },
          "400": { description: "Invalid request or validation error" },
          "401": { description: "Authentication required" },
          "429": { description: "Rate limit exceeded" },
          "502": { description: "Provider error" },
          "503": { description: "Circuit breaker open or service unavailable" },
          "504": { description: "Request timed out" }
        }
      }
    },
    "/api/integrations/invoke": {
      post: {
        tags: ["Execute"],
        summary: "Invoke any registered integration operation",
        description: "Invoke operations from registered OpenAPI specs, MCP servers, or built-in providers",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/InvokeRequest" }
            }
          }
        },
        responses: {
          "200": { description: "Successful invocation" },
          "400": { description: "Invalid request" },
          "401": { description: "Authentication required" },
          "404": { description: "Operation not found" }
        }
      }
    },
    // Declared 16 Aug. The route has existed since the models rework, but
    // an undeclared route is an unreachable one for any caller that
    // resolves against this document — the MCP dispatcher reported models'
    // weight download as "no such operation" while the handler sat there
    // working. Spec completeness is a capability gap, measurably.
    "/api/integrations/download": {
      post: {
        tags: ["Execute"],
        summary: "Stream a file from a provider through this service",
        description: "Streams bytes from the provider to the caller. This service supplies the org's credential when it holds one, so gated repositories work and the key never leaves here. It makes no claim about what the bytes are \u2014 the caller hashes, ledgers and cards them.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["provider", "repo", "file"],
                properties: {
                  provider: { type: "string", enum: ["huggingface"] },
                  repo: { type: "string", example: "TheBloke/Llama-2-7B-GGUF" },
                  file: { type: "string", description: "A plain .gguf file name, no path", example: "llama-2-7b.Q4_K_M.gguf" },
                  revision: { type: "string", default: "main" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "The file, streamed", content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } },
          "400": { description: "provider, repo and a plain .gguf file name required" },
          "401": { description: "Authentication required" },
          "500": { description: "The provider refused or the stream failed" }
        }
      }
    },
    "/api/integrations/providers": {
      get: {
        tags: ["Providers"],
        summary: "List available providers",
        responses: {
          "200": {
            description: "List of providers",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    providers: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ProviderInfo" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/integrations/providers/{provider}": {
      get: {
        tags: ["Providers"],
        summary: "Get provider configuration",
        parameters: [
          { name: "provider", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          "200": { description: "Provider configuration" },
          "404": { description: "Provider not found" }
        }
      }
    },
    "/api/integrations/providers/{provider}/models": {
      get: {
        tags: ["Providers"],
        summary: "Get available models for a provider",
        parameters: [
          { name: "provider", in: "path", required: true, schema: { type: "string" } },
          { name: "capability", in: "query", schema: { type: "string" } }
        ],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "List of models" }
        }
      }
    },
    "/api/integrations/capabilities": {
      get: {
        tags: ["Providers"],
        summary: "Get comprehensive provider capabilities",
        description: "System of Record for UI - includes access status, models by purpose, defaults",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Provider capabilities",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CapabilitiesResponse" }
              }
            }
          }
        }
      }
    },
    "/api/integrations/registry": {
      get: {
        tags: ["Registry"],
        summary: "List all registered integrations",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "List of integrations" }
        }
      }
    },
    "/api/integrations/register": {
      post: {
        tags: ["Registry"],
        summary: "Register a new integration",
        description: "Register an OpenAPI spec or MCP server as a callable integration",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterRequest" }
            }
          }
        },
        responses: {
          "200": { description: "Integration registered" },
          "400": { description: "Invalid request" }
        }
      }
    },
    "/api/integrations/registry/{key}/operations": {
      get: {
        tags: ["Registry"],
        summary: "Get operations for an integration",
        parameters: [
          { name: "key", in: "path", required: true, schema: { type: "string" } }
        ],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "List of operations" },
          "404": { description: "Integration not found" }
        }
      }
    },
    "/api/integrations/mcp": {
      post: {
        tags: ["MCP"],
        summary: "MCP JSON-RPC endpoint",
        description: "HTTP transport for MCP protocol. Supports initialize, tools/list, tools/call",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MCPRequest" }
            }
          }
        },
        responses: {
          "200": {
            description: "MCP response",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MCPResponse" }
              }
            }
          }
        }
      }
    },
    "/api/integrations/mcp/info": {
      get: {
        tags: ["MCP"],
        summary: "Get MCP server info",
        responses: {
          "200": { description: "Server info" }
        }
      }
    },
    "/api/integrations/mcp/register": {
      post: {
        tags: ["MCP"],
        summary: "Register an external MCP server",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterMCPRequest" }
            }
          }
        },
        responses: {
          "200": { description: "MCP server registered" },
          "400": { description: "Failed to connect to MCP server" }
        }
      }
    },
    "/api/integrations/usage": {
      get: {
        tags: ["Usage"],
        summary: "Get usage summary for organization",
        parameters: [
          { name: "days", in: "query", schema: { type: "integer", default: 30 } },
          { name: "integration", in: "query", schema: { type: "string" } }
        ],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Usage summary" }
        }
      }
    },
    "/api/integrations/status": {
      get: {
        tags: ["Health"],
        summary: "Get service status",
        description: "Returns provider status and circuit breaker state",
        responses: {
          "200": {
            description: "Service status",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StatusResponse" }
              }
            }
          }
        }
      }
    },
    "/api/integrations/circuit-breaker": {
      get: {
        tags: ["Health"],
        summary: "Get circuit breaker status",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Circuit breaker status",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CircuitBreakerStatus" }
              }
            }
          }
        }
      }
    },
    "/api/integrations/circuit-breaker/reset": {
      post: {
        tags: ["Health"],
        summary: "Reset all circuit breakers",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "All circuits reset" }
        }
      }
    },
    "/api/integrations/circuit-breaker/reset/{provider}": {
      post: {
        tags: ["Health"],
        summary: "Reset circuit breaker for a provider",
        parameters: [
          { name: "provider", in: "path", required: true, schema: { type: "string" } }
        ],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Circuit reset" }
        }
      }
    },
    "/api/integrations/db/export": {
      post: {
        tags: ["Database"],
        summary: "Export in-memory database to file",
        description: "Exports the in-memory database to a backup file. Only applicable when using in-memory mode.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Export successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    path: { type: "string" },
                    message: { type: "string" }
                  }
                }
              }
            }
          },
          "401": { description: "Authentication required" },
          "500": { description: "Export failed" }
        }
      }
    },
    "/api/integrations/db/status": {
      get: {
        tags: ["Database"],
        summary: "Get database status",
        description: "Returns information about the database mode (in-memory vs PostgreSQL) and persistence status.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Database status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    isMemory: { type: "boolean" },
                    persistsOnRestart: { type: "boolean" },
                    recommendation: { type: "string" }
                  }
                }
              }
            }
          },
          "401": { description: "Authentication required" }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    },
    schemas: {
      ExecuteRequest: {
        type: "object",
        required: ["provider", "operation", "params"],
        properties: {
          provider: {
            type: "string",
            enum: ["openai", "anthropic", "google", "mistral", "cohere", "huggingface"]
          },
          operation: {
            type: "string",
            enum: ["chat.completions", "messages", "embeddings", "responses"]
          },
          params: {
            type: "object",
            required: ["model"],
            properties: {
              model: { type: "string" },
              messages: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    role: { type: "string", enum: ["system", "user", "assistant"] },
                    content: { type: "string" }
                  }
                }
              },
              temperature: { type: "number", minimum: 0, maximum: 2 },
              maxTokens: { type: "integer" },
              topP: { type: "number" },
              frequencyPenalty: { type: "number" },
              presencePenalty: { type: "number" },
              stop: { type: "array", items: { type: "string" } },
              seed: { type: "integer" },
              input: { type: "string", description: "For embedding operations" }
            }
          },
          credentialId: { type: "string" }
        }
      },
      ExecuteResponse: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          data: { $ref: "#/components/schemas/NormalizedLLMResponse" },
          error: { type: "string" },
          errorCategory: { $ref: "#/components/schemas/ErrorCategory" },
          retryable: { type: "boolean" },
          requestId: { type: "string" },
          durationMs: { type: "number" }
        }
      },
      NormalizedLLMResponse: {
        type: "object",
        properties: {
          provider: { type: "string" },
          model: { type: "string" },
          content: { type: "string" },
          usage: {
            type: "object",
            properties: {
              promptTokens: { type: "integer" },
              completionTokens: { type: "integer" },
              totalTokens: { type: "integer" }
            }
          },
          finishReason: {
            type: "string",
            enum: ["stop", "length", "content_filter", "tool_calls", "error", "incomplete"]
          },
          metadata: { type: "object" }
        }
      },
      ErrorCategory: {
        type: "string",
        enum: [
          "auth",
          "validation",
          "rate_limit",
          "timeout",
          "provider",
          "network",
          "not_found",
          "content_filter",
          "quota",
          "internal"
        ],
        description: "Error category for retry/fallback decisions"
      },
      InvokeRequest: {
        type: "object",
        required: ["operation"],
        properties: {
          operation: { type: "string", description: "Fully qualified operation ID" },
          body: { type: "object" },
          timeout: { type: "integer" }
        }
      },
      ProviderInfo: {
        type: "object",
        properties: {
          name: { type: "string" },
          baseUrl: { type: "string" },
          defaultModel: { type: "string" },
          supportedOperations: { type: "array", items: { type: "string" } }
        }
      },
      CapabilitiesResponse: {
        type: "object",
        properties: {
          providers: { type: "array", items: { type: "object" } },
          byProvider: { type: "object" },
          modelsByPurpose: {
            type: "object",
            properties: {
              chat: { type: "array", items: { type: "object" } },
              embedding: { type: "array", items: { type: "object" } },
              vision: { type: "array", items: { type: "object" } },
              reasoning: { type: "array", items: { type: "object" } }
            }
          },
          defaults: { type: "object" }
        }
      },
      RegisterRequest: {
        type: "object",
        required: ["key", "name", "type"],
        properties: {
          key: { type: "string" },
          name: { type: "string" },
          type: { type: "string", enum: ["openapi", "mcp", "builtin", "custom"] },
          openapi: {
            type: "object",
            properties: {
              specUrl: { type: "string" },
              serverUrl: { type: "string" }
            }
          },
          mcp: {
            type: "object",
            properties: {
              transport: { type: "string", enum: ["stdio", "http", "websocket"] },
              command: { type: "string" },
              args: { type: "array", items: { type: "string" } },
              serverUrl: { type: "string" }
            }
          },
          auth: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["none", "bearer", "apiKey"] }
            }
          }
        }
      },
      MCPRequest: {
        type: "object",
        required: ["jsonrpc", "method"],
        properties: {
          jsonrpc: { type: "string", enum: ["2.0"] },
          id: { oneOf: [{ type: "string" }, { type: "integer" }] },
          method: { type: "string" },
          params: { type: "object" }
        }
      },
      MCPResponse: {
        type: "object",
        properties: {
          jsonrpc: { type: "string" },
          id: { oneOf: [{ type: "string" }, { type: "integer" }] },
          result: { type: "object" },
          error: {
            type: "object",
            properties: {
              code: { type: "integer" },
              message: { type: "string" }
            }
          }
        }
      },
      RegisterMCPRequest: {
        type: "object",
        required: ["key", "name", "mcp"],
        properties: {
          key: { type: "string" },
          name: { type: "string" },
          mcp: {
            type: "object",
            properties: {
              transport: { type: "string", enum: ["stdio", "http", "websocket"] },
              command: { type: "string" },
              args: { type: "array", items: { type: "string" } },
              serverUrl: { type: "string" }
            }
          }
        }
      },
      StatusResponse: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["healthy", "degraded", "unhealthy"] },
          providers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                configured: { type: "boolean" }
              }
            }
          },
          circuitBreaker: { $ref: "#/components/schemas/CircuitBreakerStatus" }
        }
      },
      CircuitBreakerStatus: {
        type: "object",
        additionalProperties: {
          type: "object",
          properties: {
            state: { type: "string", enum: ["closed", "open", "half-open"] },
            failures: { type: "integer" },
            lastFailure: { type: "string" }
          }
        }
      }
    }
  }
};
{
  const __autoDocumentedPaths = {
    "/api/oauth/connections/{id}": {
      "delete": {
        "tags": [
          "Api"
        ],
        "summary": "Delete connections",
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
    "/api/model-eval/benchmarks": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "List benchmarks",
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
    "/api/model-eval/benchmarks/{id}": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "Get benchmarks",
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
    "/api/model-eval/catalog/export": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "Export api integrations channels catalog export",
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
    "/api/model-eval/catalog/preview": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "Preview api integrations channels catalog preview",
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
    "/api/model-eval/evaluations": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "List evaluations",
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
    "/api/model-eval/evaluations/{id}": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "Get evaluations",
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
    "/api/model-eval/models": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "List models",
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
    "/api/model-eval/scores": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "List scores",
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
    "/api/integrations/models": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "List models",
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
    "/api/integrations/namespace": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "Get namespace",
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
    "/api/integrations/operations/search": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "Get search",
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
    "/api/integrations/registry/{key}": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "Get registry",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "key",
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
    "/api/integrations/usage/by-user": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "Get by user",
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
    "/api/integrations/usage/logs": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "List logs",
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
    "/api/oauth/callback": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "Callback api oauth callback",
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
    "/api/oauth/connections": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "List connections",
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
    "/api/oauth/providers": {
      "get": {
        "tags": [
          "Api"
        ],
        "summary": "List providers",
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
    "/api/stats": {
      "get": {
        "tags": [
          "Api"
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
    "/api/model-eval/benchmarks/run": {
      "post": {
        "tags": [
          "Api"
        ],
        "summary": "Run api integrations channels benchmarks run",
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
    "/api/model-eval/catalog/sync": {
      "post": {
        "tags": [
          "Api"
        ],
        "summary": "Refresh the catalog's model entries from the configured providers",
        "description": "Measured 19 Aug: this was advertised at /api/integrations/channels/catalog/sync, which returns 404. The route is mounted by model-eval/api/eval-routes.ts under /api/model-eval, and the real path answers 200. The description said 'documented from the implemented route' while naming a path the implementation never had, so the doc was not merely incomplete \u2014 it was confidently wrong, which is worse for a client that trusts it. Requires X-Service-Auth for the catalog write it performs.",
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
    "/api/model-eval/recommendations": {
      "post": {
        "tags": [
          "Api"
        ],
        "summary": "Recommendations api integrations channels recommendations",
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
    "/api/model-eval/scores/aggregate": {
      "post": {
        "tags": [
          "Api"
        ],
        "summary": "Aggregate api integrations channels scores aggregate",
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
    "/api/integrations/parse/mcp": {
      "post": {
        "tags": [
          "Api"
        ],
        "summary": "Create mcp",
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
    "/api/integrations/parse/openapi": {
      "post": {
        "tags": [
          "Api"
        ],
        "summary": "Create openapi",
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
    "/api/integrations/registry/{key}/refresh": {
      "post": {
        "tags": [
          "Api"
        ],
        "summary": "Refresh api integrations registry refresh",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "key",
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
    "/api/oauth/authorize": {
      "post": {
        "tags": [
          "Api"
        ],
        "summary": "Authorize api oauth authorize",
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
var IntegrationError = class extends Error {
  category;
  statusCode;
  provider;
  operation;
  retryable;
  upstream;
  constructor(opts) {
    super(opts.message, { cause: opts.cause });
    this.name = "IntegrationError";
    this.category = opts.category;
    this.statusCode = opts.statusCode ?? categoryToStatus(opts.category);
    this.provider = opts.provider;
    this.operation = opts.operation;
    this.retryable = opts.retryable ?? categoryRetryable(opts.category);
    this.upstream = opts.upstream;
  }
  /**
   * Serialize for API response — safe to send to callers
   */
  toResponse() {
    return {
      error: this.message,
      category: this.category,
      retryable: this.retryable,
      provider: this.provider,
      operation: this.operation,
      upstream: this.upstream ? {
        statusCode: this.upstream.statusCode,
        code: this.upstream.code
      } : void 0
    };
  }
};
function classifyProviderError(err, provider, operation) {
  if (err instanceof IntegrationError) {
    return err;
  }
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error ? err : void 0;
  if (message.includes("The operation was aborted") || message.includes("aborted") || message.includes("timeout") || message.includes("Timeout") || err instanceof DOMException && err.name === "TimeoutError") {
    return new IntegrationError({
      message: `Request to ${provider} timed out`,
      category: "timeout",
      provider,
      operation,
      cause
    });
  }
  if (message.includes("fetch failed") || message.includes("ECONNREFUSED") || message.includes("ECONNRESET") || message.includes("ENOTFOUND") || message.includes("EAI_AGAIN") || message.includes("socket hang up") || message.includes("network")) {
    return new IntegrationError({
      message: `Network error connecting to ${provider}: ${message}`,
      category: "network",
      provider,
      operation,
      cause
    });
  }
  const upstreamStatus = extractUpstreamStatus(message);
  if (upstreamStatus) {
    if (upstreamStatus === 401 || upstreamStatus === 403) {
      return new IntegrationError({
        message: `${provider} rejected the API key. Check your credentials in Settings.`,
        category: "auth",
        provider,
        operation,
        retryable: false,
        upstream: { statusCode: upstreamStatus, message },
        cause
      });
    }
    if (upstreamStatus === 429) {
      return new IntegrationError({
        message: `${provider} rate limit exceeded. Try again shortly.`,
        category: "rate_limit",
        provider,
        operation,
        retryable: true,
        upstream: { statusCode: upstreamStatus, message },
        cause
      });
    }
    if (upstreamStatus === 402 || message.toLowerCase().includes("quota") || message.toLowerCase().includes("billing")) {
      return new IntegrationError({
        message: `${provider} quota or billing limit reached.`,
        category: "quota",
        provider,
        operation,
        retryable: false,
        upstream: { statusCode: upstreamStatus, message },
        cause
      });
    }
    if (message.toLowerCase().includes("content_filter") || message.toLowerCase().includes("safety") || message.toLowerCase().includes("harmful")) {
      return new IntegrationError({
        message: `${provider} blocked the request due to content policy.`,
        category: "content_filter",
        provider,
        operation,
        retryable: false,
        upstream: { statusCode: upstreamStatus, message },
        cause
      });
    }
  }
  if (message.toLowerCase().includes("rate limit") || message.toLowerCase().includes("rate_limit")) {
    return new IntegrationError({
      message: `${provider} rate limit exceeded. Try again shortly.`,
      category: "rate_limit",
      provider,
      operation,
      retryable: true,
      cause
    });
  }
  if (message.toLowerCase().includes("quota") || message.toLowerCase().includes("insufficient_quota") || message.toLowerCase().includes("billing")) {
    return new IntegrationError({
      message: `${provider} quota or billing limit reached.`,
      category: "quota",
      provider,
      operation,
      retryable: false,
      cause
    });
  }
  if (message.toLowerCase().includes("invalid api key") || message.toLowerCase().includes("unauthorized") || message.toLowerCase().includes("authentication")) {
    return new IntegrationError({
      message: `${provider} rejected the API key. Check your credentials in Settings.`,
      category: "auth",
      provider,
      operation,
      retryable: false,
      cause
    });
  }
  if (message.toLowerCase().includes("content_filter") || message.toLowerCase().includes("content policy") || message.toLowerCase().includes("safety")) {
    return new IntegrationError({
      message: `${provider} blocked the request due to content policy.`,
      category: "content_filter",
      provider,
      operation,
      retryable: false,
      cause
    });
  }
  return new IntegrationError({
    message: `${provider} error: ${message}`,
    category: "provider",
    provider,
    operation,
    upstream: upstreamStatus ? { statusCode: upstreamStatus, message } : void 0,
    cause
  });
}
function categoryToStatus(category) {
  switch (category) {
    case "auth":
      return 401;
    case "validation":
      return 400;
    case "rate_limit":
      return 429;
    case "timeout":
      return 504;
    case "provider":
      return 502;
    case "network":
      return 502;
    case "not_found":
      return 404;
    case "content_filter":
      return 422;
    case "quota":
      return 402;
    case "internal":
      return 500;
  }
}
function categoryRetryable(category) {
  switch (category) {
    case "timeout":
    case "network":
    case "rate_limit":
    case "provider":
      return true;
    case "auth":
    case "validation":
    case "not_found":
    case "content_filter":
    case "quota":
    case "internal":
      return false;
  }
}
function extractUpstreamStatus(message) {
  const statusMatch = message.match(/(?:status|HTTP|error)\s+(\d{3})/i);
  if (statusMatch) {
    return parseInt(statusMatch[1], 10);
  }
  const codeMatch = message.match(/\b(4\d{2}|5\d{2})\b/);
  if (codeMatch) {
    return parseInt(codeMatch[1], 10);
  }
  return void 0;
}
var telemetryClient = null;
function getTelemetry() {
  if (!telemetryClient) {
    telemetryClient = createTelemetryClient({
      serviceId: process.env.TELEMETRY_SERVICE_ID || ServiceId.INTEGRATIONS
    });
  }
  return telemetryClient;
}
function recordProviderRequest(provider, operation, durationMs, success, usage) {
  const telemetry = getTelemetry();
  const tags = { provider, operation, success: String(success) };
  telemetry.metric("integrations.provider.request.count", 1, tags);
  telemetry.metric("integrations.provider.request.duration_ms", durationMs, tags);
  if (usage) {
    if (usage.promptTokens) {
      telemetry.metric("integrations.provider.tokens.prompt", usage.promptTokens, { provider });
    }
    if (usage.completionTokens) {
      telemetry.metric("integrations.provider.tokens.completion", usage.completionTokens, { provider });
    }
    if (usage.totalTokens) {
      telemetry.metric("integrations.provider.tokens.total", usage.totalTokens, { provider });
    }
  }
}
function recordCircuitBreakerChange(provider, state) {
  const telemetry = getTelemetry();
  telemetry.event("integrations.circuit_breaker.state_change", `Circuit breaker for ${provider} changed to ${state}`, {
    provider,
    state
  });
}
async function withProviderObservability(provider, operation, requestId, fn) {
  const startTime = Date.now();
  const traceId = requestId;
  const requestEvent = {
    method: "POST",
    path: `/${provider}/${operation}`,
    traceId
  };
  emitHttpRequest(requestEvent, traceId).catch(() => {
  });
  emitEvent("integrations.provider.request", {
    provider,
    operation,
    requestId
  }, requestId, {
    target: `provider:${provider}`,
    boundary: "extra"
  }).catch(() => {
  });
  try {
    const result = await fn();
    const durationMs = Date.now() - startTime;
    const responseEvent = {
      method: "POST",
      path: `/${provider}/${operation}`,
      statusCode: 200,
      durationMs,
      traceId
    };
    emitHttpResponse(responseEvent, traceId).catch(() => {
    });
    emitEvent("integrations.provider.response", {
      provider,
      operation,
      requestId,
      durationMs,
      success: true
    }, requestId, {
      target: ServiceId.INTEGRATIONS,
      boundary: "extra"
    }).catch(() => {
    });
    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const responseEvent = {
      method: "POST",
      path: `/${provider}/${operation}`,
      statusCode: 502,
      durationMs,
      traceId
    };
    emitHttpResponse(responseEvent, traceId).catch(() => {
    });
    emitEvent("integrations.provider.error", {
      provider,
      operation,
      requestId,
      durationMs,
      error: error instanceof Error ? error.message : "Unknown error"
    }, requestId, {
      target: ServiceId.INTEGRATIONS,
      boundary: "extra"
    }).catch(() => {
    });
    throw error;
  }
}
var DEFAULT_CONFIG = {
  userLimit: 100,
  // 100 requests per user per minute
  orgLimit: 500,
  // 500 requests per org per minute
  providerLimit: 1e3,
  // 1000 requests per provider per minute
  windowMs: 6e4
  // 1 minute window
};
var PROVIDER_LIMITS = {
  openai: 3e3,
  anthropic: 1e3,
  google: 500,
  mistral: 500,
  cohere: 500,
  huggingface: 300
};
var SlidingWindowCounter = class {
  windows = /* @__PURE__ */ new Map();
  windowMs;
  constructor(windowMs) {
    this.windowMs = windowMs;
    setInterval(() => this.cleanup(), 5 * 6e4);
  }
  /**
   * Increment counter and check if over limit
   * Returns { allowed: boolean, current: number, limit: number, resetMs: number }
   */
  check(key, limit) {
    const now = Date.now();
    const entry = this.windows.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.windows.set(key, { count: 1, windowStart: now });
      return { allowed: true, current: 1, limit, resetMs: this.windowMs };
    }
    entry.count++;
    const resetMs = this.windowMs - (now - entry.windowStart);
    if (entry.count > limit) {
      return { allowed: false, current: entry.count, limit, resetMs };
    }
    return { allowed: true, current: entry.count, limit, resetMs };
  }
  /**
   * Get current count without incrementing
   */
  peek(key) {
    const now = Date.now();
    const entry = this.windows.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      return 0;
    }
    return entry.count;
  }
  /**
   * Remove stale entries
   */
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.windows.entries()) {
      if (now - entry.windowStart >= this.windowMs * 2) {
        this.windows.delete(key);
      }
    }
  }
};
var RateLimiter = class {
  userCounter;
  orgCounter;
  providerCounter;
  config;
  constructor(config2 = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config2 };
    this.userCounter = new SlidingWindowCounter(this.config.windowMs);
    this.orgCounter = new SlidingWindowCounter(this.config.windowMs);
    this.providerCounter = new SlidingWindowCounter(this.config.windowMs);
  }
  /**
   * Check all rate limits for a request
   * Throws IntegrationError if any limit exceeded
   */
  checkLimits(opts) {
    const { userId, orgId, provider } = opts;
    const userKey = `user:${userId}`;
    const userResult = this.userCounter.check(userKey, this.config.userLimit);
    if (!userResult.allowed) {
      throw new IntegrationError({
        message: `Rate limit exceeded. You've made ${userResult.current} requests in the last minute (limit: ${userResult.limit}). Try again in ${Math.ceil(userResult.resetMs / 1e3)}s.`,
        category: "rate_limit",
        provider,
        retryable: true
      });
    }
    const orgKey = `org:${orgId}`;
    const orgResult = this.orgCounter.check(orgKey, this.config.orgLimit);
    if (!orgResult.allowed) {
      throw new IntegrationError({
        message: `Organization rate limit exceeded. Your organization has made ${orgResult.current} requests in the last minute (limit: ${orgResult.limit}). Try again in ${Math.ceil(orgResult.resetMs / 1e3)}s.`,
        category: "rate_limit",
        provider,
        retryable: true
      });
    }
    const providerLimit = PROVIDER_LIMITS[provider] || this.config.providerLimit;
    const providerKey = `provider:${provider}`;
    const providerResult = this.providerCounter.check(providerKey, providerLimit);
    if (!providerResult.allowed) {
      throw new IntegrationError({
        message: `${provider} rate limit exceeded. Platform has made ${providerResult.current} requests in the last minute (limit: ${providerResult.limit}). Try again in ${Math.ceil(providerResult.resetMs / 1e3)}s.`,
        category: "rate_limit",
        provider,
        retryable: true
      });
    }
  }
  /**
   * Get current usage stats (for debugging/monitoring)
   */
  getStats(opts) {
    const stats = {};
    if (opts.userId) {
      stats.userRequests = this.userCounter.peek(`user:${opts.userId}`);
    }
    if (opts.orgId) {
      stats.orgRequests = this.orgCounter.peek(`org:${opts.orgId}`);
    }
    if (opts.provider) {
      stats.providerRequests = this.providerCounter.peek(`provider:${opts.provider}`);
    }
    return stats;
  }
};
var rateLimiter = new RateLimiter();
function rateLimitMiddleware(req, res, next) {
  if (!config.rateLimitEnabled) {
    next();
    return;
  }
  const user = req.user;
  const provider = req.body?.provider;
  if (!user || !provider) {
    next();
    return;
  }
  try {
    rateLimiter.checkLimits({
      userId: user.id,
      orgId: user.orgId || user.organizations?.[0]?.id,
      provider
    });
    const stats = rateLimiter.getStats({ userId: user.id, orgId: user.orgId, provider });
    res.setHeader("X-RateLimit-User-Remaining", String(DEFAULT_CONFIG.userLimit - (stats.userRequests || 0)));
    res.setHeader("X-RateLimit-Org-Remaining", String(DEFAULT_CONFIG.orgLimit - (stats.orgRequests || 0)));
    next();
  } catch (error) {
    if (error instanceof IntegrationError) {
      res.status(error.statusCode).json(error.toResponse());
    } else {
      next(error);
    }
  }
}
var MAX_BODY_SIZE = 10 * 1024 * 1024;
function bodySizeLimitMiddleware(req, res, next) {
  const contentLength = parseInt(req.headers["content-length"] || "0", 10);
  if (contentLength > MAX_BODY_SIZE) {
    const error = new IntegrationError({
      message: `Request body too large. Maximum size is ${MAX_BODY_SIZE / 1024 / 1024}MB`,
      category: "validation",
      retryable: false
    });
    res.status(error.statusCode).json(error.toResponse());
    return;
  }
  next();
}
function securityHeadersMiddleware(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'"
  );
  next();
}
var DEFAULT_CIRCUIT_CONFIG = {
  failureThreshold: 5,
  resetTimeout: 3e4,
  // 30 seconds
  successThreshold: 2
};
var CircuitBreaker = class {
  circuits = /* @__PURE__ */ new Map();
  config;
  constructor(config2 = {}) {
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config2 };
  }
  /**
   * Get the current state for a provider
   */
  getState(provider) {
    if (!this.circuits.has(provider)) {
      this.circuits.set(provider, {
        failures: 0,
        lastFailure: 0,
        state: "closed",
        successesSinceHalfOpen: 0
      });
    }
    return this.circuits.get(provider);
  }
  /**
   * Check if requests should be allowed through
   */
  canRequest(provider) {
    const state = this.getState(provider);
    const now = Date.now();
    switch (state.state) {
      case "closed":
        return { allowed: true };
      case "open":
        if (now - state.lastFailure >= this.config.resetTimeout) {
          state.state = "half-open";
          state.successesSinceHalfOpen = 0;
          recordCircuitBreakerChange(provider, "half-open");
          return { allowed: true };
        }
        if (state.terminalReason) {
          return {
            allowed: false,
            reason: `Circuit open for ${provider}: ${state.terminalReason}. Waiting will not clear this \u2014 the credential has to be fixed or replaced, then POST /api/integrations/circuit-breaker/reset/${provider}.`
          };
        }
        return {
          allowed: false,
          reason: `Circuit open for ${provider}. Too many recent failures. Retry after ${Math.ceil((this.config.resetTimeout - (now - state.lastFailure)) / 1e3)}s`
        };
      case "half-open":
        return { allowed: true };
    }
  }
  /**
   * Record a successful request
   */
  recordSuccess(provider) {
    const state = this.getState(provider);
    if (state.state === "half-open") {
      state.successesSinceHalfOpen++;
      if (state.successesSinceHalfOpen >= this.config.successThreshold) {
        state.state = "closed";
        state.failures = 0;
        state.successesSinceHalfOpen = 0;
        recordCircuitBreakerChange(provider, "closed");
      }
    } else if (state.state === "closed") {
      state.failures = 0;
    }
  }
  /**
   * Record a failed request
   */
  recordFailure(provider) {
    const state = this.getState(provider);
    const now = Date.now();
    const previousState = state.state;
    state.failures++;
    state.lastFailure = now;
    if (state.state === "half-open") {
      state.state = "open";
      recordCircuitBreakerChange(provider, "open");
    } else if (state.failures >= this.config.failureThreshold && previousState !== "open") {
      state.state = "open";
      recordCircuitBreakerChange(provider, "open");
    }
  }
  /**
   * A failure that will not resolve by waiting.
   *
   * `recordFailure` implements a rolling window: N failures inside a period
   * open the circuit, and a reset timeout later it half-opens to see whether
   * the trouble has passed. That is the right shape for a timeout, a 500, or a
   * rate limit, all of which are temporary by nature.
   *
   * It is the wrong shape for a 402 or a 401. A key past its billing limit does
   * not start paying because thirty seconds elapsed, and a revoked key does not
   * come back. Treating those as transient costs `failureThreshold` real
   * user-facing failures to open, then another one every reset period forever,
   * and each of those is somebody's message returning an error.
   *
   * Measured 25 Aug: the org's openai key answered 402 on every call. Because
   * that read as an ordinary failure, the circuit spent the session cycling
   * open and half-open, and provider resolution — which reads "has a
   * credential" — kept handing openai out. Seven of ten assistants were down
   * and each failure was a fresh 402.
   *
   * Opened this way the circuit stays open until someone resets it, which is
   * the honest requirement: a human has to fix the billing or replace the key,
   * and `POST /api/integrations/circuit-breaker/reset/{provider}` is how they
   * say they have.
   */
  recordTerminalFailure(provider, reason) {
    const state = this.getState(provider);
    state.failures++;
    state.lastFailure = Number.MAX_SAFE_INTEGER;
    state.terminalReason = reason;
    if (state.state !== "open") {
      state.state = "open";
      recordCircuitBreakerChange(provider, "open");
    }
  }
  /**
   * Get status for monitoring
   */
  getStatus() {
    const status = {};
    for (const [provider, state] of this.circuits) {
      status[provider] = {
        state: state.state,
        failures: state.failures,
        // A terminal open has no meaningful "last failure" instant to report —
        // its timestamp is a sentinel chosen to stop the reset timeout from
        // elapsing. Saying so beats printing a date in the year 287396.
        lastFailure: state.terminalReason ? "held open \u2014 see terminalReason" : state.lastFailure ? new Date(state.lastFailure).toISOString() : "never",
        ...state.terminalReason ? { terminalReason: state.terminalReason } : {}
      };
    }
    return status;
  }
  /**
   * Reset a circuit (for manual intervention)
   */
  reset(provider) {
    this.circuits.delete(provider);
  }
  /**
   * Reset all circuits
   */
  resetAll() {
    this.circuits.clear();
  }
};
var circuitBreaker = new CircuitBreaker();
function classifyOperation(op) {
  if (op.mcpTool) {
    return "mcp-tool";
  }
  if (op.id.startsWith("resource.")) {
    return "mcp-resource";
  }
  if (op.id.startsWith("prompt.")) {
    return "mcp-prompt";
  }
  if (op.tags?.includes("llm") || op.tags?.includes("chat")) {
    return "llm";
  }
  if (op.tags?.includes("embedding")) {
    return "embedding";
  }
  if (op.id.includes("chat.completions") || op.id.includes("messages") || op.id.includes("responses")) {
    return "llm";
  }
  if (op.id.includes("embedding")) {
    return "embedding";
  }
  return "api-call";
}
var ProviderExecutor = class {
  supportedTypes = ["llm", "embedding"];
  canHandle(operationType) {
    return this.supportedTypes.includes(operationType);
  }
  async execute(request) {
    const { operation, integrationKey, params, context } = request;
    const adapter = getProvider(integrationKey);
    if (!adapter) {
      throw new IntegrationError({
        message: `Unknown provider: ${integrationKey}`,
        category: "not_found",
        provider: integrationKey
      });
    }
    const credential = await getCredential(
      context.userId,
      context.orgId,
      integrationKey,
      context.authToken
    );
    if (!credential) {
      throw new IntegrationError({
        message: `No ${integrationKey} API key configured. Add your API key in Settings.`,
        category: "auth",
        provider: integrationKey,
        retryable: false
      });
    }
    const operationId = operation.operationId || operation.id.split(".")[0];
    const isEmbedding = operationId === "embeddings" || operation.tags?.includes("embedding");
    const validation = adapter.validateParams(operationId, params);
    if (!validation.valid) {
      throw new IntegrationError({
        message: `Invalid params: ${validation.errors?.join(", ")}`,
        category: "validation",
        provider: integrationKey,
        operation: operationId
      });
    }
    try {
      if (isEmbedding) {
        if (!adapter.embed) {
          throw new IntegrationError({
            message: `${integrationKey} does not support embeddings`,
            category: "not_found",
            provider: integrationKey
          });
        }
        const result = await adapter.embed({
          operation: operationId,
          model: params.model,
          params,
          apiKey: credential.apiKey,
          timeout: context.timeout
        });
        return {
          type: "embedding",
          data: result
        };
      } else {
        const result = await adapter.execute({
          operation: operationId,
          model: params.model,
          params,
          apiKey: credential.apiKey,
          timeout: context.timeout
        });
        return {
          type: "llm",
          data: result
        };
      }
    } catch (error) {
      throw classifyProviderError(error, integrationKey, operationId);
    }
  }
};
var providerExecutor = new ProviderExecutor();
var MCPConnectionPool = class {
  connections = /* @__PURE__ */ new Map();
  maxIdleMs = 5 * 60 * 1e3;
  // 5 minutes
  cleanupInterval;
  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 6e4);
  }
  /**
   * Get or create a connection to an MCP server
   */
  async getConnection(serverKey, config2) {
    let conn = this.connections.get(serverKey);
    if (conn && conn.isConnected) {
      conn.lastUsed = Date.now();
      return conn;
    }
    conn = await this.createConnection(serverKey, config2);
    this.connections.set(serverKey, conn);
    return conn;
  }
  /**
   * Create a new MCP connection
   */
  async createConnection(serverKey, config2) {
    const conn = {
      config: config2,
      messageId: 0,
      pendingRequests: /* @__PURE__ */ new Map(),
      buffer: "",
      lastUsed: Date.now(),
      isConnected: false
    };
    if (config2.transport === "stdio") {
      await this.connectStdio(conn);
    } else if (config2.transport === "http" || config2.transport === "websocket") {
      conn.isConnected = true;
    }
    return conn;
  }
  /**
   * Connect to a stdio-based MCP server
   */
  async connectStdio(conn) {
    if (!conn.config.command) {
      throw new IntegrationError({
        message: "No command specified for stdio MCP server",
        category: "validation"
      });
    }
    return new Promise((resolve, reject) => {
      const proc = spawn2(conn.config.command, conn.config.args || [], {
        env: { ...process.env, ...conn.config.env },
        stdio: ["pipe", "pipe", "pipe"]
      });
      if (!proc.stdin || !proc.stdout) {
        reject(new IntegrationError({
          message: "Failed to create MCP process pipes",
          category: "internal"
        }));
        return;
      }
      conn.process = proc;
      proc.stdout.on("data", (data) => {
        conn.buffer += data.toString();
        this.processBuffer(conn);
      });
      proc.stderr?.on("data", (data) => {
        console.warn(`[mcp] stderr: ${data.toString()}`);
      });
      proc.on("exit", (code) => {
        console.log(`[mcp] Process exited with code ${code}`);
        conn.isConnected = false;
        for (const pending of conn.pendingRequests.values()) {
          clearTimeout(pending.timeout);
          pending.reject(new IntegrationError({
            message: "MCP server disconnected",
            category: "network"
          }));
        }
        conn.pendingRequests.clear();
      });
      proc.on("error", (err) => {
        console.error(`[mcp] Process error:`, err);
        conn.isConnected = false;
        reject(new IntegrationError({
          message: `Failed to start MCP server: ${err.message}`,
          category: "network",
          cause: err
        }));
      });
      this.sendRequest(conn, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "symbia-integrations", version: "1.0.0" }
      }).then(() => {
        conn.isConnected = true;
        resolve();
      }).catch(reject);
    });
  }
  /**
   * Process incoming data buffer for complete messages
   */
  processBuffer(conn) {
    const lines = conn.buffer.split("\n");
    conn.buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        if (message.id !== void 0 && conn.pendingRequests.has(message.id)) {
          const pending = conn.pendingRequests.get(message.id);
          conn.pendingRequests.delete(message.id);
          clearTimeout(pending.timeout);
          if (message.error) {
            pending.reject(new IntegrationError({
              message: message.error.message,
              category: "provider",
              upstream: { code: String(message.error.code), message: message.error.message }
            }));
          } else {
            pending.resolve(message.result);
          }
        }
      } catch {
      }
    }
  }
  /**
   * Send a request to the MCP server
   */
  async sendRequest(conn, method, params) {
    if (conn.config.transport === "http" || conn.config.transport === "websocket") {
      return this.sendHttpRequest(conn, method, params);
    }
    return this.sendStdioRequest(conn, method, params);
  }
  /**
   * Send request over stdio
   */
  sendStdioRequest(conn, method, params) {
    return new Promise((resolve, reject) => {
      if (!conn.process?.stdin) {
        reject(new IntegrationError({
          message: "MCP connection not established",
          category: "network"
        }));
        return;
      }
      const id = ++conn.messageId;
      const timeoutMs = 3e4;
      const timeout = setTimeout(() => {
        conn.pendingRequests.delete(id);
        reject(new IntegrationError({
          message: `MCP request timed out: ${method}`,
          category: "timeout"
        }));
      }, timeoutMs);
      conn.pendingRequests.set(id, {
        resolve: (result) => resolve(result),
        reject,
        timeout
      });
      const message = {
        jsonrpc: "2.0",
        id,
        method,
        params
      };
      conn.process.stdin.write(JSON.stringify(message) + "\n");
    });
  }
  /**
   * Send request over HTTP
   */
  async sendHttpRequest(conn, method, params) {
    if (!conn.config.serverUrl) {
      throw new IntegrationError({
        message: "No server URL for HTTP MCP server",
        category: "validation"
      });
    }
    const response = await fetch(conn.config.serverUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params
      }),
      signal: AbortSignal.timeout(3e4)
    });
    if (!response.ok) {
      throw new IntegrationError({
        message: `MCP HTTP error: ${response.status} ${response.statusText}`,
        category: "provider",
        upstream: { statusCode: response.status }
      });
    }
    const result = await response.json();
    if (result.error) {
      throw new IntegrationError({
        message: result.error.message,
        category: "provider",
        upstream: { code: String(result.error.code), message: result.error.message }
      });
    }
    return result.result;
  }
  /**
   * Close a connection
   */
  close(serverKey) {
    const conn = this.connections.get(serverKey);
    if (conn?.process) {
      conn.process.kill();
    }
    this.connections.delete(serverKey);
  }
  /**
   * Cleanup idle connections
   */
  cleanup() {
    const now = Date.now();
    for (const [key, conn] of this.connections) {
      if (now - conn.lastUsed > this.maxIdleMs) {
        console.log(`[mcp] Closing idle connection: ${key}`);
        this.close(key);
      }
    }
  }
  /**
   * Shutdown all connections
   */
  shutdown() {
    clearInterval(this.cleanupInterval);
    for (const key of this.connections.keys()) {
      this.close(key);
    }
  }
};
var MCPExecutor = class {
  supportedTypes = ["mcp-tool", "mcp-resource", "mcp-prompt"];
  pool = new MCPConnectionPool();
  serverConfigs = /* @__PURE__ */ new Map();
  /**
   * Register an MCP server configuration
   */
  registerServer(serverKey, config2) {
    this.serverConfigs.set(serverKey, config2);
  }
  /**
   * Check if this executor can handle an operation type
   */
  canHandle(operationType) {
    return this.supportedTypes.includes(operationType);
  }
  /**
   * Execute an MCP operation
   */
  async execute(request) {
    const { operation, integrationKey, params, context } = request;
    const config2 = this.serverConfigs.get(integrationKey);
    if (!config2) {
      throw new IntegrationError({
        message: `MCP server not registered: ${integrationKey}`,
        category: "not_found"
      });
    }
    const conn = await this.pool.getConnection(integrationKey, config2);
    if (operation.mcpTool) {
      return this.executeTool(conn, operation.mcpTool.name, params);
    }
    if (operation.id.startsWith("resource.")) {
      const uri = params.uri;
      return this.readResource(conn, uri);
    }
    if (operation.id.startsWith("prompt.")) {
      const promptName = operation.id.replace("prompt.", "");
      return this.getPrompt(conn, promptName, params);
    }
    throw new IntegrationError({
      message: `Unknown MCP operation type: ${operation.id}`,
      category: "validation"
    });
  }
  /**
   * Execute an MCP tool
   */
  async executeTool(conn, toolName, params) {
    const result = await this.pool.sendRequest(
      conn,
      "tools/call",
      { name: toolName, arguments: params }
    );
    return {
      type: "mcp-tool",
      data: {
        content: result.content,
        isError: result.isError
      }
    };
  }
  /**
   * Read an MCP resource
   */
  async readResource(conn, uri) {
    const result = await this.pool.sendRequest(
      conn,
      "resources/read",
      { uri }
    );
    return {
      type: "mcp-resource",
      data: {
        contents: result.contents
      }
    };
  }
  /**
   * Get an MCP prompt
   */
  async getPrompt(conn, promptName, params) {
    const result = await this.pool.sendRequest(
      conn,
      "prompts/get",
      { name: promptName, arguments: params }
    );
    return {
      type: "mcp-prompt",
      data: {
        description: result.description,
        messages: result.messages
      }
    };
  }
  /**
   * Shutdown the executor
   */
  shutdown() {
    this.pool.shutdown();
  }
};
var mcpExecutor = new MCPExecutor();
var INTERNAL_SERVICES = [
  {
    serviceId: ServiceId.IDENTITY,
    specEndpoint: "/docs/openapi.json",
    name: "Symbia Identity",
    description: "Authentication, users, organizations, and entitlements management",
    prefix: "identity",
    additionalTags: ["internal", "symbia"],
    // Exclude sensitive auth operations from MCP
    excludePatterns: [/password/i, /reset/i, /forgot/i]
  },
  {
    serviceId: ServiceId.CATALOG,
    specEndpoint: "/docs/openapi.json",
    name: "Symbia Catalog",
    description: "Resource registry, namespaces, and metadata management",
    prefix: "catalog",
    additionalTags: ["internal", "symbia"]
  },
  {
    serviceId: ServiceId.LOGGING,
    specEndpoint: "/docs/openapi.json",
    name: "Symbia Logging",
    description: "Structured logging, audit trails, and log queries",
    prefix: "logging",
    additionalTags: ["internal", "symbia"]
  },
  {
    serviceId: ServiceId.ASSISTANTS,
    specEndpoint: "/docs/openapi.json",
    name: "Symbia Assistants",
    description: "AI assistant configuration, personas, and conversation management",
    prefix: "assistants",
    additionalTags: ["internal", "symbia"]
  },
  {
    serviceId: ServiceId.MESSAGING,
    specEndpoint: "/docs/openapi.json",
    name: "Symbia Messaging",
    description: "Message channels, threads, and real-time communication",
    prefix: "messaging",
    additionalTags: ["internal", "symbia"]
  },
  {
    serviceId: ServiceId.RUNTIME,
    specEndpoint: "/docs/openapi.json",
    name: "Symbia Runtime",
    description: "Component execution, workflows, and runtime management",
    prefix: "runtime",
    additionalTags: ["internal", "symbia"]
  },
  {
    serviceId: ServiceId.NETWORK,
    specEndpoint: "/docs/openapi.json",
    name: "Symbia Network",
    description: "Network topology, connections, and service mesh",
    prefix: "network",
    additionalTags: ["internal", "symbia"]
  }
];
function isInternalService(integrationKey) {
  return INTERNAL_SERVICES.some(
    (s) => (s.prefix || s.serviceId) === integrationKey
  );
}
var InternalExecutor = class {
  supportedTypes = ["api-call"];
  canHandle(operationType) {
    return this.supportedTypes.includes(operationType);
  }
  /**
   * Check if this executor should handle the request
   * (only for internal Symbia services)
   */
  shouldHandle(integrationKey) {
    return isInternalService(integrationKey);
  }
  async execute(request) {
    const { operation, integrationKey, params, context } = request;
    const integration = integrationRegistry.get(integrationKey);
    if (!integration) {
      throw new IntegrationError({
        message: `Integration not found: ${integrationKey}`,
        category: "not_found"
      });
    }
    if (!isInternalService(integrationKey)) {
      throw new IntegrationError({
        message: `Not an internal service: ${integrationKey}`,
        category: "validation"
      });
    }
    const baseUrl = integration.openapi?.serverUrl;
    if (!baseUrl) {
      throw new IntegrationError({
        message: `No server URL configured for ${integrationKey}`,
        category: "internal"
      });
    }
    const url = this.buildUrl(baseUrl, operation.path || "", params);
    const headers = this.buildHeaders(context, params);
    const method = operation.method || "GET";
    const body = this.buildBody(method, operation, params);
    console.log(`[internal-executor] ${method} ${url}`);
    const controller = new AbortController();
    const timeout = context.timeout || 3e4;
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : void 0,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const contentType = response.headers.get("content-type") || "";
      let responseBody;
      if (contentType.includes("application/json")) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();
      }
      const responseHeaders = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      const result = {
        type: "api-call",
        data: {
          statusCode: response.status,
          headers: responseHeaders,
          body: responseBody
        }
      };
      if (!response.ok) {
        console.error(`[internal-executor] Error ${response.status}:`, responseBody);
      }
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new IntegrationError({
          message: `Request timed out after ${timeout}ms`,
          category: "timeout"
        });
      }
      throw new IntegrationError({
        message: error instanceof Error ? error.message : "Request failed",
        category: "network",
        cause: error instanceof Error ? error : void 0
      });
    }
  }
  /**
   * Build the full URL with path parameters substituted
   */
  buildUrl(baseUrl, path, params) {
    const normalizedBase = baseUrl.replace(/\/$/, "");
    let url = `${normalizedBase}${path}`;
    const pathParamMatches = path.match(/\{(\w+)\}/g);
    if (pathParamMatches) {
      for (const match of pathParamMatches) {
        const paramName = match.slice(1, -1);
        if (params[paramName] !== void 0) {
          url = url.replace(match, encodeURIComponent(String(params[paramName])));
          delete params[paramName];
        }
      }
    }
    return url;
  }
  /**
   * Build request headers with authentication and org context
   */
  buildHeaders(context, params) {
    const headers = {
      "Content-Type": "application/json"
    };
    if (context.authToken) {
      headers["Authorization"] = `Bearer ${context.authToken}`;
    }
    if (context.orgId) {
      headers["X-Org-Id"] = context.orgId;
    }
    if (context.requestId) {
      headers["X-Request-Id"] = context.requestId;
    }
    return headers;
  }
  /**
   * Build request body from parameters
   */
  buildBody(method, operation, params) {
    if (method === "GET" || method === "HEAD") {
      return void 0;
    }
    if (method === "DELETE") {
      const body2 = {};
      for (const [key, value] of Object.entries(params)) {
        if (value !== void 0) {
          body2[key] = value;
        }
      }
      return Object.keys(body2).length > 0 ? body2 : void 0;
    }
    const body = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== void 0) {
        body[key] = value;
      }
    }
    return Object.keys(body).length > 0 ? body : void 0;
  }
};
var internalExecutor = new InternalExecutor();
var OpenAPIExecutor = class {
  supportedTypes = ["api-call"];
  canHandle(operationType) {
    return this.supportedTypes.includes(operationType);
  }
  async execute(request) {
    const { operation, integrationKey, params, context } = request;
    const integration = integrationRegistry.get(integrationKey);
    if (!integration) {
      throw new IntegrationError({
        message: `Integration not found: ${integrationKey}`,
        category: "not_found"
      });
    }
    const declaredAuth = integration.auth?.type || integration.metadata?.authType;
    let credential = null;
    if (declaredAuth !== "none") {
      credential = await getCredential(
        context.userId,
        context.orgId,
        integrationKey,
        context.authToken
      );
      if (!credential?.apiKey) {
        throw new IntegrationError({
          message: `No credentials configured for ${integrationKey}`,
          category: "auth"
        });
      }
    }
    const apiKey = credential?.apiKey ?? "";
    const baseUrl = this.getBaseUrl(integration, apiKey);
    const url = this.buildUrl(baseUrl, operation.path || "", params);
    const headers = await this.buildHeaders(integration, apiKey, params);
    const method = operation.method || "GET";
    const body = this.buildBody(method, operation, params);
    console.log(`[openapi-executor] ${method} ${url}`);
    const controller = new AbortController();
    const timeout = context.timeout || 3e4;
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : void 0,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const contentType = response.headers.get("content-type") || "";
      let responseBody;
      if (contentType.includes("application/json")) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();
      }
      const responseHeaders = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      const result = {
        type: "api-call",
        data: {
          statusCode: response.status,
          headers: responseHeaders,
          body: responseBody
        }
      };
      if (!response.ok) {
        console.error(`[openapi-executor] Error ${response.status}:`, responseBody);
      }
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new IntegrationError({
          message: `Request timed out after ${timeout}ms`,
          category: "timeout"
        });
      }
      throw new IntegrationError({
        message: error instanceof Error ? error.message : "Request failed",
        category: "network",
        cause: error instanceof Error ? error : void 0
      });
    }
  }
  /**
   * Get base URL, substituting token if needed (e.g., Telegram uses bot{token})
   */
  getBaseUrl(integration, apiKey) {
    let baseUrl = integration.openapi?.serverUrl || "";
    if (baseUrl.includes("{token}")) {
      baseUrl = baseUrl.replace("{token}", apiKey);
    }
    if (!baseUrl && integration.metadata?.serverUrl) {
      baseUrl = integration.metadata.serverUrl.replace("{token}", apiKey);
    }
    return baseUrl.replace(/\/$/, "");
  }
  /**
   * Build the full URL with path parameters substituted
   */
  buildUrl(baseUrl, path, params) {
    let url = `${baseUrl}${path}`;
    const pathParamMatches = path.match(/\{(\w+)\}/g);
    if (pathParamMatches) {
      for (const match of pathParamMatches) {
        const paramName = match.slice(1, -1);
        if (params[paramName] !== void 0) {
          url = url.replace(match, String(params[paramName]));
        }
      }
    }
    const queryParams = new URLSearchParams();
    return url;
  }
  /**
   * Build request headers with authentication
   */
  async buildHeaders(integration, apiKey, params) {
    return buildRequestHeaders(integration, apiKey);
  }
  /**
   * Build request body from parameters
   */
  buildBody(method, operation, params) {
    if (method === "GET" || method === "HEAD" || method === "DELETE") {
      return void 0;
    }
    const body = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== void 0) {
        body[key] = value;
      }
    }
    return Object.keys(body).length > 0 ? body : void 0;
  }
};
async function buildRequestHeaders(integration, apiKey) {
  {
    const headers = {
      "Content-Type": "application/json"
    };
    const authType = integration.auth?.type || integration.metadata?.authType;
    switch (authType) {
      case "bearer":
        headers["Authorization"] = `Bearer ${apiKey}`;
        break;
      case "header":
      case "apiKey":
        const headerName = integration.auth?.header || integration.metadata?.authHeader || "X-API-Key";
        headers[headerName] = apiKey;
        break;
      // OAUTH2 WAS DECLARED IN THE SCHEMA AND ABSENT HERE — measured 23 Aug 2026.
      //
      // `integrationAuthSchema` has offered `type: "oauth2"` with `tokenUrl`,
      // `scopes` and a `client_id:client_secret` credential since it was
      // written. This switch had no case for it, so an integration registered
      // that way fell through and every call went out anonymous. Registration
      // validated, execution silently sent nothing — a contract that accepts a
      // configuration it does not honour.
      //
      // Client credentials only. The authorization-code flow needs a redirect
      // and a user present, which is `oauth/oauth-service.ts`'s job, not an
      // executor's; a token obtained that way arrives here as a plain bearer.
      case "oauth2": {
        headers["Authorization"] = `Bearer ${await mintAppToken(integration, apiKey)}`;
        break;
      }
      case "path":
        break;
      case "none":
        break;
    }
    const statics = integration.metadata?.staticHeaders;
    if (statics && typeof statics === "object") {
      for (const [name, value] of Object.entries(statics)) {
        if (typeof value === "string" && value.length > 0) headers[name] = value;
      }
    }
    return headers;
  }
}
async function mintAppToken(integration, credential) {
  const key = integration.key;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 6e4) return cached.token;
  const tokenUrl = integration.auth?.tokenUrl;
  if (!tokenUrl) {
    throw new IntegrationError({
      message: `${key} declares auth.type oauth2 with no tokenUrl. The token endpoint is not discoverable from the spec and must be configured.`,
      category: "auth"
    });
  }
  const sep = credential.indexOf(":");
  if (sep < 1) {
    throw new IntegrationError({
      message: `${key} credential must be 'client_id:client_secret'. Received a value with no colon, so the client id cannot be separated from the secret.`,
      category: "auth"
    });
  }
  const clientId = credential.slice(0, sep);
  const clientSecret = credential.slice(sep + 1);
  const scopes = Array.isArray(integration.auth?.scopes) ? integration.auth.scopes.join(" ") : "";
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    ...scopes ? { scope: scopes } : {}
  });
  const r = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15e3)
  });
  const text3 = await r.text();
  if (!r.ok) {
    throw new IntegrationError({
      message: `${key} token request to ${tokenUrl} answered ${r.status}: ${text3.slice(0, 300)}`,
      category: "auth"
    });
  }
  const json3 = JSON.parse(text3);
  if (!json3.access_token) {
    throw new IntegrationError({
      message: `${key} token endpoint answered ${r.status} with no access_token. Body: ${text3.slice(0, 200)}`,
      category: "auth"
    });
  }
  tokenCache.set(key, {
    token: json3.access_token,
    // Default two hours when the provider omits expires_in. Twitch sends it;
    // the default exists so a provider that does not cannot cache forever.
    expiresAt: Date.now() + (json3.expires_in ?? 7200) * 1e3
  });
  return json3.access_token;
}
var tokenCache = /* @__PURE__ */ new Map();
var openapiExecutor = new OpenAPIExecutor();
var APICallExecutor = class {
  supportedTypes = ["api-call"];
  canHandle(operationType) {
    return this.supportedTypes.includes(operationType);
  }
  async execute(request) {
    if (isInternalService(request.integrationKey)) {
      return internalExecutor.execute(request);
    } else {
      return openapiExecutor.execute(request);
    }
  }
};
var apiCallExecutor = new APICallExecutor();
var executorRegistry = /* @__PURE__ */ new Map([
  ["llm", providerExecutor],
  ["embedding", providerExecutor],
  ["mcp-tool", mcpExecutor],
  ["mcp-resource", mcpExecutor],
  ["mcp-prompt", mcpExecutor],
  ["api-call", apiCallExecutor]
]);
async function executeOperation(request) {
  const opType = classifyOperation(request.operation);
  const executor = executorRegistry.get(opType);
  if (!executor) {
    throw new IntegrationError({
      message: `No executor registered for operation type: ${opType}`,
      category: "not_found"
    });
  }
  return executor.execute(request);
}
var MCP_ERROR = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603
};
var DEFAULT_CONFIG2 = {
  name: "symbia-integrations",
  version: "1.0.0",
  capabilities: {
    tools: true,
    resources: false,
    prompts: false
  }
};
var MCPServer = class {
  config;
  initialized = false;
  constructor(config2 = {}) {
    this.config = { ...DEFAULT_CONFIG2, ...config2 };
  }
  /**
   * Handle an incoming MCP request
   */
  async handleRequest(request, context) {
    try {
      const result = await this.dispatch(request.method, request.params, context);
      return {
        jsonrpc: "2.0",
        id: request.id,
        result
      };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: this.formatError(error)
      };
    }
  }
  /**
   * Dispatch request to appropriate handler
   */
  async dispatch(method, params, context) {
    switch (method) {
      case "initialize":
        return this.handleInitialize(params);
      case "initialized":
        return null;
      case "tools/list":
        return this.handleToolsList();
      case "tools/call":
        return this.handleToolsCall(params, context);
      case "resources/list":
        return this.handleResourcesList();
      case "resources/read":
        return this.handleResourcesRead(params);
      case "prompts/list":
        return this.handlePromptsList();
      case "prompts/get":
        return this.handlePromptsGet(params);
      case "ping":
        return {};
      default:
        throw { code: MCP_ERROR.METHOD_NOT_FOUND, message: `Unknown method: ${method}` };
    }
  }
  /**
   * Handle initialize request
   */
  handleInitialize(params) {
    this.initialized = true;
    const capabilities = {};
    if (this.config.capabilities.tools) {
      capabilities.tools = {};
    }
    if (this.config.capabilities.resources) {
      capabilities.resources = {};
    }
    if (this.config.capabilities.prompts) {
      capabilities.prompts = {};
    }
    return {
      protocolVersion: "2024-11-05",
      capabilities,
      serverInfo: {
        name: this.config.name,
        version: this.config.version
      }
    };
  }
  /**
   * List available tools (integrations exposed as MCP tools)
   */
  handleToolsList() {
    const tools = [];
    const integrations2 = integrationRegistry.getAll();
    for (const integration of integrations2) {
      for (const op of integration.operations || []) {
        if (op.method === "GET" && !op.tags?.includes("llm")) {
          continue;
        }
        tools.push(this.operationToMCPTool(integration.key, op));
      }
    }
    return { tools };
  }
  /**
   * Convert an IntegrationOperation to an MCP tool definition
   */
  operationToMCPTool(integrationKey, op) {
    const toolName = `${integrationKey}.${op.id}`.replace(/\./g, "_");
    const properties = {};
    const required = [];
    for (const param of op.parameters || []) {
      if (!param.name) continue;
      properties[param.name] = {
        type: param.schema?.type || "string",
        description: param.description
      };
      if (param.required) {
        required.push(param.name);
      }
    }
    if (op.requestBody?.schema) {
      const bodySchema = op.requestBody.schema;
      const bodyProps = bodySchema.properties;
      if (bodyProps) {
        for (const [key, value] of Object.entries(bodyProps)) {
          if (!properties[key]) {
            properties[key] = {
              type: value.type || "string",
              description: value.description
            };
          }
        }
      }
      const bodyRequired = bodySchema.required;
      if (bodyRequired) {
        for (const field of bodyRequired) {
          if (!required.includes(field)) {
            required.push(field);
          }
        }
      }
    }
    if (op.tags?.includes("llm") || op.tags?.includes("chat")) {
      if (!properties.model) {
        properties.model = { type: "string", description: "Model ID to use" };
        required.push("model");
      }
    }
    return {
      name: toolName,
      description: op.description || op.summary || `Execute ${integrationKey} ${op.id}`,
      inputSchema: {
        type: "object",
        properties,
        required: required.length > 0 ? required : void 0
      }
    };
  }
  /**
   * Handle tool call
   */
  async handleToolsCall(params, context) {
    const { name, arguments: args } = params;
    const parts = name.split("_");
    const integrationKey = parts[0];
    const operationId = parts.slice(1).join(".");
    const lookup2 = integrationRegistry.lookupOperation(`${integrationKey}.${operationId}`);
    if (!lookup2) {
      return {
        content: [{ type: "text", text: `Tool not found: ${name}` }],
        isError: true
      };
    }
    const execContext = {
      requestId: `mcp_${Date.now()}`,
      userId: context.userId || "mcp-client",
      orgId: context.orgId || "mcp-org",
      authToken: context.authToken || "",
      timeout: 6e4
    };
    try {
      const result = await executeOperation({
        operation: lookup2.operation,
        integrationKey,
        params: args || {},
        context: execContext
      });
      return this.formatToolResult(result);
    } catch (error) {
      const message = error instanceof IntegrationError ? error.message : error instanceof Error ? error.message : "Tool execution failed";
      return {
        content: [{ type: "text", text: message }],
        isError: true
      };
    }
  }
  /**
   * Format execution result as MCP content
   */
  formatToolResult(result) {
    const typed = result;
    switch (typed.type) {
      case "llm": {
        const llm = typed.data;
        return {
          content: [
            { type: "text", text: llm.content }
          ]
        };
      }
      case "embedding": {
        const emb = typed.data;
        return {
          content: [
            { type: "text", text: JSON.stringify({ embeddings: emb.embeddings }) }
          ]
        };
      }
      case "mcp-tool": {
        const mcp = typed.data;
        return { content: mcp.content };
      }
      case "moltbot-skill": {
        const skill = typed.data;
        return {
          content: [
            { type: "text", text: JSON.stringify(skill.result) }
          ]
        };
      }
      default:
        return {
          content: [
            { type: "text", text: JSON.stringify(typed.data) }
          ]
        };
    }
  }
  /**
   * List resources (not currently exposed)
   */
  handleResourcesList() {
    return { resources: [] };
  }
  /**
   * Read a resource
   */
  handleResourcesRead(_params) {
    throw { code: MCP_ERROR.METHOD_NOT_FOUND, message: "Resources not supported" };
  }
  /**
   * List prompts (not currently exposed)
   */
  handlePromptsList() {
    return { prompts: [] };
  }
  /**
   * Get a prompt
   */
  handlePromptsGet(_params) {
    throw { code: MCP_ERROR.METHOD_NOT_FOUND, message: "Prompts not supported" };
  }
  /**
   * Format error for MCP response
   */
  formatError(error) {
    if (error && typeof error === "object" && "code" in error && "message" in error) {
      return error;
    }
    if (error instanceof IntegrationError) {
      return {
        code: MCP_ERROR.INTERNAL_ERROR,
        message: error.message,
        data: { category: error.category, retryable: error.retryable }
      };
    }
    return {
      code: MCP_ERROR.INTERNAL_ERROR,
      message: error instanceof Error ? error.message : "Unknown error"
    };
  }
};
var mcpServer = new MCPServer();
function createMCPHttpHandler() {
  return async (req, res) => {
    try {
      const request = req.body;
      if (!request || !request.jsonrpc || !request.method) {
        res.status(400).json({
          jsonrpc: "2.0",
          id: null,
          error: { code: MCP_ERROR.INVALID_REQUEST, message: "Invalid request" }
        });
        return;
      }
      const user = req.user || {};
      const response = await mcpServer.handleRequest(request, {
        userId: user.id,
        orgId: user.orgId,
        authToken: req.token
      });
      res.json(response);
    } catch (error) {
      res.status(500).json({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: MCP_ERROR.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Internal error"
        }
      });
    }
  };
}
var BaseOAuthProvider = class {
  /**
   * Build the authorization URL with standard OAuth 2.0 parameters
   */
  buildAuthorizationUrl(params) {
    const url = new URL(this.config.authorizationUrl);
    url.searchParams.set("client_id", params.clientId);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("response_type", this.config.responseType);
    url.searchParams.set("state", params.state);
    url.searchParams.set("scope", params.scopes.join(this.config.scopeDelimiter));
    if (params.codeChallenge) {
      url.searchParams.set("code_challenge", params.codeChallenge);
      url.searchParams.set("code_challenge_method", params.codeChallengeMethod || "S256");
    }
    return url.toString();
  }
  /**
   * Exchange authorization code for tokens using standard OAuth 2.0 token endpoint
   */
  async exchangeCode(params) {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri
    });
    if (params.codeVerifier) {
      body.set("code_verifier", params.codeVerifier);
    }
    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: body.toString()
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new OAuthError(
        `Token exchange failed: ${response.status} ${response.statusText}`,
        "token_exchange_failed",
        errorText
      );
    }
    const data = await response.json();
    return this.normalizeTokenResponse(data);
  }
  /**
   * Refresh access token using standard OAuth 2.0 refresh flow
   */
  async refreshToken(params) {
    if (!this.config.supportsRefresh) {
      throw new OAuthError(
        "This provider does not support token refresh",
        "refresh_not_supported"
      );
    }
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
      client_id: params.clientId,
      client_secret: params.clientSecret
    });
    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: body.toString()
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new OAuthError(
        `Token refresh failed: ${response.status} ${response.statusText}`,
        "token_refresh_failed",
        errorText
      );
    }
    const data = await response.json();
    return this.normalizeTokenResponse(data);
  }
  /**
   * Get user info - must be implemented by subclasses if userinfoUrl is set
   */
  async getUserInfo(accessToken) {
    if (!this.config.userinfoUrl) {
      throw new OAuthError(
        "This provider does not support user info endpoint",
        "userinfo_not_supported"
      );
    }
    const response = await fetch(this.config.userinfoUrl, {
      headers: this.userInfoHeaders(accessToken)
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new OAuthError(
        `User info request failed: ${response.status} ${response.statusText}`,
        "userinfo_failed",
        errorText
      );
    }
    const data = await response.json();
    return this.normalizeUserInfo(data);
  }
  /**
   * Headers for the userinfo request. Override when a provider needs more than
   * a bearer token.
   *
   * Twitch's Helix refuses every call without a `Client-Id` header, including
   * this one, and answers 401 with a message about the token rather than the
   * missing header — so the failure reads as a bad login and sends whoever is
   * debugging it to re-authorise a token that was fine.
   */
  userInfoHeaders(accessToken) {
    return {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json"
    };
  }
  /**
   * Revoke a token - default implementation using RFC 7009
   */
  async revokeToken(params) {
    if (!this.config.revokeUrl) {
      throw new OAuthError(
        "This provider does not support token revocation",
        "revoke_not_supported"
      );
    }
    const body = new URLSearchParams({
      token: params.token,
      client_id: params.clientId,
      client_secret: params.clientSecret
    });
    if (params.tokenTypeHint) {
      body.set("token_type_hint", params.tokenTypeHint);
    }
    const response = await fetch(this.config.revokeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });
    if (!response.ok && response.status !== 200) {
      const errorText = await response.text();
      throw new OAuthError(
        `Token revocation failed: ${response.status} ${response.statusText}`,
        "revoke_failed",
        errorText
      );
    }
  }
  /**
   * Normalize token response from provider-specific format to standard format
   * Override in subclasses if provider uses non-standard response format
   */
  normalizeTokenResponse(data) {
    return {
      accessToken: String(data.access_token || data.accessToken || ""),
      refreshToken: data.refresh_token || data.refreshToken ? String(data.refresh_token || data.refreshToken) : void 0,
      expiresIn: typeof data.expires_in === "number" ? data.expires_in : typeof data.expiresIn === "number" ? data.expiresIn : this.config.tokenExpiresIn,
      tokenType: String(data.token_type || data.tokenType || "Bearer"),
      scope: data.scope ? String(data.scope) : void 0
    };
  }
  /**
   * Normalize user info response from provider-specific format
   * Override in subclasses for provider-specific user info formats
   */
  normalizeUserInfo(data) {
    return {
      id: String(data.id || data.sub || data.user_id || ""),
      email: data.email ? String(data.email) : void 0,
      name: data.name ? String(data.name) : void 0,
      username: data.username || data.login ? String(data.username || data.login) : void 0,
      avatarUrl: data.avatar_url || data.picture ? String(data.avatar_url || data.picture) : void 0
    };
  }
};
var OAuthError = class extends Error {
  constructor(message, code, details) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "OAuthError";
  }
};
var replitConfig = {
  provider: "replit",
  displayName: "Replit",
  description: "Authenticate with your Replit account",
  // OAuth endpoints
  // Note: These are standard OAuth 2.0 endpoints. Replit may use different URLs.
  // Update these based on Replit's OAuth documentation.
  authorizationUrl: "https://replit.com/oauth2/authorize",
  tokenUrl: "https://replit.com/oauth2/token",
  userinfoUrl: "https://replit.com/api/v1/users/current",
  revokeUrl: "https://replit.com/oauth2/revoke",
  // OAuth settings
  defaultScopes: ["identity"],
  // Basic identity scope for authentication
  scopeDelimiter: " ",
  responseType: "code",
  grantType: "authorization_code",
  pkceRequired: false,
  // Token settings
  supportsRefresh: true,
  tokenExpiresIn: 3600
  // 1 hour default if not specified in response
};
var ReplitOAuthProvider = class extends BaseOAuthProvider {
  config = replitConfig;
  /**
   * Normalize Replit's user info response
   *
   * Replit's user object structure (may vary):
   * {
   *   id: number,
   *   username: string,
   *   email?: string,
   *   firstName?: string,
   *   lastName?: string,
   *   profileImage?: string,
   *   ...
   * }
   */
  normalizeUserInfo(data) {
    const id = data.id ? String(data.id) : "";
    const username = data.username ? String(data.username) : void 0;
    const email = data.email ? String(data.email) : void 0;
    let name;
    if (data.firstName || data.lastName) {
      const parts = [data.firstName, data.lastName].filter(Boolean);
      name = parts.join(" ");
    } else if (data.name) {
      name = String(data.name);
    } else if (username) {
      name = username;
    }
    let avatarUrl;
    if (data.profileImage) {
      avatarUrl = String(data.profileImage);
    } else if (data.avatar_url) {
      avatarUrl = String(data.avatar_url);
    } else if (data.image) {
      avatarUrl = String(data.image);
    }
    return {
      id,
      email,
      name,
      username,
      avatarUrl
    };
  }
  /**
   * Get Replit user info with custom handling
   */
  async getUserInfo(accessToken) {
    if (!this.config.userinfoUrl) {
      throw new OAuthError(
        "Replit user info URL not configured",
        "userinfo_not_configured"
      );
    }
    const response = await fetch(this.config.userinfoUrl, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json",
        "User-Agent": "Symbia-Stack/1.0"
      }
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new OAuthError(
        `Replit user info request failed: ${response.status} ${response.statusText}`,
        "userinfo_failed",
        errorText
      );
    }
    const data = await response.json();
    return this.normalizeUserInfo(data);
  }
};
var replitProvider = new ReplitOAuthProvider();
var TWITCH_SCOPES = [
  "channel:manage:broadcast",
  "channel:read:stream_key",
  "user:read:chat",
  "user:write:chat"
];
var twitchConfig = {
  provider: "twitch",
  displayName: "Twitch",
  description: "Connect your Twitch channel for chat and broadcast control",
  authorizationUrl: "https://id.twitch.tv/oauth2/authorize",
  tokenUrl: "https://id.twitch.tv/oauth2/token",
  // Helix /users with no query returns the token's own user, which is exactly
  // the question worth asking after an authorisation: who did this authorise?
  userinfoUrl: "https://api.twitch.tv/helix/users",
  revokeUrl: "https://id.twitch.tv/oauth2/revoke",
  defaultScopes: TWITCH_SCOPES,
  scopeDelimiter: " ",
  responseType: "code",
  grantType: "authorization_code",
  pkceRequired: false,
  supportsRefresh: true,
  // Observed 24 Aug: Twitch returned expires_in between 13862s and 14523s for
  // a user token — roughly four hours, and it varies. This is the fallback for
  // a response that omits it, never a substitute for the value Twitch sends.
  tokenExpiresIn: 14400
};
var TwitchOAuthProvider = class extends BaseOAuthProvider {
  config = twitchConfig;
  /**
   * Helix requires Client-Id alongside the bearer token on every call,
   * including userinfo. Without it Twitch answers 401 with a message about the
   * token rather than the missing header, which reads as a bad login.
   */
  userInfoHeaders(accessToken) {
    const clientId = process.env.TWITCH_CLIENT_ID;
    if (!clientId) {
      throw new OAuthError(
        "TWITCH_CLIENT_ID is not set; Helix refuses any call without a Client-Id header",
        "missing_client_id"
      );
    }
    return {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId
    };
  }
  /**
   * Helix wraps everything in `{ data: [ ... ] }`. An empty array means the
   * token resolves to no user, which is a different failure from a malformed
   * response and worth saying so.
   */
  normalizeUserInfo(data) {
    const rows = Array.isArray(data.data) ? data.data : [];
    const u = rows[0];
    if (!u) {
      throw new OAuthError(
        "Twitch accepted the token and returned no user for it",
        "no_user"
      );
    }
    return {
      id: String(u.id ?? ""),
      // `login` is the channel name in a URL; `display_name` is what a viewer
      // sees. The caller needs the first to compare against a channel.
      username: u.login ? String(u.login) : void 0,
      name: u.display_name ? String(u.display_name) : u.login ? String(u.login) : void 0,
      email: u.email ? String(u.email) : void 0,
      avatarUrl: u.profile_image_url ? String(u.profile_image_url) : void 0
    };
  }
};
var twitchProvider2 = new TwitchOAuthProvider();
var providerRegistry2 = /* @__PURE__ */ new Map();
function registerOAuthProvider(provider) {
  const name = provider.config.provider.toLowerCase();
  if (providerRegistry2.has(name)) {
    console.warn(`[oauth] Provider "${name}" is being re-registered`);
  }
  providerRegistry2.set(name, provider);
}
function getOAuthProvider(name) {
  return providerRegistry2.get(name.toLowerCase());
}
function getOAuthProviderNames() {
  return Array.from(providerRegistry2.keys());
}
function initializeOAuthProviders() {
  registerOAuthProvider(replitProvider);
  registerOAuthProvider(twitchProvider2);
  console.log(`[oauth] Registered providers: ${getOAuthProviderNames().join(", ")}`);
}
var IDENTITY_SERVICE_URL4 = resolveServiceUrl(ServiceId.IDENTITY);
var STATE_TTL_MS = 10 * 60 * 1e3;
var OAuthService = class {
  storage;
  constructor(storage) {
    this.storage = storage;
  }
  /**
   * Generate authorization URL for initiating OAuth flow
   */
  async authorize(request, userId, orgId) {
    const provider = getOAuthProvider(request.provider);
    if (!provider) {
      throw new OAuthError(
        `Unknown OAuth provider: ${request.provider}`,
        "unknown_provider"
      );
    }
    const providerConfig = await this.storage.getProviderConfig(request.provider);
    if (!providerConfig) {
      throw new OAuthError(
        `OAuth provider "${request.provider}" is not configured`,
        "provider_not_configured"
      );
    }
    if (!providerConfig.isEnabled) {
      throw new OAuthError(
        `OAuth provider "${request.provider}" is disabled`,
        "provider_disabled"
      );
    }
    const state = crypto.randomBytes(32).toString("hex");
    const callbackUrl = this.getCallbackUrl();
    const redirectUri = request.redirectUri || callbackUrl;
    const scopes = request.scopes?.length ? request.scopes : provider.config.defaultScopes;
    let pkceVerifier;
    let pkceChallenge;
    if (provider.config.pkceRequired) {
      pkceVerifier = crypto.randomBytes(32).toString("base64url");
      pkceChallenge = crypto.createHash("sha256").update(pkceVerifier).digest("base64url");
    }
    const expiresAt = new Date(Date.now() + STATE_TTL_MS);
    await this.storage.createOAuthState({
      state,
      userId,
      orgId: orgId || void 0,
      provider: request.provider,
      redirectUri,
      scopes,
      pkceVerifier,
      pkceChallenge,
      clientState: request.state,
      expiresAt
    });
    const authorizationUrl = provider.buildAuthorizationUrl({
      clientId: providerConfig.clientId,
      redirectUri: callbackUrl,
      // Always use our callback URL
      state,
      scopes,
      codeChallenge: pkceChallenge,
      codeChallengeMethod: pkceChallenge ? "S256" : void 0
    });
    return {
      authorizationUrl,
      state,
      provider: request.provider
    };
  }
  /**
   * Handle OAuth callback - validate state, exchange code, store tokens
   */
  async handleCallback(code, state) {
    const oauthState = await this.storage.getOAuthState(state);
    if (!oauthState) {
      throw new OAuthError(
        "Invalid or expired OAuth state",
        "invalid_state"
      );
    }
    if (new Date(oauthState.expiresAt) < /* @__PURE__ */ new Date()) {
      await this.storage.deleteOAuthState(state);
      throw new OAuthError(
        "OAuth state has expired",
        "state_expired"
      );
    }
    const provider = getOAuthProvider(oauthState.provider);
    if (!provider) {
      throw new OAuthError(
        `Unknown OAuth provider: ${oauthState.provider}`,
        "unknown_provider"
      );
    }
    const providerConfig = await this.storage.getProviderConfig(oauthState.provider);
    if (!providerConfig) {
      throw new OAuthError(
        `OAuth provider not configured: ${oauthState.provider}`,
        "provider_not_configured"
      );
    }
    const callbackUrl = this.getCallbackUrl();
    const tokens = await provider.exchangeCode({
      code,
      clientId: providerConfig.clientId,
      clientSecret: providerConfig.clientSecret,
      redirectUri: callbackUrl,
      codeVerifier: oauthState.pkceVerifier || void 0
    });
    let userInfo = null;
    if (provider.getUserInfo) {
      try {
        userInfo = await provider.getUserInfo(tokens.accessToken);
      } catch (error) {
        console.warn(`[oauth] Failed to get user info from ${oauthState.provider}:`, error);
      }
    }
    const expiresAt = tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1e3) : void 0;
    const credentialId = await this.storeTokenInIdentity(
      oauthState.userId,
      oauthState.orgId || null,
      oauthState.provider,
      tokens.accessToken,
      tokens.refreshToken,
      expiresAt,
      userInfo
    );
    await this.provisionChannelCredential(
      oauthState.provider,
      oauthState.userId,
      oauthState.orgId || null,
      providerConfig.clientId,
      tokens.accessToken,
      tokens.refreshToken,
      expiresAt
    );
    const connection = await this.storage.createOAuthConnection({
      userId: oauthState.userId,
      orgId: oauthState.orgId,
      provider: oauthState.provider,
      oauthUserId: userInfo?.id,
      oauthUserEmail: userInfo?.email,
      oauthUserName: userInfo?.name || userInfo?.username,
      oauthAvatarUrl: userInfo?.avatarUrl,
      credentialId,
      scopes: oauthState.scopes || [],
      status: "active",
      expiresAt,
      connectedAt: /* @__PURE__ */ new Date()
    });
    await this.storage.deleteOAuthState(state);
    const connectionResponse = {
      id: connection.id,
      provider: connection.provider,
      displayName: providerConfig.displayName,
      connectedAt: connection.connectedAt.toISOString(),
      expiresAt: connection.expiresAt?.toISOString(),
      scopes: connection.scopes || [],
      status: connection.status,
      oauthUserId: connection.oauthUserId || void 0,
      oauthUserEmail: connection.oauthUserEmail || void 0,
      oauthUserName: connection.oauthUserName || void 0
    };
    return {
      connection: connectionResponse,
      redirectUri: oauthState.redirectUri,
      clientState: oauthState.clientState || void 0
    };
  }
  /**
   * Get list of OAuth connections for a user
   */
  async getConnections(userId, orgId) {
    const connections = await this.storage.getOAuthConnections(userId, orgId);
    return Promise.all(
      connections.map(async (conn) => {
        const providerConfig = await this.storage.getProviderConfig(conn.provider);
        return {
          id: conn.id,
          provider: conn.provider,
          displayName: providerConfig?.displayName || conn.provider,
          connectedAt: conn.connectedAt.toISOString(),
          expiresAt: conn.expiresAt?.toISOString(),
          scopes: conn.scopes || [],
          status: conn.status,
          oauthUserId: conn.oauthUserId || void 0,
          oauthUserEmail: conn.oauthUserEmail || void 0,
          oauthUserName: conn.oauthUserName || void 0
        };
      })
    );
  }
  /**
   * Revoke an OAuth connection
   */
  async revokeConnection(connectionId, userId) {
    const connection = await this.storage.getOAuthConnectionById(connectionId);
    if (!connection) {
      throw new OAuthError(
        "Connection not found",
        "connection_not_found"
      );
    }
    if (connection.userId !== userId) {
      throw new OAuthError(
        "Not authorized to revoke this connection",
        "not_authorized"
      );
    }
    const provider = getOAuthProvider(connection.provider);
    const providerConfig = await this.storage.getProviderConfig(connection.provider);
    if (provider?.revokeToken && providerConfig && connection.credentialId) {
      try {
        const credential = await this.getCredentialFromIdentity(connection.credentialId);
        if (credential?.apiKey) {
          await provider.revokeToken({
            token: credential.apiKey,
            clientId: providerConfig.clientId,
            clientSecret: providerConfig.clientSecret
          });
        }
      } catch (error) {
        console.warn(`[oauth] Failed to revoke token at provider:`, error);
      }
    }
    if (connection.credentialId) {
      await this.deleteCredentialFromIdentity(connection.credentialId, userId);
    }
    await this.storage.updateOAuthConnection(connectionId, {
      status: "revoked",
      revokedAt: /* @__PURE__ */ new Date()
    });
  }
  /**
   * Get available OAuth providers
   */
  async getAvailableProviders(userId) {
    const configs = await this.storage.getAllProviderConfigs();
    const connections = await this.storage.getOAuthConnections(userId, null);
    return configs.filter((config2) => config2.isEnabled).map((config2) => {
      const connection = connections.find(
        (c) => c.provider === config2.provider && c.status === "active"
      );
      return {
        provider: config2.provider,
        displayName: config2.displayName,
        description: config2.description || void 0,
        iconUrl: config2.iconUrl || void 0,
        connected: !!connection,
        connectionId: connection?.id
      };
    });
  }
  /**
   * Get callback URL for OAuth redirects
   */
  getCallbackUrl() {
    const baseUrl = process.env.OAUTH_CALLBACK_BASE_URL || process.env.INTEGRATIONS_SERVICE_URL || `http://localhost:${process.env.PORT || 5007}`;
    return `${baseUrl}/api/oauth/callback`;
  }
  /**
   * Store OAuth token in Identity service
   */
  /**
   * Some OAuth providers have a matching CHANNEL provider that reads a
   * differently-shaped credential under a different key. Where one exists,
   * provision it as part of connecting, so the flow delivers the capability the
   * user asked for rather than just a token.
   *
   * Keyed by OAuth provider name. A provider absent from this map simply has no
   * channel side, which is not a failure.
   */
  async provisionChannelCredential(provider, userId, orgId, clientId, accessToken, refreshToken, expiresAt) {
    const CHANNEL_CREDENTIALS = {
      twitch: {
        key: "twitch:chat",
        // The channel provider splits on the FIRST colon, so a client id
        // containing one would still parse correctly.
        compose: (id, tok) => `${id}:${tok}`
      }
    };
    const spec = CHANNEL_CREDENTIALS[provider.toLowerCase()];
    if (!spec) return;
    try {
      const response = await fetch(`${IDENTITY_SERVICE_URL4}/api/internal/credentials/oauth`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Service-Id": "integrations" },
        body: JSON.stringify({
          userId,
          orgId,
          provider: spec.key,
          accessToken: spec.compose(clientId, accessToken),
          refreshToken,
          expiresAt: expiresAt?.toISOString(),
          isOrgWide: true
        })
      });
      if (!response.ok) {
        console.error(
          `[oauth] connected ${provider} but could not provision ${spec.key} (${response.status}); chat will not connect until this is resolved`
        );
        return;
      }
      console.log(`[oauth] provisioned channel credential ${spec.key} for ${provider}`);
    } catch (error) {
      console.error(`[oauth] channel credential provisioning failed for ${provider}:`, error);
    }
  }
  async storeTokenInIdentity(userId, orgId, provider, accessToken, refreshToken, expiresAt, userInfo) {
    const url = `${IDENTITY_SERVICE_URL4}/api/internal/credentials/oauth`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Id": "integrations"
      },
      body: JSON.stringify({
        userId,
        orgId,
        provider,
        accessToken,
        refreshToken,
        expiresAt: expiresAt?.toISOString(),
        oauthUserId: userInfo?.id,
        oauthUserEmail: userInfo?.email,
        oauthUserName: userInfo?.name || userInfo?.username
      })
    });
    if (!response.ok) {
      const error = await response.text();
      throw new OAuthError(
        `Failed to store OAuth token: ${response.statusText}`,
        "token_storage_failed",
        error
      );
    }
    const result = await response.json();
    return result.credentialId;
  }
  /**
   * Get credential from Identity service by ID
   */
  async getCredentialFromIdentity(credentialId) {
    const url = `${IDENTITY_SERVICE_URL4}/api/internal/credentials/by-id/${credentialId}`;
    const response = await fetch(url, {
      headers: {
        "X-Service-Id": "integrations"
      }
    });
    if (!response.ok) {
      return null;
    }
    return response.json();
  }
  /**
   * Delete credential from Identity service
   */
  async deleteCredentialFromIdentity(credentialId, userId) {
    const url = `${IDENTITY_SERVICE_URL4}/api/internal/credentials/${credentialId}`;
    await fetch(url, {
      method: "DELETE",
      headers: {
        "X-Service-Id": "integrations",
        "X-User-Id": userId
      }
    });
  }
};
init_schema();
var ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.JWT_SECRET || process.env.SESSION_SECRET || "dev-encryption-key-change-in-production";
function decrypt(encryptedText) {
  const [ivHex, authTagHex, encrypted] = encryptedText.split(":");
  const key = crypto2.createHash("sha256").update(ENCRYPTION_KEY).digest();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto2.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
function createOAuthStorage(db2) {
  return {
    // =======================================================================
    // Provider Configs
    // =======================================================================
    async getProviderConfig(provider) {
      const results = await db2.select().from(oauthProviderConfigs).where(eq(oauthProviderConfigs.provider, provider)).limit(1);
      if (results.length === 0) {
        return getEnvProviderConfig(provider);
      }
      const config2 = results[0];
      return {
        provider: config2.provider,
        clientId: config2.clientId,
        clientSecret: decrypt(config2.clientSecretEncrypted),
        displayName: config2.displayName,
        description: config2.description || void 0,
        iconUrl: config2.iconUrl || void 0,
        isEnabled: config2.isEnabled
      };
    },
    async getAllProviderConfigs() {
      const results = await db2.select().from(oauthProviderConfigs).where(eq(oauthProviderConfigs.isEnabled, true));
      const dbConfigs = results.map((config2) => ({
        provider: config2.provider,
        clientId: config2.clientId,
        clientSecret: decrypt(config2.clientSecretEncrypted),
        displayName: config2.displayName,
        description: config2.description || void 0,
        iconUrl: config2.iconUrl || void 0,
        isEnabled: config2.isEnabled
      }));
      const envConfigs = getEnvProviderConfigs();
      const configMap = /* @__PURE__ */ new Map();
      for (const config2 of envConfigs) {
        configMap.set(config2.provider, config2);
      }
      for (const config2 of dbConfigs) {
        configMap.set(config2.provider, config2);
      }
      return Array.from(configMap.values());
    },
    // =======================================================================
    // OAuth States
    // =======================================================================
    async createOAuthState(state) {
      const results = await db2.insert(oauthStates).values({
        ...state,
        scopes: state.scopes || []
      }).returning();
      return results[0];
    },
    async getOAuthState(state) {
      const results = await db2.select().from(oauthStates).where(eq(oauthStates.state, state)).limit(1);
      return results.length > 0 ? results[0] : null;
    },
    async deleteOAuthState(state) {
      await db2.delete(oauthStates).where(eq(oauthStates.state, state));
    },
    // =======================================================================
    // OAuth Connections
    // =======================================================================
    async createOAuthConnection(connection) {
      const results = await db2.insert(oauthConnections).values({
        ...connection,
        scopes: connection.scopes || []
      }).returning();
      return results[0];
    },
    async getOAuthConnectionById(id) {
      const results = await db2.select().from(oauthConnections).where(eq(oauthConnections.id, id)).limit(1);
      return results.length > 0 ? results[0] : null;
    },
    async getOAuthConnections(userId, orgId) {
      const conditions = [eq(oauthConnections.userId, userId)];
      if (orgId) {
        conditions.push(eq(oauthConnections.orgId, orgId));
      }
      const results = await db2.select().from(oauthConnections).where(and(...conditions)).orderBy(desc(oauthConnections.connectedAt));
      return results;
    },
    async updateOAuthConnection(id, update) {
      await db2.update(oauthConnections).set({
        ...update,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(oauthConnections.id, id));
    }
  };
}
function getEnvProviderConfig(provider) {
  const upperProvider = provider.toUpperCase();
  const clientId = process.env[`OAUTH_${upperProvider}_CLIENT_ID`] || process.env[`${upperProvider}_CLIENT_ID`];
  const clientSecret = process.env[`OAUTH_${upperProvider}_CLIENT_SECRET`] || process.env[`${upperProvider}_CLIENT_SECRET`];
  if (!clientId || !clientSecret) {
    return null;
  }
  const displayNames = {
    replit: "Replit",
    github: "GitHub",
    google: "Google",
    microsoft: "Microsoft",
    twitch: "Twitch"
  };
  return {
    provider,
    clientId,
    clientSecret,
    displayName: displayNames[provider.toLowerCase()] || provider,
    isEnabled: true
  };
}
function getEnvProviderConfigs() {
  const configs = [];
  const knownProviders = ["replit", "github", "google", "microsoft"];
  for (const provider of knownProviders) {
    const config2 = getEnvProviderConfig(provider);
    if (config2) {
      configs.push(config2);
    }
  }
  return configs.filter((c) => c !== null);
}
init_schema();
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
var docsDir = process.env.NODE_ENV === "production" ? join(process.cwd(), "docs") : join(__dirname, "../..", "docs");
function getParam3(params, key) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value ?? "";
}
function isKeylessProvider(provider) {
  return provider === "symbia-labs";
}
async function registerRoutes(httpServer, app) {
  initializeProviders();
  app.use(securityHeadersMiddleware);
  app.use(bodySizeLimitMiddleware);
  app.use(observabilityMiddleware({
    excludePaths: ["/health", "/health/live", "/health/ready", "/favicon.ico"],
    excludePatterns: [/^\/api\/integrations\/mcp/],
    // MCP has its own observability
    slowRequestThresholdMs: 5e3,
    traceIdHeader: "x-trace-id"
  }));
  app.post("/api/integrations/download", authMiddleware, rateLimitMiddleware, async (req, res) => {
    const user = req.user;
    const token = req.token;
    const downloadSchema = external_exports.object({
      provider: external_exports.literal("huggingface"),
      repo: external_exports.string().regex(/^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/),
      file: external_exports.string().regex(/^[A-Za-z0-9][\w.-]*\.gguf$/),
      revision: external_exports.string().regex(/^[\w.-]+$/).default("main")
    });
    const parsed = downloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: "provider (huggingface), repo, and a plain .gguf file name required" });
    }
    const { repo, file, revision } = parsed.data;
    const url = `https://huggingface.co/${repo}/resolve/${revision}/${file}`;
    try {
      let apiKey;
      try {
        const credential = await getCredential(user.id, user.orgId, "huggingface", token);
        apiKey = credential?.apiKey;
      } catch {
        apiKey = void 0;
      }
      const upstream = await safeFetch(url, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : void 0
      });
      if (!upstream.ok || !upstream.body) {
        return res.status(502).json({ success: false, error: `upstream returned ${upstream.status}` });
      }
      res.status(200);
      res.setHeader("Content-Type", "application/octet-stream");
      const len = upstream.headers.get("content-length");
      if (len) res.setHeader("Content-Length", len);
      res.setHeader("X-Source-Url", upstream.url || url);
      const { Readable } = await import("node:stream");
      const { pipeline } = await import("node:stream/promises");
      await pipeline(Readable.fromWeb(upstream.body), res);
      return;
    } catch (error) {
      if (error instanceof EgressError) {
        return res.status(403).json({ success: false, error: `egress refused: ${error.message}` });
      }
      if (!res.headersSent) {
        return res.status(500).json({ success: false, error: error instanceof Error ? error.message : "download failed" });
      }
      res.destroy(error instanceof Error ? error : new Error("download failed"));
      return;
    }
  });
  app.post("/api/integrations/execute", authMiddleware, rateLimitMiddleware, async (req, res) => {
    const startTime = Date.now();
    const requestId = `req_${randomUUID3().slice(0, 12)}`;
    const user = req.user;
    const token = req.token;
    try {
      const parseResult = executeRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        const validationError = new IntegrationError({
          message: `Invalid request: ${parseResult.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
          category: "validation"
        });
        res.status(validationError.statusCode).json({
          ...validationError.toResponse(),
          requestId,
          durationMs: Date.now() - startTime
        });
        return;
      }
      const request = parseResult.data;
      const { provider, operation, params } = request;
      const spend = await checkSpendCap(user?.orgId);
      if (!spend.allowed) {
        res.status(429).json({
          error: "Spend cap reached for this organisation",
          category: "quota",
          retryable: true,
          // The numbers, so the answer is diagnosable without database access,
          // and labelled as modelled rather than billed.
          spentMicros: spend.spentMicros,
          capMicros: spend.capMicros,
          windowHours: spend.windowHours,
          // Which ceiling refused this — the tenant's plan or the stack's
          // configured floor. Without it a support conversation starts by
          // guessing where the number came from.
          capSource: spend.capSource,
          basis: "estimated from the local price table, not the provider's billing",
          requestId,
          durationMs: Date.now() - startTime
        });
        return;
      }
      const adapter = getProvider(provider);
      if (!adapter) {
        const notFoundError = new IntegrationError({
          message: `Unknown provider: ${provider}. Available: ${getRegisteredProviders().join(", ")}`,
          category: "not_found",
          provider,
          retryable: false
        });
        res.status(notFoundError.statusCode).json({
          ...notFoundError.toResponse(),
          requestId,
          durationMs: Date.now() - startTime
        });
        return;
      }
      const validation = adapter.validateParams(operation, params);
      if (!validation.valid) {
        const validationError = new IntegrationError({
          message: `Invalid params: ${validation.errors?.join(", ")}`,
          category: "validation",
          provider,
          operation,
          retryable: false
        });
        res.status(validationError.statusCode).json({
          ...validationError.toResponse(),
          requestId,
          durationMs: Date.now() - startTime
        });
        return;
      }
      const isLocalProvider = isKeylessProvider(provider);
      const credential = isLocalProvider ? null : await getCredential(user.id, user.orgId, provider, token);
      if (!isLocalProvider && !credential) {
        const authError = new IntegrationError({
          message: `No ${provider} API key configured. Add your API key in Settings.`,
          category: "auth",
          provider,
          operation,
          retryable: false
        });
        res.status(authError.statusCode).json({
          ...authError.toResponse(),
          requestId,
          durationMs: Date.now() - startTime
        });
        return;
      }
      const circuitCheck = circuitBreaker.canRequest(provider);
      if (!circuitCheck.allowed) {
        const circuitError = new IntegrationError({
          message: circuitCheck.reason || `Provider ${provider} is temporarily unavailable`,
          category: "provider",
          provider,
          operation,
          retryable: true
          // Will be retryable after circuit resets
        });
        res.status(503).json({
          ...circuitError.toResponse(),
          requestId,
          durationMs: Date.now() - startTime
        });
        return;
      }
      let data;
      try {
        const executeOptions = {
          operation,
          model: params.model,
          params,
          apiKey: credential?.apiKey || "",
          timeout: 6e4
          // 60 second timeout
        };
        const executeWithObservability = async () => {
          if (operation === "embeddings" && adapter.embed) {
            return await adapter.embed(executeOptions);
          } else {
            return await adapter.execute(executeOptions);
          }
        };
        data = await withProviderObservability(
          provider,
          operation,
          requestId,
          executeWithObservability
        );
        const durationMs = Date.now() - startTime;
        recordProviderRequest(provider, operation, durationMs, true, data.usage);
        circuitBreaker.recordSuccess(provider);
      } catch (execError) {
        const durationMs = Date.now() - startTime;
        recordProviderRequest(provider, operation, durationMs, false);
        const classified = classifyProviderError(execError, provider, operation);
        const terminal = classified.category === "quota" || classified.category === "auth";
        if (terminal) {
          circuitBreaker.recordTerminalFailure(provider, classified.message.slice(0, 160));
        } else {
          circuitBreaker.recordFailure(provider);
        }
        await logExecution({
          userId: user.id,
          orgId: user.orgId,
          provider,
          operation,
          model: params.model,
          requestId,
          startedAt: new Date(startTime),
          completedAt: /* @__PURE__ */ new Date(),
          durationMs: Date.now() - startTime,
          success: false,
          errorMessage: classified.message,
          metadata: {
            errorCategory: classified.category,
            retryable: classified.retryable,
            upstream: classified.upstream
          }
        });
        const response2 = {
          success: false,
          error: classified.message,
          requestId,
          durationMs: Date.now() - startTime,
          // Extended error info for callers (especially assistants graph engine)
          errorCategory: classified.category,
          retryable: classified.retryable
        };
        res.status(classified.statusCode).json(response2);
        return;
      }
      const isEmbeddingResponse = operation === "embeddings";
      await logExecution({
        userId: user.id,
        orgId: user.orgId,
        provider,
        operation,
        model: data.model,
        requestId,
        startedAt: new Date(startTime),
        completedAt: /* @__PURE__ */ new Date(),
        durationMs: Date.now() - startTime,
        success: true,
        promptTokens: data.usage.promptTokens,
        completionTokens: isEmbeddingResponse ? 0 : data.usage.completionTokens,
        totalTokens: data.usage.totalTokens
      });
      const response = {
        success: true,
        data,
        requestId,
        durationMs: Date.now() - startTime
      };
      res.json(response);
    } catch (error) {
      console.error("[integrations] Unexpected error:", error);
      const internalError = error instanceof IntegrationError ? error : new IntegrationError({
        message: "Internal server error",
        category: "internal",
        cause: error instanceof Error ? error : void 0
      });
      res.status(internalError.statusCode).json({
        ...internalError.toResponse(),
        requestId,
        durationMs: Date.now() - startTime
      });
    }
  });
  app.get("/api/integrations/providers", async (req, res) => {
    const configs = getAllProviderConfigs();
    res.json({
      providers: configs.map((c) => ({
        name: c.provider,
        baseUrl: c.baseUrl,
        defaultModel: c.defaultModel,
        supportedOperations: c.supportedOperations
      }))
    });
  });
  app.get("/api/integrations/providers/:provider", async (req, res) => {
    const provider = getParam3(req.params, "provider");
    const config2 = getProviderConfig(provider);
    if (!config2) {
      res.status(404).json({ error: `Provider not found: ${provider}` });
      return;
    }
    res.json(config2);
  });
  app.get("/api/integrations/providers/:provider/models", authMiddleware, async (req, res) => {
    const provider = getParam3(req.params, "provider");
    const { capability } = req.query;
    const user = req.user;
    const token = req.token;
    let apiKey;
    try {
      const credential = await getCredential(user.id, user.orgId, provider, token);
      apiKey = credential?.apiKey;
    } catch {
    }
    let models = await getModelsForProvider(provider, apiKey);
    if (capability && typeof capability === "string") {
      const capabilities = capability.split(",").map((c) => c.trim().toLowerCase());
      models = models.filter(
        (m) => m.capabilities?.some((c) => capabilities.includes(c.toLowerCase()))
      );
    }
    res.json({ models });
  });
  app.get("/api/integrations/models", authMiddleware, async (req, res) => {
    const { capability, purpose } = req.query;
    const user = req.user;
    const token = req.token;
    let filterCapabilities = [];
    if (capability && typeof capability === "string") {
      filterCapabilities = capability.split(",").map((c) => c.trim().toLowerCase());
    } else if (purpose && typeof purpose === "string") {
      switch (purpose.toLowerCase()) {
        case "chat":
        case "llm":
          filterCapabilities = ["chat", "reasoning"];
          break;
        case "embedding":
        case "embeddings":
          filterCapabilities = ["embedding"];
          break;
        case "vision":
          filterCapabilities = ["vision"];
          break;
      }
    }
    const providers = getRegisteredProviders();
    const result = {};
    for (const provider of providers) {
      let apiKey;
      try {
        const credential = await getCredential(user.id, user.orgId, provider, token);
        apiKey = credential?.apiKey;
      } catch {
      }
      let models = await getModelsForProvider(provider, apiKey);
      if (filterCapabilities.length > 0) {
        models = models.filter(
          (m) => m.capabilities?.some((c) => filterCapabilities.includes(c.toLowerCase()))
        );
      }
      if (models.length > 0) {
        result[provider] = models.map((m) => ({
          ...m,
          provider
          // Include provider for convenience
        }));
      }
    }
    res.json({
      models: result,
      // Flatten for convenience
      all: Object.entries(result).flatMap(
        ([provider, models]) => models.map((m) => ({ ...m, provider }))
      )
    });
  });
  initializeBuiltinIntegrations();
  app.post("/api/integrations/register", authMiddleware, async (req, res) => {
    const integration = req.body;
    if (!integration.key || !integration.type) {
      res.status(400).json({ error: "Integration key and type are required" });
      return;
    }
    const result = await integrationRegistry.register(integration);
    if (result.success) {
      await rememberIntegration(integration);
      res.json({
        success: true,
        integration: integrationRegistry.get(integration.key),
        operationCount: result.operationCount
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  });
  app.get("/api/integrations/registry", authMiddleware, async (_req, res) => {
    const integrations2 = integrationRegistry.getAll();
    res.json({ integrations: integrations2 });
  });
  app.get("/api/integrations/registry/:key", authMiddleware, async (req, res) => {
    const key = getParam3(req.params, "key");
    const integration = integrationRegistry.get(key);
    if (!integration) {
      res.status(404).json({ error: `Integration not found: ${key}` });
      return;
    }
    res.json({ integration });
  });
  app.get("/api/integrations/registry/:key/operations", authMiddleware, async (req, res) => {
    const key = getParam3(req.params, "key");
    const operations = integrationRegistry.listOperations(key);
    if (operations.length === 0) {
      const integration = integrationRegistry.get(key);
      if (!integration) {
        res.status(404).json({ error: `Integration not found: ${key}` });
        return;
      }
    }
    res.json({ operations });
  });
  app.get("/api/integrations/namespace", authMiddleware, async (_req, res) => {
    const namespace = integrationRegistry.getFullNamespace();
    res.json(namespace);
  });
  app.get("/api/integrations/operations/search", authMiddleware, async (req, res) => {
    const { q, tag } = req.query;
    let results;
    if (tag && typeof tag === "string") {
      results = integrationRegistry.getOperationsByTag(tag);
    } else if (q && typeof q === "string") {
      results = integrationRegistry.searchOperations(q);
    } else {
      res.status(400).json({ error: "Query parameter 'q' or 'tag' is required" });
      return;
    }
    res.json({ results });
  });
  app.post("/api/integrations/invoke", authMiddleware, rateLimitMiddleware, async (req, res) => {
    const startTime = Date.now();
    const requestId = `inv_${randomUUID3().slice(0, 12)}`;
    const user = req.user;
    const token = req.token;
    try {
      const request = req.body;
      if (!request.operation) {
        res.status(400).json({
          success: false,
          error: "Operation path is required",
          requestId,
          durationMs: Date.now() - startTime
        });
        return;
      }
      const lookup2 = integrationRegistry.lookupOperation(request.operation);
      if (!lookup2) {
        res.status(404).json({
          success: false,
          error: `Operation not found: ${request.operation}`,
          requestId,
          durationMs: Date.now() - startTime
        });
        return;
      }
      const { integration, operation } = lookup2;
      if (integration.type === "builtin" && ["openai", "anthropic", "google", "mistral", "cohere", "huggingface"].includes(integration.key)) {
        const provider = getProvider(integration.key);
        if (!provider) {
          res.status(500).json({
            success: false,
            error: `Provider not found: ${integration.key}`,
            requestId,
            durationMs: Date.now() - startTime
          });
          return;
        }
        const credential = await getCredential(user.id, user.orgId, integration.key, token);
        if (!credential) {
          res.status(400).json({
            success: false,
            error: `No ${integration.key} API key configured`,
            requestId,
            durationMs: Date.now() - startTime
          });
          return;
        }
        let opType = "chat.completions";
        if (operation.id.includes("embed")) {
          opType = "embeddings";
        } else if (operation.id.includes("messages")) {
          opType = "messages";
        }
        const body = request.body || {};
        const executeOptions = {
          operation: opType,
          model: body.model || "",
          params: body,
          apiKey: credential.apiKey,
          timeout: request.timeout || 6e4
        };
        const data = opType === "embeddings" && provider.embed ? await provider.embed(executeOptions) : await provider.execute(executeOptions);
        const durationMs = Date.now() - startTime;
        await logProxyUsage({
          userId: user.id,
          orgId: user.orgId,
          integrationKey: integration.key,
          operation: request.operation,
          credential,
          requestId,
          success: true,
          durationMs,
          inputTokens: data.usage?.promptTokens,
          outputTokens: "completionTokens" in data.usage ? data.usage.completionTokens : void 0,
          totalTokens: data.usage?.totalTokens
        });
        res.json({
          success: true,
          data,
          requestId,
          durationMs,
          operation: request.operation,
          integration: integration.key
        });
        return;
      }
      if (integration.type === "openapi" && operation.method && operation.path) {
        let serverUrl = integration.openapi?.serverUrl;
        if (!serverUrl && integration.openapi?.spec) {
          const spec = integration.openapi.spec;
          serverUrl = spec.servers?.[0]?.url;
        }
        if (!serverUrl) {
          res.status(500).json({
            success: false,
            error: "No server URL configured for integration",
            requestId,
            durationMs: Date.now() - startTime
          });
          return;
        }
        let url = `${serverUrl}${operation.path}`;
        const params = request.params || {};
        const pathNames = new Set(
          [...operation.path.match(/\{([^}]+)\}/g) || []].map((t) => t.slice(1, -1))
        );
        for (const [key, value] of Object.entries(params)) {
          url = url.replace(`{${key}}`, encodeURIComponent(String(value)));
        }
        const queryParams = operation.parameters?.filter((p) => p.location === "query") || [];
        const queryString = queryParams.filter((p) => params[p.name] !== void 0).map((p) => `${p.name}=${encodeURIComponent(String(params[p.name]))}`).join("&");
        if (queryString) {
          url += `?${queryString}`;
        }
        const queryNames = new Set(queryParams.map((p) => p.name));
        const leftoverParams = Object.fromEntries(
          Object.entries(params).filter(
            ([k]) => !pathNames.has(k) && !queryNames.has(k)
          )
        );
        const leftoverKeys = Object.keys(leftoverParams);
        const methodTakesBody = operation.method !== "GET" && operation.method !== "HEAD";
        if (leftoverKeys.length > 0 && request.body !== void 0 && methodTakesBody) {
          res.status(400).json({
            success: false,
            error: "params and body both carry request-body fields",
            detail: `params has ${leftoverKeys.join(", ")}, which are neither path nor query parameters of ${request.operation}, and body is also set. Send the request body in one place. Nothing was called.`,
            requestId,
            durationMs: Date.now() - startTime
          });
          return;
        }
        const requestBody = methodTakesBody ? request.body !== void 0 ? request.body : leftoverKeys.length > 0 ? leftoverParams : void 0 : void 0;
        const ignoredParams = !methodTakesBody && leftoverKeys.length > 0 ? leftoverKeys : void 0;
        let authHeaders = {};
        let credential = null;
        if (integration.auth && integration.auth.type !== "none") {
          credential = await getCredential(user.id, user.orgId, integration.key, token);
        }
        authHeaders = await buildRequestHeaders(integration, credential?.apiKey ?? "");
        const response = await fetch(url, {
          method: operation.method,
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
            ...request.headers
          },
          body: requestBody !== void 0 ? JSON.stringify(requestBody) : void 0,
          signal: request.timeout ? AbortSignal.timeout(request.timeout) : void 0
        });
        const responseData = await response.json().catch(() => null);
        const durationMs = Date.now() - startTime;
        if (credential) {
          await logProxyUsage({
            userId: user.id,
            orgId: user.orgId,
            integrationKey: integration.key,
            operation: request.operation,
            credential,
            requestId,
            success: response.ok,
            statusCode: response.status,
            durationMs
          });
        }
        res.json({
          success: response.ok,
          data: responseData,
          statusCode: response.status,
          requestId,
          durationMs,
          operation: request.operation,
          integration: integration.key,
          ...ignoredParams ? {
            ignoredParams,
            ignoredParamsNote: `${operation.method} ${operation.path} takes no request body, and these params match no path or query parameter it declares. They were not sent anywhere. The result above was produced without them.`
          } : {}
        });
        return;
      }
      if (integration.type === "mcp") {
        if (integration.mcp) {
          mcpExecutor.registerServer(integration.key, integration.mcp);
        }
        const context = {
          requestId,
          userId: user.id,
          orgId: user.orgId,
          authToken: token,
          timeout: request.timeout || 3e4
        };
        try {
          const result = await mcpExecutor.execute({
            operation,
            integrationKey: integration.key,
            params: request.body || {},
            context
          });
          const durationMs = Date.now() - startTime;
          res.json({
            success: true,
            data: result.data,
            type: result.type,
            requestId,
            durationMs,
            operation: request.operation,
            integration: integration.key
          });
          return;
        } catch (error) {
          const durationMs = Date.now() - startTime;
          const classified = error instanceof IntegrationError ? error : classifyProviderError(error, integration.key, operation.id);
          res.status(classified.statusCode).json({
            ...classified.toResponse(),
            requestId,
            durationMs,
            operation: request.operation,
            integration: integration.key
          });
          return;
        }
      }
      const notSupportedError = new IntegrationError({
        message: `Unsupported integration type: ${integration.type}`,
        category: "validation"
      });
      res.status(notSupportedError.statusCode).json({
        ...notSupportedError.toResponse(),
        requestId,
        durationMs: Date.now() - startTime
      });
    } catch (error) {
      console.error("[integrations] Invoke error:", error);
      const classified = error instanceof IntegrationError ? error : new IntegrationError({
        message: error instanceof Error ? error.message : "Internal error",
        category: "internal",
        cause: error instanceof Error ? error : void 0
      });
      res.status(classified.statusCode).json({
        ...classified.toResponse(),
        requestId,
        durationMs: Date.now() - startTime
      });
    }
  });
  app.post("/api/integrations/parse/openapi", authMiddleware, async (req, res) => {
    const { specUrl, spec, serverUrl } = req.body;
    const result = await fetchAndParseOpenAPI({ specUrl, spec, serverUrl });
    if (result.success) {
      res.json({
        success: true,
        operations: result.operations,
        namespace: result.namespace,
        info: result.info,
        authType: result.authType,
        serverUrl: result.serverUrl
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  });
  app.post("/api/integrations/parse/mcp", authMiddleware, async (req, res) => {
    const config2 = req.body;
    const result = await discoverMCPServer(config2);
    if (result.success) {
      res.json({
        success: true,
        operations: result.operations,
        namespace: result.namespace,
        capabilities: result.capabilities
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  });
  app.post("/api/integrations/registry/:key/refresh", authMiddleware, async (req, res) => {
    const key = getParam3(req.params, "key");
    const result = await integrationRegistry.refresh(key);
    if (result.success) {
      res.json({
        success: true,
        integration: integrationRegistry.get(key),
        operationCount: result.operationCount
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  });
  app.post("/api/integrations/mcp", authMiddleware, createMCPHttpHandler());
  app.get("/api/integrations/mcp/info", async (_req, res) => {
    const tools = integrationRegistry.getAll().flatMap(
      (i) => (i.operations || []).map((op) => ({
        integration: i.key,
        operation: op.id,
        description: op.summary || op.description,
        tags: op.tags
      }))
    );
    res.json({
      server: {
        name: "symbia-integrations",
        version: "1.0.0",
        protocol: "2024-11-05"
      },
      capabilities: {
        tools: true,
        resources: false,
        prompts: false
      },
      toolCount: tools.length,
      tools: tools.slice(0, 50)
      // First 50 for preview
    });
  });
  app.post("/api/integrations/mcp/register", authMiddleware, async (req, res) => {
    const {
      key,
      name,
      description,
      transport,
      command,
      args,
      serverUrl,
      env
    } = req.body;
    if (!key || !transport) {
      res.status(400).json({
        success: false,
        error: "key and transport are required"
      });
      return;
    }
    const mcpConfig = {
      transport,
      command,
      args,
      serverUrl,
      env
    };
    const discovery = await discoverMCPServer(mcpConfig);
    if (!discovery.success) {
      res.status(400).json({
        success: false,
        error: `Failed to connect to MCP server: ${discovery.error}`
      });
      return;
    }
    const integration = {
      id: `mcp-${key}`,
      key,
      name: name || key,
      description: description || `MCP server: ${key}`,
      type: "mcp",
      mcp: mcpConfig,
      operations: discovery.operations,
      namespace: discovery.namespace,
      status: "active",
      version: 1
    };
    const result = await integrationRegistry.register(integration);
    if (result.success) {
      res.json({
        success: true,
        integration: integrationRegistry.get(key),
        operationCount: result.operationCount,
        capabilities: discovery.capabilities
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  });
  initializeOAuthProviders();
  const oauthStorage = createOAuthStorage(db);
  const oauthService = new OAuthService(oauthStorage);
  app.get("/api/oauth/providers", authMiddleware, async (req, res) => {
    const user = req.user;
    try {
      const providers = await oauthService.getAvailableProviders(user.id);
      res.json({ providers });
    } catch (error) {
      console.error("[oauth] Error listing providers:", error);
      res.status(500).json({ error: "Failed to list OAuth providers" });
    }
  });
  app.post("/api/oauth/authorize", authMiddleware, async (req, res) => {
    const user = req.user;
    try {
      const parseResult = oauthAuthorizeRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: "Invalid request",
          details: parseResult.error.errors
        });
        return;
      }
      const request = parseResult.data;
      const result = await oauthService.authorize(request, user.id, user.orgId);
      res.json(result);
    } catch (error) {
      if (error instanceof OAuthError) {
        res.status(400).json({
          error: error.message,
          code: error.code,
          details: error.details
        });
        return;
      }
      console.error("[oauth] Authorization error:", error);
      res.status(500).json({ error: "Failed to initiate OAuth flow" });
    }
  });
  app.get("/api/oauth/callback", async (req, res) => {
    const { code, state, error, error_description } = req.query;
    if (error) {
      const redirectUrl = config.oauthErrorRedirectUrl;
      const errorParams = new URLSearchParams({
        error: String(error),
        error_description: String(error_description || "")
      });
      res.redirect(`${redirectUrl}/oauth/error?${errorParams}`);
      return;
    }
    if (!code || !state) {
      res.status(400).json({
        error: "Missing code or state parameter"
      });
      return;
    }
    try {
      const result = await oauthService.handleCallback(
        String(code),
        String(state)
      );
      const successParams = new URLSearchParams({
        success: "true",
        provider: result.connection.provider,
        connection_id: result.connection.id
      });
      if (result.clientState) {
        successParams.set("state", result.clientState);
      }
      res.redirect(`${result.redirectUri}?${successParams}`);
    } catch (error2) {
      console.error("[oauth] Callback error:", error2);
      const redirectUrl = config.oauthErrorRedirectUrl;
      const errorMessage = error2 instanceof OAuthError ? error2.message : "OAuth callback failed";
      const errorParams = new URLSearchParams({
        error: "callback_failed",
        error_description: errorMessage
      });
      res.redirect(`${redirectUrl}/oauth/error?${errorParams}`);
    }
  });
  app.get("/api/oauth/connections", authMiddleware, async (req, res) => {
    const user = req.user;
    try {
      const connections = await oauthService.getConnections(user.id, user.orgId);
      res.json({ connections });
    } catch (error) {
      console.error("[oauth] Error listing connections:", error);
      res.status(500).json({ error: "Failed to list OAuth connections" });
    }
  });
  app.delete("/api/oauth/connections/:id", authMiddleware, async (req, res) => {
    const user = req.user;
    const id = getParam3(req.params, "id");
    try {
      await oauthService.revokeConnection(id, user.id);
      res.json({ success: true, message: "Connection revoked" });
    } catch (error) {
      if (error instanceof OAuthError) {
        const statusCode = error.code === "connection_not_found" ? 404 : error.code === "not_authorized" ? 403 : 400;
        res.status(statusCode).json({
          error: error.message,
          code: error.code
        });
        return;
      }
      console.error("[oauth] Error revoking connection:", error);
      res.status(500).json({ error: "Failed to revoke connection" });
    }
  });
  app.get("/api/integrations/usage", authMiddleware, async (req, res) => {
    const user = req.user;
    const { days = "30", integration } = req.query;
    try {
      const daysNum = parseInt(days) || 30;
      const startDate = /* @__PURE__ */ new Date();
      startDate.setDate(startDate.getDate() - daysNum);
      const conditions = [
        sql`${proxyUsage.orgId} = ${user.orgId}`,
        sql`${proxyUsage.timestamp} >= ${startDate}`
      ];
      if (integration) {
        conditions.push(sql`${proxyUsage.integrationKey} = ${integration}`);
      }
      const summary = await db.select({
        totalRequests: sql`count(*)::int`,
        successCount: sql`sum(case when ${proxyUsage.success} then 1 else 0 end)::int`,
        errorCount: sql`sum(case when not ${proxyUsage.success} then 1 else 0 end)::int`,
        totalTokens: sql`coalesce(sum(${proxyUsage.totalTokens}), 0)::int`,
        totalCostMicros: sql`coalesce(sum(${proxyUsage.estimatedCostMicros}), 0)::int`,
        avgDurationMs: sql`coalesce(avg(${proxyUsage.durationMs}), 0)::int`,
        uniqueUsers: sql`count(distinct ${proxyUsage.userId})::int`
      }).from(proxyUsage).where(and(...conditions));
      const llmConditions = [
        sql`${executionLogs.orgId} = ${user.orgId}`,
        sql`${executionLogs.startedAt} >= ${startDate}`
      ];
      const [llm] = await db.select({
        totalRequests: sql`count(*)::int`,
        successCount: sql`sum(case when ${executionLogs.success} then 1 else 0 end)::int`,
        errorCount: sql`sum(case when not ${executionLogs.success} then 1 else 0 end)::int`,
        totalTokens: sql`coalesce(sum(${executionLogs.totalTokens}), 0)::int`,
        totalCostMicros: sql`coalesce(sum(${executionLogs.estimatedCostMicros}), 0)::int`,
        avgDurationMs: sql`coalesce(avg(${executionLogs.durationMs}), 0)::int`,
        uniqueUsers: sql`count(distinct ${executionLogs.userId})::int`,
        // How much of the total is a real figure. See the note on
        // unpricedCalls below — a cost of zero over unpriced calls is not a
        // bill of zero, it is an unknown wearing a number.
        unpricedCalls: sql`count(*) filter (where ${executionLogs.estimatedCostMicros} is null)::int`,
        unpricedTokens: sql`coalesce(sum(${executionLogs.totalTokens}) filter (where ${executionLogs.estimatedCostMicros} is null), 0)::int`
      }).from(executionLogs).where(and(...llmConditions));
      const byIntegration = await db.select({
        integrationKey: proxyUsage.integrationKey,
        requestCount: sql`count(*)::int`,
        totalTokens: sql`coalesce(sum(${proxyUsage.totalTokens}), 0)::int`
      }).from(proxyUsage).where(and(...conditions)).groupBy(proxyUsage.integrationKey).orderBy(sql`count(*) desc`);
      const byUser = await db.select({
        userId: proxyUsage.userId,
        requestCount: sql`count(*)::int`,
        totalTokens: sql`coalesce(sum(${proxyUsage.totalTokens}), 0)::int`
      }).from(proxyUsage).where(and(...conditions)).groupBy(proxyUsage.userId).orderBy(sql`count(*) desc`).limit(20);
      const llmByUser = await db.select({
        userId: executionLogs.userId,
        requestCount: sql`count(*)::int`,
        totalTokens: sql`coalesce(sum(${executionLogs.totalTokens}), 0)::int`,
        totalCostMicros: sql`coalesce(sum(${executionLogs.estimatedCostMicros}), 0)::int`
      }).from(executionLogs).where(and(...llmConditions)).groupBy(executionLogs.userId).orderBy(sql`count(*) desc`).limit(20);
      const llmByProvider = await db.select({
        provider: executionLogs.provider,
        model: executionLogs.model,
        requestCount: sql`count(*)::int`,
        totalTokens: sql`coalesce(sum(${executionLogs.totalTokens}), 0)::int`,
        totalCostMicros: sql`coalesce(sum(${executionLogs.estimatedCostMicros}), 0)::int`,
        // UNPRICED IS NOT FREE, AND THE TOTAL CANNOT TELL THEM APART.
        //
        // coalesce turns a NULL cost into 0, so a call nobody could price
        // and a genuinely free local call both contribute nothing and look
        // identical. Measured 24 Aug: two claude-sonnet-5 calls carried NULL
        // cost — they predate the pricing work — and vanished into a total
        // that read as complete.
        //
        // That is F50's shape again one level up: the money was missing and
        // the number looked finished. Counting them makes the gap visible
        // without pretending to a figure.
        unpricedCalls: sql`count(*) filter (where ${executionLogs.estimatedCostMicros} is null)::int`,
        // The number that is actually money. Measured 24 Aug: of the four
        // unpriced calls, two were failures — no tokens, no cost, correctly
        // nothing — and two were successful claude-sonnet-5 calls totalling
        // 1024 tokens that no price table covered. Counting calls conflated
        // those two cases. Counting tokens on unpriced rows does not: a
        // failure contributes zero tokens by itself, so this figure is
        // exactly the consumption nobody costed.
        unpricedTokens: sql`coalesce(sum(${executionLogs.totalTokens}) filter (where ${executionLogs.estimatedCostMicros} is null), 0)::int`
      }).from(executionLogs).where(and(...llmConditions)).groupBy(executionLogs.provider, executionLogs.model).orderBy(sql`count(*) desc`).limit(20);
      const proxy = summary[0] || {
        totalRequests: 0,
        successCount: 0,
        errorCount: 0,
        totalTokens: 0,
        totalCostMicros: 0,
        avgDurationMs: 0,
        uniqueUsers: 0
      };
      const model = llm || {
        totalRequests: 0,
        successCount: 0,
        errorCount: 0,
        totalTokens: 0,
        totalCostMicros: 0,
        avgDurationMs: 0,
        uniqueUsers: 0
      };
      const totalRequests = (proxy.totalRequests || 0) + (model.totalRequests || 0);
      const avgDurationMs = totalRequests === 0 ? 0 : Math.round(
        ((proxy.avgDurationMs || 0) * (proxy.totalRequests || 0) + (model.avgDurationMs || 0) * (model.totalRequests || 0)) / totalRequests
      );
      res.json({
        period: { days: daysNum, startDate: startDate.toISOString() },
        summary: {
          totalRequests,
          successCount: (proxy.successCount || 0) + (model.successCount || 0),
          errorCount: (proxy.errorCount || 0) + (model.errorCount || 0),
          totalTokens: (proxy.totalTokens || 0) + (model.totalTokens || 0),
          totalCostMicros: (proxy.totalCostMicros || 0) + (model.totalCostMicros || 0),
          avgDurationMs,
          // Deliberately NOT summed. The same person using both paths is one
          // user, and adding the two counts would double them. Reporting the
          // larger is a floor, and it is labelled as one.
          uniqueUsers: Math.max(proxy.uniqueUsers || 0, model.uniqueUsers || 0),
          uniqueUsersNote: "a floor \u2014 the larger of the two paths, since a caller using both cannot be deduplicated across tables",
          // Surfaced on the summary, not only per model, because someone
          // reading a single cost figure needs to know how much of it is
          // actually costed.
          unpricedCalls: model.unpricedCalls || 0,
          unpricedTokens: model.unpricedTokens || 0,
          // Phrased around tokens, because tokens are the part that costs
          // money. A call with no price and no tokens is a failed call, and a
          // failure costing nothing is correct rather than a gap.
          costCompleteness: (model.unpricedTokens || 0) > 0 ? `${model.unpricedTokens} token(s) across ${model.unpricedCalls} call(s) were consumed with no price available and contribute 0 \u2014 the total is a floor, not a bill` : (model.unpricedCalls || 0) > 0 ? `${model.unpricedCalls} unpriced call(s), all zero-token \u2014 failures cost nothing, so the total is complete` : "every call in this window is priced"
        },
        // Kept separable, because the two paths bill differently and anyone
        // reconciling a figure needs to know which half moved.
        bySource: { proxy, model },
        byIntegration,
        // Both paths, kept labelled. A caller appearing under `model` spent it
        // on completions; one under `proxy` spent it on integration calls.
        byUser: { proxy: byUser, model: llmByUser },
        byModel: llmByProvider
      });
    } catch (error) {
      console.error("[integrations] Usage query error:", error);
      res.status(500).json({ error: "Failed to fetch usage data" });
    }
  });
  app.get("/api/integrations/usage/logs", authMiddleware, async (req, res) => {
    const user = req.user;
    const { days = "7", integration, userId: filterUserId, limit: limitStr = "100", offset: offsetStr = "0" } = req.query;
    try {
      const daysNum = parseInt(days) || 7;
      const limitNum = Math.min(parseInt(limitStr) || 100, 500);
      const offsetNum = parseInt(offsetStr) || 0;
      const startDate = /* @__PURE__ */ new Date();
      startDate.setDate(startDate.getDate() - daysNum);
      const conditions = [
        sql`${proxyUsage.orgId} = ${user.orgId}`,
        sql`${proxyUsage.timestamp} >= ${startDate}`
      ];
      if (integration) {
        conditions.push(sql`${proxyUsage.integrationKey} = ${integration}`);
      }
      if (filterUserId) {
        conditions.push(sql`${proxyUsage.userId} = ${filterUserId}`);
      }
      const logs = await db.select().from(proxyUsage).where(and(...conditions)).orderBy(sql`${proxyUsage.timestamp} desc`).limit(limitNum).offset(offsetNum);
      res.json({ logs, limit: limitNum, offset: offsetNum });
    } catch (error) {
      console.error("[integrations] Usage logs query error:", error);
      res.status(500).json({ error: "Failed to fetch usage logs" });
    }
  });
  app.get("/api/integrations/usage/by-user", authMiddleware, async (req, res) => {
    const user = req.user;
    const { days = "30", integration } = req.query;
    try {
      const daysNum = parseInt(days) || 30;
      const startDate = /* @__PURE__ */ new Date();
      startDate.setDate(startDate.getDate() - daysNum);
      const conditions = [
        sql`${proxyUsage.orgId} = ${user.orgId}`,
        sql`${proxyUsage.timestamp} >= ${startDate}`
      ];
      if (integration) {
        conditions.push(sql`${proxyUsage.integrationKey} = ${integration}`);
      }
      const byUser = await db.select({
        userId: proxyUsage.userId,
        requestCount: sql`count(*)::int`,
        successCount: sql`sum(case when ${proxyUsage.success} then 1 else 0 end)::int`,
        errorCount: sql`sum(case when not ${proxyUsage.success} then 1 else 0 end)::int`,
        totalTokens: sql`coalesce(sum(${proxyUsage.totalTokens}), 0)::int`,
        totalCostMicros: sql`coalesce(sum(${proxyUsage.estimatedCostMicros}), 0)::int`,
        avgDurationMs: sql`coalesce(avg(${proxyUsage.durationMs}), 0)::int`,
        lastUsedAt: sql`max(${proxyUsage.timestamp})`
      }).from(proxyUsage).where(and(...conditions)).groupBy(proxyUsage.userId).orderBy(sql`count(*) desc`);
      res.json({ users: byUser });
    } catch (error) {
      console.error("[integrations] Usage by-user query error:", error);
      res.status(500).json({ error: "Failed to fetch usage data" });
    }
  });
  app.get("/api/integrations/capabilities", authMiddleware, async (req, res) => {
    const user = req.user;
    const token = req.token;
    try {
      const providers = getRegisteredProviders();
      const providerCapabilities = [];
      const byProvider = {};
      const modelsByPurpose = {
        chat: [],
        embedding: [],
        vision: [],
        reasoning: []
      };
      for (const providerName of providers) {
        const config2 = getProviderConfig(providerName);
        const adapter = getProvider(providerName);
        let hasCredential = false;
        let credentialSource = "none";
        let apiKey;
        try {
          const credential = await getCredential(user.id, user.orgId, providerName, token);
          if (credential?.apiKey) {
            hasCredential = true;
            apiKey = credential.apiKey;
            credentialSource = credential.isProxy ? "org-wide" : "personal";
          }
        } catch {
        }
        let models = await getModelsForProvider(providerName, apiKey);
        const keyless = isKeylessProvider(providerName);
        const usable = keyless ? models.length > 0 : hasCredential;
        const unusableBecause = keyless ? "Runs locally and needs no key, but the models service lists no model for it" : "No API key configured";
        const capability = {
          provider: providerName,
          name: providerName.charAt(0).toUpperCase() + providerName.slice(1),
          description: getProviderDescription(providerName),
          baseUrl: config2?.baseUrl || "",
          // Ask the provider what it has before falling back to static config.
          // A local provider has no configured defaultModel and the one model
          // it holds is the honest answer.
          defaultModel: config2?.defaultModel || models[0]?.id || "",
          supportedOperations: adapter?.supportedOperations || config2?.supportedOperations || [],
          models,
          access: {
            hasCredential,
            credentialSource,
            // Keyless providers are enabled without one — the distinction
            // between "has a credential" and "can be used" is the whole point.
            isEnabled: usable,
            lastUsedAt: null
          },
          rateLimits: config2?.rateLimits,
          // AVAILABLE MEANS USABLE, NOT CREDENTIALLED. A local provider needs
          // no key; what it needs is a model. Reporting it unavailable while it
          // held a verified model on disk is what sent the coordinator's reply
          // to Twitch chat as "add an API key in Settings".
          //
          // AND USABLE IS NOT THE SAME AS WORKING — third state, added 25 Aug.
          //
          // `usable` above asks one question: does a credential exist. It does
          // not ask whether calls with that credential succeed, and on 25 Aug
          // those were different answers. The org's openai key was past its
          // billing limit and returned 402 on every call; anthropic answered
          // 200 in 1390ms. Both reported `available`, openai came first in the
          // list, and `resolveUsableProvider` takes the first — so every LLM
          // assistant on the platform routed to the dead provider and stayed
          // there. Seven of ten assistants were down because of a `.find()`.
          //
          // The platform already knew. The circuit breaker had openai open with
          // six failures at that moment, and nothing consulted it when deciding
          // which provider to hand out. So consult it, and give the caller a
          // word for "credentialled but currently failing" rather than making
          // it choose between two states that do not fit.
          //
          // `impaired` is deliberately not `unavailable`: the credential is
          // real, the outage may be transient, and a caller with no other
          // option should still be allowed to try. It is a preference order,
          // not an exclusion.
          ...(() => {
            if (!usable) {
              return { status: "unavailable", statusMessage: unusableBecause };
            }
            const circuit = circuitBreaker.canRequest(providerName);
            if (!circuit.allowed) {
              return {
                status: "impaired",
                statusMessage: circuit.reason || `Recent calls to ${providerName} failed; its circuit is open`
              };
            }
            return { status: "available", statusMessage: void 0 };
          })()
        };
        providerCapabilities.push(capability);
        byProvider[providerName] = capability;
        for (const model of models) {
          const caps = model.capabilities || [];
          if (caps.includes("chat") || caps.includes("reasoning")) {
            modelsByPurpose.chat.push({ provider: providerName, model });
          }
          if (caps.includes("embedding")) {
            modelsByPurpose.embedding.push({ provider: providerName, model });
          }
          if (caps.includes("vision")) {
            modelsByPurpose.vision.push({ provider: providerName, model });
          }
          if (caps.includes("reasoning")) {
            modelsByPurpose.reasoning.push({ provider: providerName, model });
          }
        }
      }
      const providerPriority = ["openai", "anthropic", "google", "mistral", "cohere", "huggingface"];
      for (const purpose of Object.keys(modelsByPurpose)) {
        modelsByPurpose[purpose].sort((a, b) => {
          const aIdx = providerPriority.indexOf(a.provider);
          const bIdx = providerPriority.indexOf(b.provider);
          return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
        });
      }
      res.json({
        providers: providerCapabilities,
        byProvider,
        modelsByPurpose,
        defaults: {
          chatProvider: "openai",
          chatModel: "gpt-4o-mini",
          embeddingProvider: "openai",
          embeddingModel: "text-embedding-3-small"
        },
        fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (error) {
      console.error("[integrations] Capabilities error:", error);
      res.status(500).json({ error: "Failed to fetch capabilities" });
    }
  });
  app.get("/api/integrations/status", async (req, res) => {
    const providers = getRegisteredProviders();
    const configs = getAllProviderConfigs();
    res.json({
      status: "healthy",
      providers: providers.map((p) => ({
        name: p,
        registered: configs.some((c) => c.provider === p),
        credential: "not_checked",
        // Deprecated: same value as `registered`. Never meant a key exists.
        configured: configs.some((c) => c.provider === p)
      })),
      note: "registered = an adapter and config exist in this service. Credentials are per-user and live in identity; this route is unauthenticated and does not check them. Use GET /api/integrations/capabilities with a token for a credential-aware answer.",
      circuitBreaker: circuitBreaker.getStatus()
    });
  });
  app.get("/api/integrations/circuit-breaker", authMiddleware, async (_req, res) => {
    res.json({
      status: circuitBreaker.getStatus(),
      description: "Circuit breaker protects against cascading failures. Open circuits reject requests until recovery."
    });
  });
  app.post("/api/integrations/circuit-breaker/reset/:provider", authMiddleware, async (req, res) => {
    const provider = getParam3(req.params, "provider");
    circuitBreaker.reset(provider);
    res.json({
      success: true,
      message: `Circuit breaker reset for ${provider}`,
      status: circuitBreaker.getStatus()
    });
  });
  app.post("/api/integrations/circuit-breaker/reset", authMiddleware, async (_req, res) => {
    circuitBreaker.resetAll();
    res.json({
      success: true,
      message: "All circuit breakers reset",
      status: circuitBreaker.getStatus()
    });
  });
  app.get("/api/stats", async (_req, res) => {
    try {
      const providers = getRegisteredProviders();
      const configs = getAllProviderConfigs();
      const integrations2 = integrationRegistry.getAll();
      res.json({
        totalProviders: providers.length,
        configuredProviders: configs.length,
        totalIntegrations: integrations2.length
      });
    } catch (error) {
      console.error("Error getting stats:", error);
      res.status(500).json({ error: "Failed to get stats" });
    }
  });
  app.get("/api/integrations/debug", authMiddleware, async (req, res) => {
    const user = req.user;
    const token = req.token;
    const credential = await getCredential(user.id, user.orgId, "openai", token);
    res.json({
      auth: {
        userId: user.id,
        userType: user.type,
        orgId: user.orgId,
        headerOrgId: req.headers["x-org-id"]
      },
      credentialLookup: {
        found: !!credential,
        hasApiKey: !!credential?.apiKey
      }
    });
  });
  await initializeModelEvalSystem();
  const evalRoutes = createEvalRoutes(db);
  app.use("/api/model-eval", evalRoutes);
  app.use("/api/channels", createChannelRoutes());
  app.get("/", (_req, res) => {
    res.redirect(302, "/docs/llms.txt");
  });
  app.get("/api/docs", (_req, res) => {
    res.redirect("/openapi.json");
  });
  app.get("/openapi.json", (_req, res) => {
    res.json(apiDocumentation);
  });
  app.get("/.well-known/openapi.json", (_req, res) => {
    res.json(apiDocumentation);
  });
  app.get("/llms.txt", (_req, res) => {
    try {
      const content = readFileSync(join(docsDir, "llms.txt"), "utf-8");
      res.type("text/plain").send(content);
    } catch {
      res.status(404).send("Documentation not found");
    }
  });
  app.get("/llm.txt", (_req, res) => {
    try {
      const content = readFileSync(join(docsDir, "llms.txt"), "utf-8");
      res.type("text/plain").send(content);
    } catch {
      res.status(404).send("Documentation not found");
    }
  });
  app.get("/llms-full.txt", (_req, res) => {
    try {
      const content = readFileSync(join(docsDir, "llms-full.txt"), "utf-8");
      res.type("text/plain").send(content);
    } catch {
      res.status(404).send("Documentation not found");
    }
  });
  app.get("/docs/openapi.json", (_req, res) => {
    res.json(apiDocumentation);
  });
  app.get("/docs/llms.txt", (_req, res) => {
    try {
      const content = readFileSync(join(docsDir, "llms.txt"), "utf-8");
      res.type("text/plain").send(content);
    } catch {
      res.status(404).send("Documentation not found");
    }
  });
  app.get("/docs/llms-full.txt", (_req, res) => {
    try {
      const content = readFileSync(join(docsDir, "llms-full.txt"), "utf-8");
      res.type("text/plain").send(content);
    } catch {
      res.status(404).send("Documentation not found");
    }
  });
  app.post("/api/integrations/db/export", authMiddleware, async (_req, res) => {
    const { exportToFile: exportToFile2, isMemory: isMemory2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    if (!isMemory2) {
      return res.json({
        success: false,
        message: "Database is using PostgreSQL - no export needed, data persists automatically"
      });
    }
    const timestamp3 = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const exportPath = join(process.cwd(), "data", `model-eval-backup-${timestamp3}.json`);
    const success = exportToFile2(exportPath);
    if (success) {
      res.json({
        success: true,
        path: exportPath,
        message: "Database exported successfully"
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Failed to export database"
      });
    }
  });
  app.get("/api/integrations/db/status", authMiddleware, async (_req, res) => {
    const { isMemory: isMemory2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    res.json({
      isMemory: isMemory2,
      persistsOnRestart: !isMemory2,
      recommendation: isMemory2 ? "Set DATABASE_URL environment variable for persistent storage, or call POST /api/integrations/db/export before shutdown" : "Data persists automatically in PostgreSQL"
    });
  });
}
async function logExecution(data) {
  const cost = estimateCost(data.model, data.promptTokens, data.completionTokens);
  try {
    await db.insert(executionLogs).values({
      id: randomUUID3(),
      userId: data.userId,
      orgId: data.orgId,
      provider: data.provider,
      operation: data.operation,
      model: data.model,
      requestId: data.requestId,
      startedAt: data.startedAt,
      completedAt: data.completedAt,
      durationMs: data.durationMs,
      success: data.success,
      errorMessage: data.errorMessage,
      promptTokens: data.promptTokens,
      completionTokens: data.completionTokens,
      totalTokens: data.totalTokens,
      // COST, AT THE MOMENT OF THE CALL.
      //
      // Left NULL on every row until 24 Aug, so the platform metered tokens and
      // attached no money to them. Priced here rather than at read time because
      // a price table changes: an invoice reconstructed six months later from
      // today's rates would be a different number than the one charged.
      //
      // `priced: false` writes NULL rather than 0 — an unpriced model and a
      // free one are different facts, and a zero would merge them.
      estimatedCostMicros: cost.priced ? cost.costMicros : null,
      metadata: {
        ...data.metadata ?? {},
        // The estimate is reproducible from the table, and the table was typed
        // by a person. Carry that with the number so nothing downstream reads
        // it as what the provider actually charged.
        pricing: {
          asOf: cost.pricingAsOf,
          source: cost.pricingSource,
          priced: cost.priced,
          ...cost.reason ? { reason: cost.reason } : {}
        }
      }
    });
  } catch (error) {
    console.error("[integrations] Failed to log execution:", error);
  }
}
function getProviderDescription(provider) {
  const descriptions = {
    openai: "OpenAI GPT models including GPT-4o, GPT-5.2, o3, and o4 series",
    anthropic: "Anthropic Claude models with advanced reasoning and long context",
    google: "Google Gemini models with multimodal capabilities",
    mistral: "Mistral AI models optimized for efficiency and multilingual support",
    cohere: "Cohere models specialized for enterprise search and RAG",
    huggingface: "Open-source models via Hugging Face Inference API"
  };
  return descriptions[provider] || `${provider} integration`;
}
async function logProxyUsage(data) {
  if (!data.credential.isProxy) {
    return;
  }
  try {
    await db.insert(proxyUsage).values({
      id: randomUUID3(),
      userId: data.userId,
      orgId: data.orgId,
      integrationKey: data.integrationKey,
      operation: data.operation,
      credentialId: data.credential.credentialId,
      requestId: data.requestId,
      success: data.success,
      statusCode: data.statusCode,
      errorMessage: data.errorMessage,
      durationMs: data.durationMs,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      totalTokens: data.totalTokens,
      estimatedCostMicros: data.estimatedCostMicros
    });
    console.log(`[integrations] Logged proxy usage - user: ${data.userId}, org: ${data.orgId}, integration: ${data.integrationKey}`);
  } catch (error) {
    console.error("[integrations] Failed to log proxy usage:", error);
  }
}
export {
  registerRoutes
};
