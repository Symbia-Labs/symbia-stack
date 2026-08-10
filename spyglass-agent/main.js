/**
 * Native spyglass — Electron main.
 *
 * A transparent, always-on-top, full-desktop aperture that floats over ANY
 * application — the ring drags over other apps and captures the real pixels
 * under it, the one thing a web page cannot do.
 *
 * The window is click-through by default (setIgnoreMouseEvents), so it behaves
 * like a loupe hovering over your work; the renderer flips it interactive only
 * while the cursor is over the ring or toolbar. Every capture is hashed, so
 * even standalone the frame carries a receipt — provenance from the first byte.
 *
 * Later milestones join this process to the Symbia mesh and push the frame down
 * the vision path. Where pixels may go (the pixel-gap) is enforced there, not
 * at capture.
 */
const { app, BrowserWindow, ipcMain, desktopCapturer, screen, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

let overlay = null;

function createOverlay() {
  const primary = screen.getPrimaryDisplay();
  const { x, y, width, height } = primary.bounds;

  overlay = new BrowserWindow({
    x, y, width, height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Click-through by default so the desktop underneath stays fully usable while
  // the loupe floats. `forward:true` keeps mousemove flowing to the renderer,
  // which flips the window interactive ONLY while the cursor is over the ring or
  // HUD — so you can grab the ring, and click straight through everywhere else.
  overlay.setIgnoreMouseEvents(true, { forward: true });
  // There is no on-screen chrome, so the renderer's account of what it did is
  // the only running record. Forward it to stdout rather than leaving it in a
  // devtools window nobody has open.
  overlay.webContents.on('console-message', (_e, _level, message) => {
    console.log(message);
  });
  overlay.loadFile('overlay.html');
}

ipcMain.on('interactive', (_evt, yes) => {
  if (overlay) overlay.setIgnoreMouseEvents(!yes, { forward: true });
});

ipcMain.handle('screen-source', async () => {
  const primary = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 0, height: 0 },
  });
  const match =
    sources.find((s) => String(s.display_id) === String(primary.id)) || sources[0];
  return {
    sourceId: match?.id ?? null,
    width: primary.size.width,
    height: primary.size.height,
    scaleFactor: primary.scaleFactor,
  };
});

// Save + hash the frame. The digest is the receipt: the exact bytes captured,
// committed to, before anything downstream ever looks at them.
ipcMain.handle('save-frame', async (_evt, dataUrl) => {
  const img = nativeImage.createFromDataURL(dataUrl);
  const png = img.toPNG();
  const digest = crypto.createHash('sha256').update(png).digest('hex');
  const dir = path.join(os.tmpdir(), 'symbia-spyglass');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `frame-${digest.slice(0, 12)}.png`);
  fs.writeFileSync(file, png);
  return { file, bytes: png.length, digest };
});

// --- video: scan-and-append ------------------------------------------------
// A clip is not stored to be reconstructed from its ledger; it is stored so it
// can be stamped reliably. Each recorder segment is hashed as it arrives and
// chained to its parent — chain(n) = sha256(chain(n-1) || digest(n)) — so the
// head commits to every byte in order. Altering, dropping or reordering any
// segment breaks the chain from that point forward, and the break is local:
// the surviving prefix stays verifiable.
//
// The sidecar is GKS Lineage, and it obeys the primitive's rules: append-only,
// strictly ordered, identity-scoped, parent-linked, verifiable by checksum, and
// NON-EPISTEMIC. The payload carries digests, byte counts and geometry — never
// a frame, never a sample. Reading the whole ledger tells you exactly what was
// captured and in what order, and shows you none of it.
//
// JSONL, per the project's dev-persistence constraint.
const clips = new Map();

function lineageLine(ev) {
  // Deterministic key ordering — the serialization must hash the same way
  // everywhere, so key order is fixed here rather than left to the object.
  return JSON.stringify({
    event_id: ev.event_id,
    timestamp: ev.timestamp,
    actor_identity: ev.actor_identity,
    event_type: ev.event_type,
    payload: ev.payload,
    continuity_context: ev.continuity_context,
    parent_links: ev.parent_links,
    checksum: ev.checksum,
  }) + '\n';
}

ipcMain.handle('video-open', async (_evt, meta) => {
  const clipId = crypto.randomBytes(8).toString('hex');
  const dir = path.join(os.tmpdir(), 'symbia-spyglass', `clip-${clipId}`);
  fs.mkdirSync(dir, { recursive: true });
  const clip = {
    clipId,
    dir,
    video: path.join(dir, 'clip.webm'),
    ledger: path.join(dir, 'lineage.jsonl'),
    actor: `spyglass:agent:${crypto.createHash('sha256').update(os.hostname()).digest('hex').slice(0, 8)}`,
    seq: 0,
    bytes: 0,
    // Genesis: the chain starts from the zero hash, so segment 1 has a parent
    // like every other segment and no segment is a special case.
    chain: '0'.repeat(64),
    startedAt: Date.now(),
    lastEventId: null,
  };
  clip.videoFd = fs.openSync(clip.video, 'a');
  clip.ledgerFd = fs.openSync(clip.ledger, 'a');

  const ev = {
    event_id: `event:${clipId}:0`,
    timestamp: new Date().toISOString(),
    actor_identity: clip.actor,
    event_type: 'capture.clip.open',
    payload: {
      clip_id: clipId,
      media_type: meta?.mimeType ?? 'video/webm',
      frame: meta?.frame ?? null,       // capture geometry in device pixels
      aperture: meta?.aperture ?? null, // ring geometry in points
    },
    continuity_context: { clip: clipId },
    parent_links: [],
    checksum: `sha256:${clip.chain}`,
  };
  fs.writeSync(clip.ledgerFd, lineageLine(ev));
  clip.lastEventId = ev.event_id;
  clips.set(clipId, clip);
  return { clipId, dir, video: clip.video, ledger: clip.ledger };
});

ipcMain.handle('video-chunk', async (_evt, clipId, bytes) => {
  const clip = clips.get(clipId);
  if (!clip) throw new Error('unknown clip: ' + clipId);
  const buf = Buffer.from(bytes);
  const digest = crypto.createHash('sha256').update(buf).digest('hex');
  // Chain over the PARENT chain value and this segment's digest, in that order.
  clip.chain = crypto.createHash('sha256')
    .update(Buffer.from(clip.chain, 'hex'))
    .update(Buffer.from(digest, 'hex'))
    .digest('hex');
  clip.seq += 1;
  clip.bytes += buf.length;
  fs.writeSync(clip.videoFd, buf);

  const ev = {
    event_id: `event:${clip.clipId}:${clip.seq}`,
    timestamp: new Date().toISOString(),
    actor_identity: clip.actor,
    event_type: 'capture.segment',
    payload: {
      clip_id: clip.clipId,
      seq: clip.seq,
      bytes: buf.length,
      digest: `sha256:${digest}`,
      offset: clip.bytes - buf.length,
    },
    continuity_context: { clip: clip.clipId },
    parent_links: [clip.lastEventId],
    checksum: `sha256:${clip.chain}`,
  };
  fs.writeSync(clip.ledgerFd, lineageLine(ev));
  clip.lastEventId = ev.event_id;
  return { seq: clip.seq, bytes: buf.length, digest, chain: clip.chain };
});

ipcMain.handle('video-close', async (_evt, clipId) => {
  const clip = clips.get(clipId);
  if (!clip) throw new Error('unknown clip: ' + clipId);
  const durationMs = Date.now() - clip.startedAt;
  const ev = {
    event_id: `event:${clip.clipId}:close`,
    timestamp: new Date().toISOString(),
    actor_identity: clip.actor,
    event_type: 'capture.clip.close',
    payload: {
      clip_id: clip.clipId,
      segments: clip.seq,
      bytes: clip.bytes,
      duration_ms: durationMs,
      // The head commits to every segment, in order. This is the receipt for
      // the clip as a whole.
      chain_head: `sha256:${clip.chain}`,
    },
    continuity_context: { clip: clip.clipId },
    parent_links: [clip.lastEventId],
    checksum: `sha256:${clip.chain}`,
  };
  fs.writeSync(clip.ledgerFd, lineageLine(ev));
  fs.closeSync(clip.videoFd);
  fs.closeSync(clip.ledgerFd);
  clips.delete(clipId);
  return {
    clipId: clip.clipId, dir: clip.dir, video: clip.video, ledger: clip.ledger,
    segments: clip.seq, bytes: clip.bytes, durationMs, chain: clip.chain,
  };
});

ipcMain.on('quit', () => app.quit());

app.whenReady().then(createOverlay);
app.on('window-all-closed', () => app.quit());
