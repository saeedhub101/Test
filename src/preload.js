'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('saeed', Object.freeze({
  windowAction: (action) => ipcRenderer.invoke('saeed:window-action', action),
  sendChatMessage: (text) => ipcRenderer.invoke('saeed:chat-send', text),
  listSkills: () => ipcRenderer.invoke('saeed:skills-list'),
  searchSkills: (query) => ipcRenderer.invoke('saeed:skills-search', query),
  saveSkill: (skill) => ipcRenderer.invoke('saeed:skills-save', skill),
  deleteSkill: (id) => ipcRenderer.invoke('saeed:skills-delete', id),
  closeSkills: () => ipcRenderer.invoke('saeed:skills-close'),
  setMicrophoneActive: (active) => ipcRenderer.invoke('saeed:stt-set', Boolean(active)),
  speak: (text) => ipcRenderer.invoke('saeed:tts-speak', text),
  speechFinished: () => ipcRenderer.invoke('saeed:tts-finished'),
  reportSpeechError: (message) => ipcRenderer.send('saeed:stt-error', message),
  onMicrophoneControl: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('saeed:stt-control', listener);
    return () => ipcRenderer.removeListener('saeed:stt-control', listener);
  },
  onSpeechRequest: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('saeed:tts-speak', listener);
    return () => ipcRenderer.removeListener('saeed:tts-speak', listener);
  },
  onSpeechStop: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback();
    ipcRenderer.on('saeed:tts-stop', listener);
    return () => ipcRenderer.removeListener('saeed:tts-stop', listener);
  },
  onVoiceError: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('saeed:voice-error', listener);
    return () => ipcRenderer.removeListener('saeed:voice-error', listener);
  },
  getChatHistory: () => ipcRenderer.invoke('saeed:chat-history'),
  getBrainProvider: () => ipcRenderer.invoke('saeed:brain-provider-get'),
  saveBrainProvider: (provider) => ipcRenderer.invoke('saeed:brain-provider-save', provider),
  clearChatHistory: () => ipcRenderer.invoke('saeed:brain-history-clear'),
  diagnostics: () => ipcRenderer.invoke('saeed:diagnostics'),
  assetStatus: () => ipcRenderer.invoke('saeed:asset-status'),
  readCharacterAsset: () => ipcRenderer.invoke('saeed:asset-read'),
  showCharacterContextMenu: () => ipcRenderer.send('saeed:character-context-menu'),
  getCharacterProfile: () => ipcRenderer.invoke('saeed:character-profile-get'),
  saveCharacterProfile: (profile) => ipcRenderer.invoke('saeed:character-profile-save', profile),
  getCharacterInfo: () => ipcRenderer.invoke('saeed:character-info'),
  reportCharacterInfo: (info) => ipcRenderer.send('saeed:character-info-update', info),
  onBehaviorEvent: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('saeed:behavior-event', listener);
    return () => ipcRenderer.removeListener('saeed:behavior-event', listener);
  },
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
