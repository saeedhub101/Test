'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('saeed', Object.freeze({
  windowAction: (action) => ipcRenderer.invoke('saeed:window-action', action),
  diagnostics: () => ipcRenderer.invoke('saeed:diagnostics'),
  assetStatus: () => ipcRenderer.invoke('saeed:asset-status'),
  showCharacterContextMenu: () => ipcRenderer.send('saeed:character-context-menu')
}));
