'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ipcMain, dialog, BrowserWindow, app } = require('electron');

function registerIpcHandlers(deps) {
  const {
    lifecycle, getWindows, getSettings, updateSettings, getCharacterInfo,
    setCharacterInfo, brain, stores, getProcessMetrics, hideCharacter
  } = deps;
  const { getCharacterProfileStore, getModelStore, getAccessoryStore, getAddonStore, getSkillStore } = stores;
  const registered = [];
  const windows = () => getWindows().filter(win => win && !win.isDestroyed());
  function assertTrusted(event) {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || !windows().includes(win)) throw new Error('Untrusted IPC sender');
    return win;
  }
  function handle(channel, callback) {
    ipcMain.handle(channel, async (event, ...args) => {
      assertTrusted(event);
      return callback(event, ...args);
    });
    registered.push(channel);
  }
  function on(channel, callback) {
    ipcMain.on(channel, (event, ...args) => {
      try { assertTrusted(event); callback(event, ...args); }
      catch (error) { console.error('[ipc]', channel, error); }
    });
    registered.push(channel);
  }
  const getProfileStore = () => getCharacterProfileStore();
  const getModels = () => getModelStore();
  const getAccessories = () => getAccessoryStore();
  const getAddons = () => getAddonStore();
  const getSkills = () => getSkillStore();
  const dataPath = () => app.getPath('userData');

  handle('saeed:window-action', async (_event, action) => {
    switch (action) {
      case 'show-character': return lifecycle.acquire('character', 'tray-character', 'IPC show character');
      case 'hide-character': return hideCharacter('IPC hide character');
      case 'open-chat': return lifecycle.acquire('chat', 'chat-window', 'IPC open chat');
      case 'close-chat': return lifecycle.release('chat', 'chat-window', 'IPC close chat');
      case 'open-character-settings': return lifecycle.acquire('character-settings', 'character-settings-window', 'IPC open character settings');
      case 'open-diagnostics': return lifecycle.acquire('diagnostics', 'diagnostics-window', 'IPC open diagnostics');
      default: throw new TypeError('Unknown window action');
    }
  });
  handle('saeed:chat-send', async (_event, text) => brain.send(text));
  handle('saeed:chat-history', () => brain.getHistory());
  handle('saeed:brain-provider-get', () => brain.getProvider());
  handle('saeed:brain-provider-save', (_event, provider) => brain.setProvider(provider));
  handle('saeed:brain-history-clear', () => brain.clearHistory());

  handle('saeed:stt-set', async (_event, active) => {
    if (typeof active !== 'boolean') throw new TypeError('Microphone state must be boolean');
    if (active) return lifecycle.acquire('stt', 'chat-mic', 'microphone enabled');
    await lifecycle.release('stt', 'chat-mic', 'microphone disabled');
    return { active: false };
  });
  handle('saeed:tts-speak', async (_event, text) => {
    if (getSettings().muted) return { skipped: true, reason: 'muted' };
    const value = String(text || '').trim().slice(0, 12000);
    if (!value) return { skipped: true, reason: 'empty' };
    await lifecycle.acquire('tts', 'chat-tts', 'speech requested');
    const chat = windows().find(win => win.getTitle() === 'Saeed Chat');
    if (!chat) {
      await lifecycle.release('tts', 'chat-tts', 'no chat consumer');
      return { skipped: true, reason: 'chat closed' };
    }
    chat.webContents.send('saeed:tts-speak', value);
    return { queued: true };
  });
  handle('saeed:tts-finished', async () => {
    await lifecycle.release('tts', 'chat-tts', 'speech finished');
    return { released: true };
  });
  on('saeed:stt-error', (event, message) => {
    const safeMessage = String(message || 'Voice input failed').slice(0, 1000);
    console.warn('[voice] speech recognition:', safeMessage);
    event.sender.send('saeed:voice-error', safeMessage);
  });
  on('saeed:voice-error', (_event, message) => console.warn('[voice] speech output:', String(message || '').slice(0, 1000)));

  handle('saeed:addons-list', async () => { await lifecycle.acquire('addons', 'addons-panel', 'list add-ons'); return getAddons().list(); });
  handle('saeed:addons-import', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Saeed add-on pack', extensions: ['json'] }] });
    if (result.canceled || !result.filePaths[0]) return getAddons().list();
    const item = getAddons().importFile(result.filePaths[0]);
    return { item, items: getAddons().list() };
  });
  handle('saeed:addons-toggle', (_event, id, enabled) => getAddons().setEnabled(id, enabled));
  handle('saeed:addons-remove', (_event, id) => getAddons().remove(id));
  handle('saeed:addons-close', async () => { await lifecycle.release('addons', 'addons-panel', 'add-ons panel closed'); return { closed: true }; });
  handle('saeed:skills-list', async () => { await lifecycle.acquire('learning', 'learning-panel', 'list skills'); return getSkills().list(); });
  handle('saeed:skills-search', (_event, query) => getSkills().search(query));
  handle('saeed:skills-save', (_event, skill) => getSkills().save(skill));
  handle('saeed:skills-delete', (_event, id) => getSkills().delete(id));
  handle('saeed:skills-close', async () => { await lifecycle.release('learning', 'learning-panel', 'learning panel closed'); return { closed: true }; });

  handle('saeed:diagnostics', () => ({
    process: {
      uptimeMs: Math.round(process.uptime() * 1000),
      cpuUserMs: Math.round(process.cpuUsage().user / 1000),
      cpuSystemMs: Math.round(process.cpuUsage().system / 1000),
      rssBytes: process.memoryUsage().rss,
      heapUsedBytes: process.memoryUsage().heapUsed
    },
    processes: getProcessMetrics(),
    services: lifecycle.diagnostics()
  }));
  handle('saeed:asset-status', () => {
    const selected = getModels().getSelectedPath();
    let exists = false, bytes = 0;
    try { const stat = fs.statSync(selected); exists = stat.isFile(); bytes = exists ? stat.size : 0; } catch {}
    return { exists, bytes, path: exists ? path.basename(selected) : '' };
  });
  handle('saeed:asset-read', () => {
    const selected = getModels().getSelectedPath();
    const data = fs.readFileSync(selected);
    if (data.length < 20 || data.toString('ascii', 0, 4) !== 'glTF' || data.readUInt32LE(4) !== 2) throw new Error('Selected character asset is not a valid GLB v2 file');
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  });
  on('saeed:character-context-menu', event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const { Menu } = require('electron');
    Menu.buildFromTemplate([
      { label: 'Show Saeed', click: () => void lifecycle.acquire('character', 'tray-character', 'context menu show') },
      { label: 'Character Settings…', click: () => void lifecycle.acquire('character-settings', 'character-settings-window', 'context menu settings') },
      { type: 'separator' },
      { label: 'Exit Saeed', click: () => app.quit() }
    ]).popup({ window: win });
  });

  const broadcastModels = models => { for (const win of windows()) win.webContents.send('saeed:models-changed', models); };
  handle('saeed:models-list', () => getModels().list());
  handle('saeed:model-import', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: '3D character (GLB)', extensions: ['glb'] }] });
    if (result.canceled || !result.filePaths[0]) return getModels().list();
    const models = getModels();
    models.importFile(result.filePaths[0]);
    const list = models.list(); broadcastModels(list); return list;
  });
  handle('saeed:model-select', (_event, id) => {
    const result = getModels().select(id);
    const profileStore = getProfileStore();
    profileStore.filePath = getModels().profilePath(dataPath());
    profileStore.load();
    const character = windows().find(win => win.getTitle() === 'Saeed');
    if (character) character.webContents.send('saeed:model-changed');
    broadcastModels(result);
    return result;
  });
  handle('saeed:model-remove', (_event, id) => { const list = getModels().remove(id); broadcastModels(list); return list; });

  handle('saeed:accessories-list', () => getAccessories().list());
  handle('saeed:accessory-import', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: '3D accessory (GLB)', extensions: ['glb'] }] });
    if (result.canceled || !result.filePaths[0]) return getAccessories().list();
    getAccessories().importFile(result.filePaths[0]);
    return getAccessories().list();
  });
  handle('saeed:accessory-remove', (_event, id) => getAccessories().remove(id));
  handle('saeed:accessory-read', (_event, id) => {
    const data = fs.readFileSync(getAccessories().getPath(id));
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  });
  handle('saeed:character-profile-get', () => getProfileStore().get());
  handle('saeed:character-profile-save', (_event, profile) => {
    const saved = getProfileStore().save(profile);
    for (const win of windows()) win.webContents.send('saeed:character-profile-changed', saved);
    return saved;
  });
  handle('saeed:character-info', () => getCharacterInfo());
  on('saeed:character-info-update', (event, info) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.getTitle() !== 'Saeed') throw new Error('Only the character window may report character diagnostics');
    setCharacterInfo(info);
  });
  handle('saeed:settings-get', () => getSettings());
  handle('saeed:settings-update', (_event, patch) => updateSettings(patch));
  return () => {
    for (const channel of registered) {
      ipcMain.removeHandler(channel);
      ipcMain.removeAllListeners(channel);
    }
  };
}

module.exports = { registerIpcHandlers };
