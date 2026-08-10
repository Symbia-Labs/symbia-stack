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
  quit: () => ipcRenderer.send('quit'),
});
