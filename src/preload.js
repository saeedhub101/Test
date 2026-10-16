'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('saeed', Object.freeze({
  windowAction: (action) => ipcRenderer.invoke('saeed:window-action', action),
  diagnostics: () => ipcRenderer.invoke('saeed:diagnostics'),
  assetStatus: () => ipcRenderer.invoke('saeed:asset-status'),
  showCharacterContextMenu: () => ipcRenderer.send('saeed:character-context-menu'),
  getCharacterProfile: () => ipcRenderer.invoke('saeed:character-profile-get'),
  saveCharacterProfile: (profile) => ipcRenderer.invoke('saeed:character-profile-save', profile),
  getCharacterInfo: () => ipcRenderer.invoke('saeed:character-info'),
  reportCharacterInfo: (info) => ipcRenderer.send('saeed:character-info-update', info),
  onCharacterProfileChanged: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, profile) => callback(profile);
    ipcRenderer.on('saeed:character-profile-changed', listener);
    return () => ipcRenderer.removeListener('saeed:character-profile-changed', listener);
  },
  onCharacterInfoChanged: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, info) => callback(info);
    ipcRenderer.on('saeed:character-info-changed', listener);
    return () => ipcRenderer.removeListener('saeed:character-info-changed', listener);
  },
  getSettings: () => ipcRenderer.invoke('saeed:settings-get'),
  updateSettings: (patch) => ipcRenderer.invoke('saeed:settings-update', patch),
  onSettingsChanged: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on('saeed:settings-changed', listener);
    return () => ipcRenderer.removeListener('saeed:settings-changed', listener);
  }
}));
