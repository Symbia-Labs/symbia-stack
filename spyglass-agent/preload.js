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
  // Video: open a clip, append each recorder segment (hashed and chained as it
  // lands), close and get the receipt.
  videoOpen: (meta) => ipcRenderer.invoke('video-open', meta),
  videoChunk: (clipId, bytes) => ipcRenderer.invoke('video-chunk', clipId, bytes),
  videoClose: (clipId) => ipcRenderer.invoke('video-close', clipId),
  quit: () => ipcRenderer.send('quit'),
});
