#!/usr/bin/env node
/**
 * Browser verification for the rebuilt console.
 *
 * The project rule is that UX validation uses a browser, never curl: an API
 * call that succeeds while the button does nothing is the exact failure being
 * hunted. Every HTTP-level check in the rebuild doc is the kind of evidence
 * that rule exists to distrust.
 *
 * This drives a real Chromium, executes the bundle, and records what the page
 * does: console errors, failed requests, whether the root actually rendered,
 * and whether anything reaches a CDN.
 *
 * It records. It does not conclude. "Rendered 40 DOM nodes with no console
 * errors" is an observation; "the logs panel works" is an inference, and this
 * script is not entitled to make it.
 *
 *   node scripts/verify-browser.mjs [baseUrl]
 */
import { createRequire } from 'node:module';
const puppeteer = createRequire('/tmp/x.js')('puppeteer');
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:8000';
const OUT = '/tmp/cc-verify';
mkdirSync(OUT, { recursive: true });

const ROUTES = ['/overview', '/network', '/assistants', '/integrations', '/logs', '/chat', '/energy'];

const results = [];

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

for (const route of ROUTES) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });

  const consoleErrors = [];
  const pageErrors = [];
  const failed = [];
  const cdn = [];
  const svcCalls = new Map();

  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
  page.on('requestfailed', (r) => failed.push(`${r.method()} ${r.url().slice(0, 120)} — ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    const u = r.url();
    if (/jsdelivr|unpkg|cdnjs|googleapis|gstatic/.test(u)) cdn.push(`${r.status()} ${u.slice(0, 120)}`);
    const m = u.match(/\/svc\/([^/]+)(\/[^?]*)/);
    if (m) svcCalls.set(`${r.status()} /svc/${m[1]}${m[2]}`.slice(0, 110), true);
  });

  let nav = 'ok';
  try {
    await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (e) {
    nav = `NAV FAILED: ${e.message.slice(0, 120)}`;
  }

  // Give client-side data fetching a moment past networkidle.
  await new Promise((r) => setTimeout(r, 3000));

  const dom = await page.evaluate(() => {
    const root = document.getElementById('root');
    const text = (document.body.innerText || '').trim();
    return {
      url: location.pathname,
      rootChildren: root ? root.children.length : 0,
      nodeCount: root ? root.querySelectorAll('*').length : 0,
      // Is anything actually painted, or is this an empty shell?
      visibleText: text.slice(0, 400),
      textLength: text.length,
      title: document.title,
    };
  });

  const shot = `${OUT}${route.replace(/\//g, '_') || '_root'}.png`;
  await page.screenshot({ path: shot, fullPage: false });

  results.push({ route, nav, dom, consoleErrors, pageErrors, failed, cdn, svc: [...svcCalls.keys()].sort(), shot });
  await page.close();
}

await browser.close();

writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 2));

for (const r of results) {
  console.log(`\n${'='.repeat(70)}\n${r.route}  ->  ${r.dom.url}   [${r.nav}]`);
  console.log(`  rendered: ${r.dom.nodeCount} nodes, ${r.dom.textLength} chars of text`);
  console.log(`  text: ${JSON.stringify(r.dom.visibleText.slice(0, 220))}`);
  if (r.cdn.length) console.log(`  CDN REQUESTS: ${r.cdn.join(' | ')}`);
  else console.log('  CDN requests: none');
  if (r.svc.length) console.log(`  /svc calls:\n    ${r.svc.join('\n    ')}`);
  else console.log('  /svc calls: NONE');
  if (r.pageErrors.length) console.log(`  PAGE ERRORS:\n    ${r.pageErrors.join('\n    ')}`);
  if (r.consoleErrors.length) console.log(`  console errors:\n    ${r.consoleErrors.slice(0, 6).join('\n    ')}`);
  if (r.failed.length) console.log(`  failed requests:\n    ${r.failed.slice(0, 6).join('\n    ')}`);
}
console.log(`\nScreenshots + report.json in ${OUT}`);
