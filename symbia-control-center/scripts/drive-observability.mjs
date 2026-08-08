#!/usr/bin/env node
/**
 * Does every service's observation dashboard actually show data?
 *
 * Events on the bus are not the same claim. The panel filters them by matching
 * the event source against the service id, and that matcher is its own piece of
 * code with its own ways to be wrong — a service could be emitting perfectly
 * and still show an empty screen because the name it emits under is not the
 * name the panel looks for.
 *
 * So this opens the real panel for each service in a real browser and reads the
 * counts off the screen.
 *
 *   node scripts/drive-observability.mjs [baseUrl]
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const BASE = process.argv[2] || 'http://localhost:8000';
const SERVICES = [
  'identity',
  'logging',
  'catalog',
  'assistants',
  'messaging',
  'runtime',
  'integrations',
  'models',
  'network',
];

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1700, height: 1100 });

await page.goto(`${BASE}/overview`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise((r) => setTimeout(r, 5000));

// Generate a little traffic so a genuinely idle service is not confused with a
// silent one.
await page.evaluate(async () => {
  const paths = [
    '/svc/identity/api/auth/me',
    '/svc/logging/api/logs/streams',
    '/svc/catalog/api/resources?limit=1',
    '/svc/assistants/api/assistants',
    '/svc/messaging/api/conversations',
    '/svc/runtime/api/components',
    '/svc/integrations/api/integrations/status',
    '/svc/models/api/vision/status',
    '/svc/network/api/sdn/topology',
  ];
  for (let i = 0; i < 3; i++) {
    await Promise.all(paths.map((p) => fetch(p).catch(() => undefined)));
  }
});
await new Promise((r) => setTimeout(r, 4000));

const results = [];

for (const svc of SERVICES) {
  // The panel is reached from Overview by clicking a service card. Deep-link
  // if the route supports it, otherwise click through.
  await page.goto(`${BASE}/overview`, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 2500));

  // Find the element whose text is EXACTLY the service name — the card title —
  // then walk up to whatever carries the click. Matching on "starts with" hit
  // the wrong element for `models` (nothing on Overview is titled "models"),
  // which is why that row read opened=false.
  const opened = await page.evaluate((name) => {
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    // EXCLUDE THE SIDEBAR.
    //
    // "Assistants", "Integrations" and "Network" are left-nav items as well as
    // service cards, and an exact-text search finds the nav first because it
    // comes earlier in the DOM. The script clicked the nav, landed on the
    // topology panel, found no event badge, and reported three healthy
    // services as broken — including the one service Brian had told me was
    // working. A selector that can hit two different things is a selector that
    // will eventually hit the wrong one.
    const nav = document.querySelector('nav, aside');
    const el = [...document.querySelectorAll('*')].find(
      (e) => (e.textContent || '').trim() === label && !(nav && nav.contains(e))
    );
    if (!el) return false;
    let n = el;
    for (let i = 0; i < 6 && n; i++) {
      if (n.onclick || n.getAttribute?.('role') === 'button' || n.tagName === 'BUTTON') break;
      n = n.parentElement;
    }
    (n || el).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return true;
  }, svc);

  await new Promise((r) => setTimeout(r, 3000));

  // Make traffic WHILE THIS PANEL IS OPEN.
  //
  // The panel is fed by the live event stream, not by event history, so it
  // shows what arrives while you are looking at it. The first version of this
  // script generated traffic once at the start and then walked nine panels in
  // sequence — by the time it reached the seventh, nothing had been sent to
  // that service for ninety seconds and its panel was legitimately empty. Four
  // healthy services were reported as broken by a script that had stopped
  // giving them anything to observe.
  await page.evaluate(async (name) => {
    const paths = {
      identity: '/svc/identity/api/auth/me',
      logging: '/svc/logging/api/logs/streams',
      catalog: '/svc/catalog/api/resources?limit=1',
      assistants: '/svc/assistants/api/assistants',
      messaging: '/svc/messaging/api/conversations',
      runtime: '/svc/runtime/api/components',
      integrations: '/svc/integrations/api/integrations/status',
      models: '/svc/models/api/vision/status',
      network: '/svc/network/api/sdn/topology',
    };
    const p = paths[name];
    if (!p) return;
    for (let i = 0; i < 6; i++) {
      await fetch(p).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 250));
    }
  }, svc);

  await new Promise((r) => setTimeout(r, 4000));

  const seen = await page.evaluate(() => {
    const text = document.body.innerText || '';
    const num = (re) => {
      const m = text.match(re);
      return m ? Number(m[1]) : null;
    };
    // The tab count is a BADGE on its own line — "Events\n61" — not
    // "Events (61)". The parenthesised form was a guess and it made nine
    // working panels report as nine empty ones, which is exactly the failure
    // this script exists to catch, aimed at the script.
    return {
      onPanel: /Back to Overview/.test(text),
      events: num(/\bEvents\s*\n\s*(\d+)/),
      logs: num(/\bLogs\s*\n\s*(\d+)/),
      emptyState: /will appear here once the service starts handling traffic/.test(text),
      heading: (text.split('\n').find((l) => l.trim().length > 2) || '').slice(0, 40),
    };
  });

  results.push({ svc, opened, ...seen });
}

await browser.close();

console.log('\nservice        opened  events  logs  emptyState');
let bad = 0;
for (const r of results) {
  const ok = r.opened && (r.events ?? 0) > 0;
  if (!ok) bad++;
  console.log(
    `${r.svc.padEnd(14)} ${String(r.opened).padEnd(7)} ${String(r.events ?? '-').padEnd(7)} ${String(
      r.logs ?? '-'
    ).padEnd(5)} ${r.emptyState}`
  );
}
console.log(`\n${results.length - bad}/${results.length} panels showing events.`);
console.log(
  'Reported, not concluded: "opened=false" may mean the card selector missed,\n' +
    'not that the panel is broken. Read it as "this run did not see data".'
);
process.exit(0);
