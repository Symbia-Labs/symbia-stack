#!/usr/bin/env node
/**
 * The viewport: one window onto every imagine host on this machine.
 *
 * WHY THIS IS NOT A URL PER HOST. Owned hosts take ephemeral ports and write
 * private address files, which is what keeps two conversations from sharing a
 * stack — and it means the address a human would need changes every time and
 * is different for every conversation. A person cannot bookmark that. So this
 * process does the discovering: it scans for address files, asks each host
 * whether it is alive, and serves a single fixed page that lists them all.
 * Open one bookmark, see every conversation running right now.
 *
 * The tokens stay here. A host authorises by possession of its 0600 address
 * file; this process can read those because it runs as the user who owns
 * them, and it proxies on the browser's behalf. Nothing secret reaches the
 * page, which is a better arrangement than the query-string token it replaces.
 *
 *   node imagine/viewport.mjs            → http://127.0.0.1:7788
 *   node imagine/viewport.mjs 9000       → another port
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const PORT = Number(process.argv[2] || process.env.IMAGINE_VIEWPORT_PORT || 7788);
const here = dirname(fileURLToPath(import.meta.url));

/** Every address file this machine might hold, newest first. */
function addressFiles() {
  const out = [];
  for (const root of [tmpdir(), '/tmp']) {
    try {
      for (const d of readdirSync(root)) {
        if (!d.startsWith('imagine-')) continue;
        const f = join(root, d, 'host.json');
        if (existsSync(f)) out.push(f);
      }
    } catch { /* unreadable root is not an error */ }
  }
  // The shared dev host, started by hand, uses the fixed default.
  const dflt = join(here, '.session', 'host.json');
  if (existsSync(dflt)) out.push(dflt);
  return out;
}

/**
 * Alive hosts, asked rather than assumed. A stale address file is the
 * ordinary residue of a conversation that ended — it is not an error and
 * must not be presented as one.
 */
async function discover() {
  const seen = new Map();
  await Promise.all(addressFiles().map(async (f) => {
    let addr;
    try { addr = JSON.parse(readFileSync(f, 'utf8')); } catch { return; }
    if (!addr?.base || seen.has(addr.base)) return;
    try {
      const r = await fetch(`${addr.base}/`, { signal: AbortSignal.timeout(1200) });
      if (!r.ok) return;
      const hello = await r.json();
      seen.set(addr.base, {
        base: addr.base,
        token: addr.token,
        session: addr.session ?? hello.session?.actor ?? 'unknown',
        pid: addr.pid,
        port: Number(new URL(addr.base).port),
        mode: hello.mode,
        build: hello.build,
        startedAt: addr.startedAt,
        entries: hello.session?.entries ?? null,
        addressFile: f,
      });
    } catch { /* not answering: a dead host, correctly omitted */ }
  }));
  return [...seen.values()].sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
}

let hosts = [];
async function refresh() { try { hosts = await discover(); } catch { /* keep the last good list */ } }
await refresh();
setInterval(refresh, 3000);

const byId = (id) => hosts.find((h) => h.session === id || String(h.port) === String(id));

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(PAGE);
  }

  if (url.pathname === '/api/hosts') {
    res.writeHead(200, { 'content-type': 'application/json' });
    // Tokens are deliberately stripped: the browser never needs one.
    return res.end(JSON.stringify(hosts.map(({ token: _t, ...h }) => h)));
  }

  if (url.pathname === '/api/stream') {
    const h = byId(url.searchParams.get('session'));
    if (!h) { res.writeHead(404); return res.end('no such live host'); }
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    try {
      const upstream = await fetch(`${h.base}/session/stream?from=start&token=${encodeURIComponent(h.token)}`);
      const reader = upstream.body.getReader();
      req.on('close', () => reader.cancel().catch(() => {}));
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } catch {
      res.write(`event: gone\ndata: {}\n\n`);
    }
    return res.end();
  }

  if (url.pathname === '/api/note' && req.method === 'POST') {
    const h = byId(url.searchParams.get('session'));
    if (!h) { res.writeHead(404); return res.end('{"error":"no such live host"}'); }
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 64_000) req.destroy(); });
    req.on('end', async () => {
      try {
        const r = await fetch(`${h.base}/session/note`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-imagine-token': h.token },
          body,
        });
        const text = await r.text();
        res.writeHead(r.status, { 'content-type': 'application/json' });
        res.end(text);
      } catch (e) {
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: String(e.message) }));
      }
    });
    return;
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Symbia Imagine viewport — http://127.0.0.1:${PORT}`);
  console.log(`  ${hosts.length} live host${hosts.length === 1 ? '' : 's'} right now; the list refreshes itself.`);
  console.log('  Open a new conversation with the plugin and it appears here on its own.\n');
});

const PAGE = `<!doctype html><meta charset="utf-8"><title>Symbia Imagine — viewport</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0e0e10;color:#e8e6e0;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;display:flex;height:100vh;overflow:hidden}
aside{width:290px;border-right:1px solid #26262b;display:flex;flex-direction:column;flex-shrink:0}
aside h1{font-size:12px;margin:0;padding:14px 16px 10px;letter-spacing:.06em;text-transform:uppercase;color:#8a8a94;font-weight:600}
#hosts{overflow:auto;flex:1}
.host{padding:11px 16px;border-bottom:1px solid #1c1c20;cursor:pointer;border-left:2px solid transparent}
.host:hover{background:#151519}
.host.on{background:#17171c;border-left-color:#89b482}
.host .id{color:#e8e6e0}
.host .meta{color:#6e6e78;font-size:11.5px;margin-top:2px}
.live{display:inline-block;width:6px;height:6px;border-radius:50%;background:#89b482;margin-right:6px;vertical-align:middle}
.empty{padding:16px;color:#6e6e78;line-height:1.7}
main{flex:1;display:flex;flex-direction:column;min-width:0}
header{padding:12px 18px;border-bottom:1px solid #26262b;display:flex;gap:18px;align-items:baseline;flex-wrap:wrap}
header b{font-weight:600}
.dim{color:#7a7a84}
#feed{flex:1;overflow:auto;padding:6px 18px}
.ev{padding:3px 0;border-bottom:1px solid #17171a;display:flex;gap:10px;align-items:baseline}
.seq{color:#54545e;min-width:54px;text-align:right;flex-shrink:0}
.kind{min-width:172px;flex-shrink:0}
.mut{color:#d8a657}.note{color:#a9b8ff}.open{color:#89b482}.seal{color:#d3869b}.close{color:#e78a4e}
.ok{color:#89b482}.bad{color:#ea6962}
.detail{color:#b6b4ae;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
footer{border-top:1px solid #26262b;padding:10px 18px;display:flex;gap:8px;align-items:center}
input{flex:1;background:#0e0e10;border:1px solid #33333b;color:#e8e6e0;padding:9px 11px;border-radius:5px;font:inherit}
input:focus{outline:none;border-color:#4a4a56}
button{background:#26262c;border:1px solid #3a3a44;color:#e8e6e0;padding:9px 15px;border-radius:5px;cursor:pointer;font:inherit}
button:hover{background:#31313a}
button:disabled{opacity:.4;cursor:default}
#said{padding:0 18px 8px;color:#7a7a84;min-height:18px;font-size:12px}
</style>
<aside>
  <h1>Live conversations</h1>
  <div id="hosts"><div class="empty">Looking for hosts…</div></div>
</aside>
<main>
  <header>
    <b id="title">No host selected</b>
    <span class="dim" id="sub">Every conversation that loads the plugin appears on the left, by itself.</span>
    <span class="dim" id="count"></span>
  </header>
  <div id="feed"></div>
  <div id="said"></div>
  <footer>
    <input id="note" placeholder="Attest something into this session's chain — it becomes a signed, sequenced event" autocomplete="off" disabled>
    <button id="send" disabled>Sign into the ledger</button>
  </footer>
</main>
<script>
let current = null, es = null, n = 0;
const feed = document.getElementById("feed");
const cls = t => t.includes("mutation") ? "mut" : t.includes("note") ? "note"
  : t.includes("opened") ? "open" : t.includes("sealed") ? "seal" : t.includes("closed") ? "close" : "";

function esc(s){ return String(s).replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }

function add(e){
  const p = e.payload || {};
  let detail;
  if (e.event_type === "imagine.mutation") {
    detail = '<span class="' + (p.accepted ? "ok" : "bad") + '">' + esc(p.method||"") + " " + esc(p.status||"") + "</span> " + esc(p.path||"");
  } else if (e.event_type === "imagine.observer.note") {
    detail = "\\u201c" + esc(p.note||"") + "\\u201d";
  } else {
    detail = esc(Object.entries(p).filter(([k])=>k!=="seq"&&k!=="does_not_assert")
      .map(([k,v])=>k+"="+(typeof v==="object"?JSON.stringify(v):v)).join(" ").slice(0,240));
  }
  const row = document.createElement("div");
  row.className = "ev";
  row.innerHTML = '<span class="seq">#'+(p.seq??"")+'</span><span class="kind '+cls(e.event_type)+'">'
    + esc(e.event_type.replace("imagine.",""))+'</span><span class="detail">'+detail+'</span>';
  const bottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 50;
  feed.appendChild(row);
  if (bottom) feed.scrollTop = feed.scrollHeight;
  document.getElementById("count").textContent = (++n) + " events";
}

function select(h){
  current = h.session;
  n = 0; feed.innerHTML = "";
  document.getElementById("title").textContent = h.session;
  document.getElementById("sub").textContent = "port " + h.port + " · pid " + h.pid + " · " + (h.mode||"?") + " · build " + (h.build||"?");
  document.getElementById("note").disabled = false;
  document.getElementById("send").disabled = false;
  document.getElementById("said").textContent = "";
  if (es) es.close();
  es = new EventSource("/api/stream?session=" + encodeURIComponent(h.session));
  es.onmessage = ev => { try { add(JSON.parse(ev.data)); } catch {} };
  es.addEventListener("gone", () => { document.getElementById("sub").textContent += " — stream ended"; });
  paint();
}

let hosts = [];
async function poll(){
  try {
    const r = await fetch("/api/hosts");
    hosts = await r.json();
    if (current && !hosts.some(h => h.session === current)) {
      document.getElementById("sub").textContent += " — this host has gone (its conversation ended)";
      document.getElementById("note").disabled = true;
      document.getElementById("send").disabled = true;
    }
    if (!current && hosts.length === 1) select(hosts[0]);
    paint();
  } catch {}
}
function paint(){
  const el = document.getElementById("hosts");
  if (hosts.length === 0){
    el.innerHTML = '<div class="empty">No imagine host is running.<br><br>Open a conversation with the plugin loaded and it will appear here within a few seconds.</div>';
    return;
  }
  el.innerHTML = hosts.map(h =>
    '<div class="host'+(h.session===current?" on":"")+'" data-s="'+esc(h.session)+'">'
    + '<div class="id"><span class="live"></span>'+esc(String(h.session).split(":").pop())+'</div>'
    + '<div class="meta">port '+h.port+' · pid '+h.pid+(h.entries!=null?' · '+h.entries+' events':'')+'</div></div>').join("");
  [...el.querySelectorAll(".host")].forEach(d =>
    d.onclick = () => select(hosts.find(h => h.session === d.dataset.s)));
}
async function send(){
  const el = document.getElementById("note");
  const note = el.value.trim();
  if (!note || !current) return;
  el.value = "";
  const r = await fetch("/api/note?session=" + encodeURIComponent(current), {
    method: "POST", headers: {"content-type":"application/json"},
    body: JSON.stringify({ note, observer: "human observer" })
  });
  const b = await r.json().catch(()=>({}));
  document.getElementById("said").textContent = r.ok
    ? "signed into the chain at seq " + b.seq + " \\u2014 " + String(b.checksum||"").slice(0,26) + "\\u2026"
    : "refused: " + (b.error || r.status);
}
document.getElementById("send").onclick = send;
document.getElementById("note").addEventListener("keydown", e => { if (e.key === "Enter") send(); });
poll(); setInterval(poll, 3000);
</script>`;
