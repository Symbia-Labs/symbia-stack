#!/usr/bin/env node
/**
 * Drive the spyglass end to end in a real browser.
 *
 * getDisplayMedia needs a user gesture and a native picker, which is why every
 * commit so far has said the capture path was unexercised. Chrome can be told
 * to auto-select a capture source from the command line, which removes the
 * picker without removing the gesture — the click is still a real trusted
 * click on the real button.
 *
 * It drives the UI, not the functions. Calling capture() directly would test
 * my code and skip the thing that has broken twice: a button that does nothing
 * while the API underneath works.
 *
 *   node scripts/drive-spyglass.mjs [baseUrl]
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const BASE = process.argv[2] || 'http://localhost:8000';

const log = [];
const say = (s) => {
  console.log(s);
  log.push(s);
};

const browser = await puppeteer.launch({
  headless: 'new',
  args: [
    '--no-sandbox',
    // Auto-answer the picker with THIS tab. The gesture is still required and
    // still real; only the native chooser is bypassed.
    //
    // The title must match the document title EXACTLY — measured
    // "Symbia Control Center". A substring did not match.
    '--auto-select-tab-capture-source-by-title=Symbia Control Center',
    '--window-size=1600,1000',
  ],
  // NOTE THE FLAG THAT IS NOT HERE: --use-fake-ui-for-media-stream.
  //
  // It was in the first three runs and it is what broke them. Measured across
  // six launch configurations (scripts/probe-getdisplaymedia.mjs): identical
  // setups succeed without it and fail with it, NotReadableError "Could not
  // start video source". It auto-accepts getUserMedia prompts and substitutes
  // a fake device that display capture cannot read.
  //
  // The wrong lesson was available at every step: headless cannot capture
  // (it can — variant E), or macOS is withholding screen permission (it is
  // not — variant A works). Both would have been believed if the run had
  // stopped at the first failure.
});

const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });

const consoleLines = [];
page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text().slice(0, 300)}`));
page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${String(e).slice(0, 300)}`));

const calls = [];
page.on('response', (r) => {
  const u = r.url();
  if (/\/svc\/(integrations|models|network)\//.test(u)) {
    calls.push(`${r.status()} ${u.replace(BASE, '').slice(0, 110)}`);
  }
});

await page.goto(`${BASE}/overview`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise((r) => setTimeout(r, 4000));

// Grant screen capture up front so the prompt cannot be what fails.
const ctx = browser.defaultBrowserContext();
await ctx.overridePermissions(BASE, ['camera', 'microphone']).catch(() => {});

async function clickByText(selector, text) {
  const handles = await page.$$(selector);
  for (const h of handles) {
    const t = await page.evaluate(
      (el) => `${el.textContent || ''} ${el.getAttribute('title') || ''} ${el.getAttribute('aria-label') || ''}`,
      h
    );
    if (t.includes(text)) {
      await h.click();
      return true;
    }
  }
  return false;
}

// 1. Open chat — the spyglass switch lives in its header.
say(`opened chat nav: ${await clickByText('button, a', 'Chat')}`);
await new Promise((r) => setTimeout(r, 1500));

// 2. Open the spyglass.
const openedGlass = await clickByText('button', 'Spyglass —');
say(`opened spyglass: ${openedGlass}`);
await new Promise((r) => setTimeout(r, 1200));

// 3. Choose a source (arms the capture), then capture.
const chose = await clickByText('button', 'Choose a source');
say(`clicked "Choose a source": ${chose}`);
await new Promise((r) => setTimeout(r, 3000));

const captured = await clickByText('button', 'Capture');
say(`clicked "Capture": ${captured}`);

// The shutter blinks 180ms, then publishes, then asks the model. Anthropic
// took ~1.6s on a 64x64; a real frame is bigger.
await new Promise((r) => setTimeout(r, 20000));

const state = await page.evaluate(() => {
  const text = document.body.innerText || '';
  const grab = (re) => (text.match(re) || [])[0] || null;
  // The whole composer chip, so the model's own sentence is visible rather
  // than just the arena label. An arena with no description behind it is the
  // shape of a pass that has not been read.
  const chip = [...document.querySelectorAll('div')].find((d) =>
    /^Frame [0-9a-f]{8,}/.test((d.innerText || '').trim())
  );
  return {
    frameLine: grab(/Frame [0-9a-f]{8,}[^\n]*/),
    arenaLine: grab(/(COMPOSED|REFUSED)[^\n]*/),
    chipText: chip ? chip.innerText.trim().slice(0, 500) : null,
    apertureNote: grab(/(Attached to your next message|Nowhere clear|Capture did not start|Sharing stopped)[^\n]*/),
  };
});

say('');
say(`frame:   ${state.frameLine ?? '(none)'}`);
say(`arena:   ${state.arenaLine ?? '(none)'}`);
say(`note:    ${state.apertureNote ?? '(none)'}`);
say('');
say('composer chip:');
say(state.chipText ? state.chipText.split('\n').map((l) => `  | ${l}`).join('\n') : '  (none)');
// 4. Send a message with the frame attached, and read what comes back.
//
// This is the part that matters and the part that was never driven: the
// capture succeeded for a day while the assistant answered "I'm not sure what
// context you're referring to", because the attachment reached the message and
// never reached the prompt.
const QUESTION = 'what am I looking at in the capture?';
const typed = await page.evaluate((q) => {
  const ta = [...document.querySelectorAll('textarea')].find(
    (t) => (t.placeholder || '').toLowerCase().includes('message')
  );
  if (!ta) return false;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value'
  ).set;
  setter.call(ta, q);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}, QUESTION);
say(`typed question: ${typed}`);

if (typed) {
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => {
    const ta = [...document.querySelectorAll('textarea')].find(
      (t) => (t.placeholder || '').toLowerCase().includes('message')
    );
    ta?.focus();
  });
  await page.keyboard.press('Enter');
  say('sent, waiting for a reply...');
  await new Promise((r) => setTimeout(r, 45000));

  const reply = await page.evaluate((q) => {
    const text = document.body.innerText || '';
    const at = text.indexOf(q);
    return at === -1 ? null : text.slice(at + q.length, at + q.length + 900).trim();
  }, QUESTION);
  say('');
  say('assistant reply after the question:');
  say(reply ? reply.split('\n').filter(Boolean).slice(0, 12).map((l) => `  > ${l}`).join('\n') : '  (none)');
}

say('');
say('service calls:');
for (const c of [...new Set(calls)]) say(`  ${c}`);
say('');
say('console:');
for (const c of consoleLines.slice(-25)) say(`  ${c}`);

await page.screenshot({ path: '/tmp/spyglass-drive.png' });
say('');
say('screenshot: /tmp/spyglass-drive.png');

await browser.close();

// Report, do not conclude. Whether this is a pass is a judgement about what
// COMPOSED means here, and belongs to the reader.
process.exit(0);
