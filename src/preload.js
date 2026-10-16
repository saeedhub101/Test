'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('saeed', Object.freeze({
  windowAction: (action) => ipcRenderer.invoke('saeed:window-action', action),
  diagnostics: () => ipcRenderer.invoke('saeed:diagnostics'),
  assetStatus: () => ipcRenderer.invoke('saeed:asset-status'),
  showCharacterContextMenu: () => ipcRenderer.send('saeed:character-context-menu'),
  getSettings: () => ipcRenderer.invoke('saeed:settings-get'),
  updateSettings: (patch) => ipcRenderer.invoke('saeed:settings-update', patch),
  onSettingsChanged: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on('saeed:settings-changed', listener);
    return () => ipcRenderer.removeListener('saeed:settings-changed', listener);
  }
}));
