'use strict';

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { LifecycleController } = require('./lifecycle-controller');
const { SettingsStore, SIZES } = require('./settings-store');
const { CharacterProfileStore } = require('./character-profile-store');

let tray = null;
let characterWindow = null;
let chatWindow = null;
let characterSettingsWindow = null;
let characterInfo = { loaded: false, meshes: [], bones: [], morphs: [], clips: [] };
let isQuitting = false;
const lifecycle = new LifecycleController();
let settingsStore = null;
let characterProfileStore = null;

function getSettings() {
  if (!settingsStore) throw new Error('Settings are not initialized yet');
  return settingsStore.get();
}

function applyCharacterSettings() {
  if (!characterWindow || characterWindow.isDestroyed()) return;
  const settings = getSettings();
  const size = SIZES[settings.characterSize];
  characterWindow.setSize(size.width, size.height);
  characterWindow.setAlwaysOnTop(settings.alwaysOnTop);
  characterWindow.setIgnoreMouseEvents(settings.clickThrough, { forward: true });
  characterWindow.webContents.send('saeed:settings-changed', settings);
}

function rebuildTrayMenu() {
  if (!tray) return;
  const settings = getSettings();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Saeed', click: () => lifecycle.acquire('character', 'tray-character', 'tray show') },
    { label: 'Hide Saeed', click: () => lifecycle.release('character', 'tray-character', 'tray hide') },
    { label: 'Character Settings…', click: () => lifecycle.acquire('character-settings', 'character-settings-window', 'tray open character settings') },
    { label: 'Character size', submenu: [
      { label: 'Small', type: 'radio', checked: settings.characterSize === 'small', click: () => updateSettings({ characterSize: 'small' }) },
      { label: 'Medium', type: 'radio', checked: settings.characterSize === 'medium', click: () => updateSettings({ characterSize: 'medium' }) },
      { label: 'Large', type: 'radio', checked: settings.characterSize === 'large', click: () => updateSettings({ characterSize: 'large' }) }
    ]},
    { label: 'Always on Top', type: 'checkbox', checked: settings.alwaysOnTop, click: item => updateSettings({ alwaysOnTop: item.checked }) },
    { label: 'Low Power Mode', type: 'checkbox', checked: settings.lowPowerMode, click: item => updateSettings({ lowPowerMode: item.checked }) },
    { label: 'Click-through', type: 'checkbox', checked: settings.clickThrough, click: item => updateSettings({ clickThrough: item.checked }) },
    { label: 'Open Chat', click: () => lifecycle.acquire('chat', 'chat-window', 'tray open chat') },
    { type: 'separator' },
    { label: 'Diagnostics', click: () => openDiagnostics() },
    { type: 'separator' },
    { label: 'Quit Saeed', click: () => { isQuitting = true; app.quit(); } }
  ]));
}

function updateSettings(patch) {
  try {
    settingsStore.update(patch);
    applyCharacterSettings();
    rebuildTrayMenu();
    return getSettings();
  } catch (error) {
    console.error('[settings] update failed', error);
    throw error;
  }
}

const characterService = {
  async start() {
    if (characterWindow && !characterWindow.isDestroyed()) {
      characterWindow.show();
      return;
    }
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const settings = getSettings();
    const size = SIZES[settings.characterSize];
    characterWindow = new BrowserWindow({
      width: size.width, height: size.height, x: Math.max(0, width - size.width - 24), y: Math.max(0, height - size.height - 24),
      frame: false, transparent: true, resizable: false, alwaysOnTop: settings.alwaysOnTop,
      show: false, backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true, nodeIntegration: false, sandbox: true
      }
    });
    const createdWindow = characterWindow;
    createdWindow.setMenuBarVisibility(false);
    createdWindow.setIgnoreMouseEvents(settings.clickThrough, { forward: true });
    createdWindow.once('ready-to-show', () => {
      if (characterWindow === createdWindow && !createdWindow.isDestroyed()) createdWindow.show();
    });
    createdWindow.on('closed', () => {
      // A user can close the character window via OS/window controls. Remove
      // its consumer so the controller's state cannot drift from reality.
      if (characterWindow === createdWindow) {
        characterWindow = null;
        if (!app.__saeedShutdownPending) {
          void lifecycle.release('character', 'tray-character', 'character window closed externally');
        }
      }
    });
    try {
      await createdWindow.loadFile(path.join(__dirname, 'character.html'));
    } catch (error) {
      if (characterWindow === createdWindow) characterWindow = null;
      if (!createdWindow.isDestroyed()) createdWindow.destroy();
      throw error;
    }
  },
  async stop() {
    if (characterWindow && !characterWindow.isDestroyed()) {
      const win = characterWindow;
      characterWindow = null;
      win.destroy();
    }
  },
  async dispose() { await this.stop(); }
};

const chatService = {
  async start() {
    if (chatWindow && !chatWindow.isDestroyed()) {
      chatWindow.show();
      chatWindow.focus();
      return;
    }
    chatWindow = new BrowserWindow({
      width: 520, height: 680, minWidth: 380, minHeight: 420,
      show: false, title: 'Saeed Chat', backgroundColor: '#171923',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true, nodeIntegration: false, sandbox: true
      }
    });
    const createdWindow = chatWindow;
    createdWindow.once('ready-to-show', () => {
      if (chatWindow === createdWindow && !createdWindow.isDestroyed()) createdWindow.show();
    });
    try {
      await createdWindow.loadFile(path.join(__dirname, 'chat.html'));
    } catch (error) {
      if (chatWindow === createdWindow) chatWindow = null;
      if (!createdWindow.isDestroyed()) createdWindow.destroy();
      throw error;
    }
    chatWindow.on('closed', () => {
      if (chatWindow === createdWindow) chatWindow = null;
      if (!app.__saeedShutdownPending) {
        void lifecycle.release('chat', 'chat-window', 'chat window closed');
      }
    });
  },
  async stop() {
    if (chatWindow && !chatWindow.isDestroyed()) {
      const win = chatWindow;
      chatWindow = null;
      win.destroy();
    }
  },
  async dispose() { await this.stop(); }
};

const characterSettingsService = {
  async start() {
    if (characterSettingsWindow && !characterSettingsWindow.isDestroyed()) {
      characterSettingsWindow.show();
      characterSettingsWindow.focus();
      return;
    }
    characterSettingsWindow = new BrowserWindow({
      width: 900, height: 720, minWidth: 700, minHeight: 560,
      show: false, title: 'Saeed Character Settings', backgroundColor: '#171923',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true, nodeIntegration: false, sandbox: true
      }
    });
    const createdWindow = characterSettingsWindow;
    createdWindow.once('ready-to-show', () => {
      if (characterSettingsWindow === createdWindow && !createdWindow.isDestroyed()) createdWindow.show();
    });
    createdWindow.on('closed', () => {
      if (characterSettingsWindow === createdWindow) characterSettingsWindow = null;
      if (!app.__saeedShutdownPending) void lifecycle.release('character-settings', 'character-settings-window', 'settings window closed');
    });
    try { await createdWindow.loadFile(path.join(__dirname, 'character-settings.html')); }
    catch (error) {
      if (characterSettingsWindow === createdWindow) characterSettingsWindow = null;
      if (!createdWindow.isDestroyed()) createdWindow.destroy();
      throw error;
    }
  },
  async stop() {
    if (characterSettingsWindow && !characterSettingsWindow.isDestroyed()) {
      const win = characterSettingsWindow;
      characterSettingsWindow = null;
      win.destroy();
    }
  },
  async dispose() { await this.stop(); }
};

lifecycle.register('character', characterService);
lifecycle.register('chat', chatService);
lifecycle.register('character-settings', characterSettingsService, { dependencies: ['character'] });

function createTray() {
  // Use a generated native image so startup does not depend on optional assets.
  const image = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l8sAAAAASUVORK5CYII=');
  tray = new Tray(image);
  tray.setToolTip('Saeed');
  rebuildTrayMenu();
  tray.on('double-click', () => lifecycle.acquire('character', 'tray-character', 'tray double click'));
}

function openDiagnostics() {
  const cpu = process.cpuUsage();
  const memory = process.memoryUsage();
  const processReport = [
    `Process uptime: ${Math.round(process.uptime())} s`,
    `CPU cumulative: user ${Math.round(cpu.user / 1000)} ms, system ${Math.round(cpu.system / 1000)} ms`,
    `Memory RSS: ${Math.round(memory.rss / 1024 / 1024)} MiB; heap used: ${Math.round(memory.heapUsed / 1024 / 1024)} MiB`
  ].join('\n');
  const serviceReport = lifecycle.diagnostics().map(s =>
    `${s.name}: ${s.state}; consumers=[${s.consumers.join(', ')}]; running=${Math.round(s.runningForMs / 1000)} s; reason=${s.lastReason || '-'}${s.error ? `; error=${s.error}` : ''}`
  ).join('\n');
  const { dialog } = require('electron');
  dialog.showMessageBox({ type: 'info', title: 'Saeed diagnostics', message: `${processReport}\n\nServices:\n${serviceReport || 'No services registered.'}` });
}

ipcMain.on('saeed:character-context-menu', event => {
  const menu = Menu.buildFromTemplate([
    { label: 'Open Chat', click: () => lifecycle.acquire('chat', 'chat-window', 'character context menu') },
    { label: 'Character Settings…', click: () => lifecycle.acquire('character-settings', 'character-settings-window', 'character context menu settings') },
    { label: 'Hide Saeed', click: () => lifecycle.release('character', 'tray-character', 'character context menu hide') },
    { type: 'separator' },
    { label: 'Exit Saeed', click: () => { isQuitting = true; app.quit(); } }
  ]);
  const owner = BrowserWindow.fromWebContents(event.sender);
  if (owner && !owner.isDestroyed()) menu.popup({ window: owner });
});

ipcMain.handle('saeed:window-action', async (_event, action) => {
  if (action === 'hide-character') return lifecycle.release('character', 'tray-character', 'character window request');
  if (action === 'show-character') return lifecycle.acquire('character', 'tray-character', 'character window request');
  if (action === 'open-chat') return lifecycle.acquire('chat', 'chat-window', 'character requested chat');
  if (action === 'close-chat') return lifecycle.release('chat', 'chat-window', 'chat close request');
  if (action === 'quit') { isQuitting = true; app.quit(); return true; }
  throw new Error('Unsupported window action');
});

ipcMain.handle('saeed:diagnostics', () => {
  const cpu = process.cpuUsage();
  const memory = process.memoryUsage();
  return {
    services: lifecycle.diagnostics(),
    process: {
      uptimeMs: Math.round(process.uptime() * 1000),
      cpuUserMs: Math.round(cpu.user / 1000),
      cpuSystemMs: Math.round(cpu.system / 1000),
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      externalBytes: memory.external
    }
  };
});
ipcMain.handle('saeed:character-profile-get', () => characterProfileStore.get());
ipcMain.handle('saeed:character-profile-save', (_event, profile) => {
  const saved = characterProfileStore.save(profile);
  if (characterWindow && !characterWindow.isDestroyed()) characterWindow.webContents.send('saeed:character-profile-changed', saved);
  return saved;
});
ipcMain.handle('saeed:character-info', () => characterInfo);
ipcMain.on('saeed:character-info-update', (event, info) => {
  if (BrowserWindow.fromWebContents(event.sender) !== characterWindow) return;
  if (!info || typeof info !== 'object') return;
  characterInfo = {
    loaded: Boolean(info.loaded),
    meshes: Array.isArray(info.meshes) ? info.meshes.filter(x => typeof x === 'string').slice(0, 1000) : [],
    bones: Array.isArray(info.bones) ? info.bones.filter(x => typeof x === 'string').slice(0, 2000) : [],
    morphs: Array.isArray(info.morphs) ? info.morphs.filter(x => typeof x === 'string').slice(0, 2000) : [],
    clips: Array.isArray(info.clips) ? info.clips.filter(x => typeof x === 'string').slice(0, 500) : []
  };
  if (characterSettingsWindow && !characterSettingsWindow.isDestroyed()) {
    characterSettingsWindow.webContents.send('saeed:character-info-changed', characterInfo);
  }
});
ipcMain.handle('saeed:settings-get', () => getSettings());
ipcMain.handle('saeed:settings-update', (_event, patch) => updateSettings(patch));
ipcMain.handle('saeed:asset-status', () => {
  const modelPath = path.join(__dirname, '..', 'assets', 'saeed.glb');
  return { path: modelPath, exists: fs.existsSync(modelPath), bytes: fs.existsSync(modelPath) ? fs.statSync(modelPath).size : 0 };
});

app.whenReady().then(async () => {
  app.setAppUserModelId('com.saeed.desktop');
  settingsStore = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'));
  characterProfileStore = new CharacterProfileStore(path.join(app.getPath('userData'), 'character-profile.json'));
  createTray();
  try {
    await lifecycle.acquire('character', 'tray-character', 'startup');
  } catch (error) {
    console.error('Saeed character startup failed', error);
    const { dialog } = require('electron');
    dialog.showErrorBox('Saeed could not start', String(error?.message || error));
  }
});

app.on('before-quit', async (event) => {
  if (app.__saeedShutdownComplete) return;
  event.preventDefault();
  if (app.__saeedShutdownPending) return;
  app.__saeedShutdownPending = true;
  try {
    await lifecycle.shutdown(isQuitting ? 'tray quit' : 'operating system shutdown');
  } finally {
    app.__saeedShutdownComplete = true;
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Window lifetime is independent from application lifetime; tray controls exit.
});

app.on('will-quit', () => {
  if (tray) { tray.destroy(); tray = null; }
});
