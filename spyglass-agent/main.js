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

ipcMain.on('quit', () => app.quit());

app.whenReady().then(createOverlay);
app.on('window-all-closed', () => app.quit());
