#!/usr/bin/env node
/**
 * Chat round trip — send a message from the browser and record what comes back.
 *
 * OBSERVATION ONLY. It records the writes that left the page, whether an
 * assistant produced anything, and what the window shows. It does not decide
 * whether the answer was good; that is not a thing a script can know.
 *
 * Exists because every earlier check of this path was a GET. The proxy dropped
 * request bodies for the whole rebuild and nothing noticed, because a write
 * that hangs reads as a slow network.
 */
import { createRequire } from 'node:module';
const puppeteer = createRequire(import.meta.url)('puppeteer');

const BASE = process.argv[2] || 'http://localhost:8000';
const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.setViewport({ width: 1600, height: 1000 });

const writes = [], log = [];
p.on('response', (r) => {
  const m = r.request().method();
  if (['POST','PATCH','PUT'].includes(m) && r.url().includes('/svc/') && !r.url().includes('socket.io'))
    writes.push(`${r.status()} ${m} ${r.url().split('/svc/')[1].split('?')[0]}`);
});
p.on('console', (m) => {
  const t = m.text();
  if (t.startsWith('[Chat]') || m.type() === 'error') log.push(t.slice(0, 130));
});

await p.goto(`${BASE}/overview`, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise((r) => setTimeout(r, 2500));
await p.evaluate(() => [...document.querySelectorAll('button,a')].find((e) => e.textContent.trim() === 'Chat')?.click());
await new Promise((r) => setTimeout(r, 3000));

const ta = await p.$('[role="dialog"] textarea');
if (!ta) { console.log('NO COMPOSER — window did not open'); await b.close(); process.exit(1); }
await ta.click();
await ta.type('Which services are running?');
await p.keyboard.press('Enter');

let sawActivity = false;
for (let i = 0; i < 8; i++) {
  await new Promise((r) => setTimeout(r, 4000));
  const t = await p.evaluate(() => document.querySelector('[role="dialog"]')?.innerText || '');
  if (/Responding|Coordinator|Analyst/i.test(t)) { sawActivity = true; break; }
}

await p.screenshot({ path: '/tmp/rt.png' });
const text = await p.evaluate(() => document.querySelector('[role="dialog"]')?.innerText || '');
console.log('WRITES FROM THE PAGE:', writes.length ? writes : 'NONE');
console.log('assistant activity rendered:', sawActivity);
console.log('chat log:', log.slice(0, 6));
console.log('window text:', JSON.stringify(text.slice(0, 400)));
await b.close();
process.exit(0);
