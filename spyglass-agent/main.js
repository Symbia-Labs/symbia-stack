/**
 * Native spyglass — Electron main.
 *
 * Milestone 1: the escape. A transparent, frameless, always-on-top overlay that
 * spans the whole primary display, so the aperture ring can be dragged over ANY
 * application — not just the control-center tab the browser confined it to. On
 * capture it grabs the real screen pixels under the ring and writes a PNG, which
 * proves the one thing a web page cannot do: see outside itself.
 *
 * Later milestones join this process to the Symbia mesh as a spyglass node and
 * push the frame down the same vision path the browser version already uses.
 * Nothing here decides where pixels go yet; that boundary (the pixel-gap) is
 * enforced when the vision call is wired, not at capture.
 */
const { app, BrowserWindow, ipcMain, desktopCapturer, screen, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

let overlay = null;

function createOverlay() {
  const primary = screen.getPrimaryDisplay();
  const { x, y, width, height } = primary.bounds;

  overlay = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    // The overlay floats above everything so the ring can point at other apps.
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    // macOS: sit above the menu bar / full-screen apps too.
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.loadFile('overlay.html');
}

// Renderer asks for the primary screen's capture source id + geometry so it can
// getUserMedia the whole display and crop the ring region itself.
ipcMain.handle('screen-source', async () => {
  const primary = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 0, height: 0 }, // no thumbnail — we stream via getUserMedia
  });
  // display_id matches on most platforms; fall back to the first screen.
  const match =
    sources.find((s) => String(s.display_id) === String(primary.id)) || sources[0];
  return {
    sourceId: match?.id ?? null,
    // Points, not pixels. The renderer scales the crop by the video's real
    // pixel dimensions (Retina) vs these points.
    width: primary.size.width,
    height: primary.size.height,
    scaleFactor: primary.scaleFactor,
  };
});

// Renderer sends a cropped PNG data URL; main writes it and reports the path.
// Milestone-1 proof: the bytes exist, outside the browser, from another app.
ipcMain.handle('save-frame', async (_evt, dataUrl) => {
  const img = nativeImage.createFromDataURL(dataUrl);
  const dir = path.join(os.tmpdir(), 'symbia-spyglass');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `frame-${Date.now()}.png`);
  fs.writeFileSync(file, img.toPNG());
  return { file, bytes: img.toPNG().length };
});

ipcMain.on('quit', () => app.quit());

app.whenReady().then(createOverlay);

app.on('window-all-closed', () => app.quit());
