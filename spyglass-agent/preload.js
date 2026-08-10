/**
 * Preload — the only bridge between the overlay renderer and the main process.
 * Deliberately tiny: request the screen source, save a captured frame, quit.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('spyglass', {
  screenSource: () => ipcRenderer.invoke('screen-source'),
  saveFrame: (dataUrl) => ipcRenderer.invoke('save-frame', dataUrl),
  quit: () => ipcRenderer.send('quit'),
});
