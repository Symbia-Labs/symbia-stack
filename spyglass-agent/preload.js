/**
 * Preload — the only bridge between the overlay renderer and the main process.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('spyglass', {
  screenSource: () => ipcRenderer.invoke('screen-source'),
  saveFrame: (dataUrl) => ipcRenderer.invoke('save-frame', dataUrl),
  // Flip the window between click-through (loupe hovers over your work) and
  // interactive (cursor is over the ring/toolbar).
  setInteractive: (yes) => ipcRenderer.send('interactive', yes),
  // Clips: open with a set of declared tracks, append each recorder segment to
  // its own track (hashed and chained as it lands), close and get the receipt.
  clipOpen: (meta) => ipcRenderer.invoke('clip-open', meta),
  clipChunk: (clipId, trackId, bytes) => ipcRenderer.invoke('clip-chunk', clipId, trackId, bytes),
  clipClose: (clipId) => ipcRenderer.invoke('clip-close', clipId),
  quit: () => ipcRenderer.send('quit'),
});
