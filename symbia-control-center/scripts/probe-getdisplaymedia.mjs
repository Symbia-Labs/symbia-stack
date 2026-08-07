#!/usr/bin/env node
/**
 * Which Chrome launch configuration can actually hand over pixels?
 *
 * NotReadableError came back from both headless and headful with the first
 * flag set, and "screen capture just doesn't work under automation" is exactly
 * the conclusion to distrust after one failure. This tries the plausible
 * configurations against a real trusted click and reports what each one says.
 *
 * It reports the DOMException name and message per variant. It does not decide
 * which is correct.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const TITLE = 'Symbia Control Center';
const BASE = process.argv[2] || 'http://localhost:8000';

const variants = [
  { name: 'A tab-by-title, headful', headless: false, args: [`--auto-select-tab-capture-source-by-title=${TITLE}`] },
  { name: 'B desktop=Entire screen, headful', headless: false, args: ['--auto-select-desktop-capture-source=Entire screen'] },
  { name: 'C desktop=title, headful', headless: false, args: [`--auto-select-desktop-capture-source=${TITLE}`] },
  { name: 'D tab-by-title + fake-ui, headful', headless: false, args: [`--auto-select-tab-capture-source-by-title=${TITLE}`, '--use-fake-ui-for-media-stream'] },
  { name: 'E tab-by-title, headless=new', headless: 'new', args: [`--auto-select-tab-capture-source-by-title=${TITLE}`] },
  { name: 'F no preferCurrentTab, tab-by-title', headless: false, args: [`--auto-select-tab-capture-source-by-title=${TITLE}`], noPrefer: true },
];

for (const v of variants) {
  let b;
  try {
    b = await puppeteer.launch({ headless: v.headless, args: ['--no-sandbox', ...v.args] });
    const p = await b.newPage();
    await p.goto(`${BASE}/overview`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 2500));
    await p.evaluate((noPrefer) => {
      const btn = document.createElement('button');
      btn.id = 'probe';
      btn.textContent = 'probe';
      btn.style.cssText = 'position:fixed;top:0;left:0;z-index:99999';
      btn.onclick = async () => {
        try {
          const opts = { video: { frameRate: 5 } };
          if (!noPrefer) opts.preferCurrentTab = true;
          const s = await navigator.mediaDevices.getDisplayMedia(opts);
          const t = s.getVideoTracks()[0];
          const st = t.getSettings();
          window.__probe = { ok: true, surface: st.displaySurface, w: st.width, h: st.height };
          s.getTracks().forEach((x) => x.stop());
        } catch (e) {
          window.__probe = { ok: false, name: e.name, message: e.message };
        }
      };
      document.body.appendChild(btn);
    }, Boolean(v.noPrefer));
    await p.click('#probe');
    await new Promise((r) => setTimeout(r, 5000));
    const res = await p.evaluate(() => window.__probe ?? { ok: null, note: 'no result yet' });
    console.log(v.name.padEnd(40), JSON.stringify(res));
  } catch (e) {
    console.log(v.name.padEnd(40), 'DRIVE ERROR', String(e).slice(0, 140));
  } finally {
    await b?.close();
  }
}
