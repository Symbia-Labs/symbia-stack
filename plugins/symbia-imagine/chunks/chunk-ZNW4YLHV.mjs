import { createRequire as __symbiaCreateRequire } from "node:module";globalThis.require ??= __symbiaCreateRequire(import.meta.url);

// build/plugin/symbia-imagine/vendor/symbia-egress/dist/index.js
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
var EgressError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "EgressError";
  }
};
var ALLOWED_SCHEMES = /* @__PURE__ */ new Set(["http:", "https:"]);
function isBlockedIp(ip) {
  const kind = isIP(ip);
  if (kind === 4)
    return isBlockedV4(ip);
  if (kind === 6)
    return isBlockedV6(ip);
  return true;
}
function isBlockedV4(ip) {
  const p = ip.split(".").map((n) => Number(n));
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = p;
  if (a === 0)
    return true;
  if (a === 127)
    return true;
  if (a === 10)
    return true;
  if (a === 172 && b >= 16 && b <= 31)
    return true;
  if (a === 192 && b === 168)
    return true;
  if (a === 169 && b === 254)
    return true;
  if (a === 100 && b >= 64 && b <= 127)
    return true;
  if (a >= 224)
    return true;
  return false;
}
function isBlockedV6(ip) {
  const x = ip.toLowerCase();
  if (x === "::1" || x === "::")
    return true;
  const v4 = mappedV4(x);
  if (v4)
    return isBlockedV4(v4);
  if (x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb")) {
    return true;
  }
  if (x.startsWith("fc") || x.startsWith("fd"))
    return true;
  if (x.startsWith("ff"))
    return true;
  return false;
}
function mappedV4(x) {
  const m = x.match(/^::ffff:(.+)$/);
  if (!m)
    return null;
  const tail = m[1];
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(tail))
    return tail;
  const hm = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hm) {
    const hi = parseInt(hm[1], 16);
    const lo = parseInt(hm[2], 16);
    return `${hi >> 8 & 255}.${hi & 255}.${lo >> 8 & 255}.${lo & 255}`;
  }
  return null;
}
async function assertEgressAllowed(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new EgressError(`invalid URL: ${String(rawUrl)}`);
  }
  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    throw new EgressError(`scheme not allowed: ${url.protocol}`);
  }
  const host = url.hostname.replace(/^\[/, "").replace(/\]$/, "");
  const allow = (process.env.EGRESS_ALLOWLIST || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allow.length > 0 && !allow.includes(url.hostname) && !allow.includes(host)) {
    throw new EgressError(`host not in EGRESS_ALLOWLIST: ${host}`);
  }
  if (isIP(host)) {
    if (isBlockedIp(host))
      throw new EgressError(`blocked address: ${host}`);
    return url;
  }
  let addrs;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new EgressError(`cannot resolve host (fail-closed): ${host}`);
  }
  if (addrs.length === 0)
    throw new EgressError(`no addresses for host: ${host}`);
  for (const a of addrs) {
    if (isBlockedIp(a.address)) {
      throw new EgressError(`host resolves to blocked address: ${host} -> ${a.address}`);
    }
  }
  return url;
}
async function safeFetch(rawUrl, init) {
  await assertEgressAllowed(rawUrl);
  return fetch(rawUrl, init);
}

export {
  EgressError,
  safeFetch
};
