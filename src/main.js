'use strict';

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, safeStorage, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
const { LifecycleController } = require('./lifecycle-controller');
const { SettingsStore, SIZES } = require('./settings-store');
const { CharacterProfileStore } = require('./character-profile-store');
const { BrainService } = require('./brain-service');
const { ToolRegistry } = require('./tool-registry');
const { SkillStore } = require('./skill-store');

let tray = null;
let characterWindow = null;
let chatWindow = null;
let characterSettingsWindow = null;
let characterInfo = { loaded: false, meshes: [], bones: [], morphs: [], clips: [] };
let isQuitting = false;
const lifecycle = new LifecycleController();
let settingsStore = null;
let characterProfileStore = null;
let brain = null;
let skillStore = null;

function requestLifecycle(operation) {
  void operation.catch(error => console.error('[lifecycle] user action failed:', error));
}

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
    { label: 'Show Saeed', click: () => requestLifecycle(lifecycle.acquire('character', 'tray-character', 'tray show')) },
    { label: 'Hide Saeed', click: () => requestLifecycle(lifecycle.release('character', 'tray-character', 'tray hide')) },
    { label: 'Character Settings…', click: () => requestLifecycle(lifecycle.acquire('character-settings', 'character-settings-window', 'tray open character settings')) },
    { label: 'Character size', submenu: [
      { label: 'Small', type: 'radio', checked: settings.characterSize === 'small', click: () => updateSettings({ characterSize: 'small' }) },
      { label: 'Medium', type: 'radio', checked: settings.characterSize === 'medium', click: () => updateSettings({ characterSize: 'medium' }) },
      { label: 'Large', type: 'radio', checked: settings.characterSize === 'large', click: () => updateSettings({ characterSize: 'large' }) }
    ]},
    { label: 'Always on Top', type: 'checkbox', checked: settings.alwaysOnTop, click: item => updateSettings({ alwaysOnTop: item.checked }) },
    { label: 'Low Power Mode', type: 'checkbox', checked: settings.lowPowerMode, click: item => updateSettings({ lowPowerMode: item.checked }) },
    { label: 'Click-through', type: 'checkbox', checked: settings.clickThrough, click: item => updateSettings({ clickThrough: item.checked }) },
    { label: 'Mute speech output', type: 'checkbox', checked: settings.muted, click: item => updateSettings({ muted: item.checked }) },
    { label: 'Open Chat', click: () => requestLifecycle(lifecycle.acquire('chat', 'chat-window', 'tray open chat')) },
    { type: 'separator' },
    { label: 'Diagnostics', click: () => openDiagnostics() },
    { type: 'separator' },
    { label: 'Quit Saeed', click: () => { isQuitting = true; app.quit(); } }
  ]));
}

function updateSettings(patch) {
  try {
    settingsStore.update(patch);
    if (patch?.muted === true) void lifecycle.release('tts', 'chat-tts', 'speech muted').catch(error => console.error('[tts] mute stop failed', error));
    applyCharacterSettings();
    if (chatWindow && !chatWindow.isDestroyed()) chatWindow.webContents.send('saeed:settings-changed', getSettings());
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
    createdWindow.on('closed', () => {
      if (chatWindow === createdWindow) {
        chatWindow = null;
        if (!app.__saeedShutdownPending) {
          void lifecycle.release('chat', 'chat-window', 'chat window closed');
          void lifecycle.release('learning', 'learning-panel', 'chat window closed');
        }
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
      if (characterSettingsWindow === createdWindow) {
        characterSettingsWindow = null;
        if (!app.__saeedShutdownPending) void lifecycle.release('character-settings', 'character-settings-window', 'settings window closed');
      }
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

const toolRegistry = new ToolRegistry()
  .register('show_character', {
    description: 'Show the Saeed 3D character window.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => { await lifecycle.acquire('character', 'tray-character', 'AI tool: show character'); return { success: true, state: 'shown' }; }
  })
  .register('hide_character', {
    description: 'Hide the Saeed 3D character window while keeping the application tray alive.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => { await lifecycle.release('character', 'tray-character', 'AI tool: hide character'); return { success: true, state: 'hidden' }; }
  })
  .register('open_character_settings', {
    description: 'Open the character rig and morph settings window.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => { await lifecycle.acquire('character-settings', 'character-settings-window', 'AI tool: open settings'); return { success: true, state: 'settings opened' }; }
  })
  .register('set_character_size', {
    description: 'Change the character window size.',
    parameters: { type: 'object', properties: { size: { type: 'string', enum: ['small', 'medium', 'large'] } }, required: ['size'], additionalProperties: false },
    handler: async ({ size }) => ({ success: true, settings: updateSettings({ characterSize: size }) })
  })
  .register('get_character_diagnostics', {
    description: 'Read the latest GLB mesh, bone, morph and animation clip diagnostics.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => characterInfo
  })
  .register('get_app_diagnostics', {
    description: 'Read application service states and this process CPU and memory counters.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => {
      const memory = process.memoryUsage();
      const cpu = process.cpuUsage();
      return { services: lifecycle.diagnostics(), process: { uptimeMs: Math.round(process.uptime() * 1000), cpuUserMs: Math.round(cpu.user / 1000), cpuSystemMs: Math.round(cpu.system / 1000), rssBytes: memory.rss, heapUsedBytes: memory.heapUsed } };
    }
  });

brain = new BrainService({
  dataDirectory: path.join(app.getPath('userData'), 'brain'),
  toolRegistry,
  encryptSecret: secret => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('OS secure storage is unavailable');
    return safeStorage.encryptString(secret);
  },
  decryptSecret: encrypted => safeStorage.decryptString(encrypted),
  onEvent: event => {
    if (event?.type === 'command') {
      const actions = {
        'show-character': () => lifecycle.acquire('character', 'tray-character', 'brain command'),
        'hide-character': () => lifecycle.release('character', 'tray-character', 'brain command'),
        'open-character-settings': () => lifecycle.acquire('character-settings', 'character-settings-window', 'brain command')
      };
      if (actions[event.action]) void actions[event.action]().catch(error => console.error('[brain command]', error));
    }
    if (characterWindow && !characterWindow.isDestroyed()) characterWindow.webContents.send('saeed:behavior-event', event);
  }
});
const brainLifecycleService = {
  async start() { await brain.start(); },
  async stop() { await brain.stop(); },
  async dispose() { await brain.dispose(); }
};
const learningService = {
  async start() {
    if (!skillStore) skillStore = new SkillStore(path.join(app.getPath('userData'), 'skills.json'));
    else skillStore.load();
  },
  async stop() { skillStore = null; },
  async dispose() { skillStore = null; }
};
const sttService = {
  async start() {
    if (chatWindow && !chatWindow.isDestroyed()) chatWindow.webContents.send('saeed:stt-control', { active: true });
  },
  async stop() {
    if (chatWindow && !chatWindow.isDestroyed()) chatWindow.webContents.send('saeed:stt-control', { active: false });
  }
};
const ttsService = {
  async start() {},
  async stop() {
    if (chatWindow && !chatWindow.isDestroyed()) chatWindow.webContents.send('saeed:tts-stop');
  }
};

lifecycle.register('character', characterService);
lifecycle.register('brain', brainLifecycleService);
lifecycle.register('learning', learningService);
lifecycle.register('stt', sttService, { dependencies: ['brain'] });
lifecycle.register('tts', ttsService);
lifecycle.register('chat', chatService, { dependencies: ['brain'] });
lifecycle.register('character-settings', characterSettingsService);

function createTray() {
  // Use a generated native image so startup does not depend on optional assets.
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" rx="9" fill="#426fc1"/><path d="M22 9c-1.4-1.4-3.1-2-5.7-2-4 0-6.8 2.1-6.8 5.3 0 3.1 2.2 4.4 6.1 5.1 2.4.5 3.4.9 3.4 2 0 1.1-1.1 1.8-3 1.8-2 0-3.8-.8-5.1-2.2l-2.2 2.6c1.7 1.9 4.2 2.9 7.2 2.9 4.3 0 7.1-2.2 7.1-5.7 0-3.2-2.1-4.5-6.1-5.3-2.4-.5-3.4-.8-3.4-1.8 0-1 1-1.6 2.7-1.6 1.8 0 3.1.5 4.3 1.6z" fill="#fff"/></svg>';
  const image = nativeImage.createFromDataURL('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  tray = new Tray(image);
  tray.setToolTip('Saeed');
  rebuildTrayMenu();
  tray.on('double-click', () => requestLifecycle(lifecycle.acquire('character', 'tray-character', 'tray double click')));
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
    { label: 'Open Chat', click: () => requestLifecycle(lifecycle.acquire('chat', 'chat-window', 'character context menu')) },
    { label: 'Character Settings…', click: () => requestLifecycle(lifecycle.acquire('character-settings', 'character-settings-window', 'character context menu settings')) },
    { label: 'Hide Saeed', click: () => requestLifecycle(lifecycle.release('character', 'tray-character', 'character context menu hide')) },
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
ipcMain.handle('saeed:skills-list', async event => {
  if (BrowserWindow.fromWebContents(event.sender) !== chatWindow) throw new Error('Chat access denied');
  await lifecycle.acquire('learning', 'learning-panel', 'user opened learning panel');
  return skillStore.list();
});
ipcMain.handle('saeed:skills-search', async (event, query) => {
  if (BrowserWindow.fromWebContents(event.sender) !== chatWindow) throw new Error('Chat access denied');
  await lifecycle.acquire('learning', 'learning-panel', 'user searched skills');
  return skillStore.search(query);
});
ipcMain.handle('saeed:skills-save', async (event, skill) => {
  if (BrowserWindow.fromWebContents(event.sender) !== chatWindow) throw new Error('Chat access denied');
  await lifecycle.acquire('learning', 'learning-panel', 'user saved skill');
  return skillStore.save(skill);
});
ipcMain.handle('saeed:skills-delete', (event, id) => {
  if (BrowserWindow.fromWebContents(event.sender) !== chatWindow) throw new Error('Chat access denied');
  if (!skillStore) return false;
  return skillStore.delete(id);
});
ipcMain.handle('saeed:skills-close', async event => {
  if (BrowserWindow.fromWebContents(event.sender) !== chatWindow) throw new Error('Chat access denied');
  await lifecycle.release('learning', 'learning-panel', 'user closed learning panel');
  return true;
});
ipcMain.handle('saeed:stt-set', async (event, active) => {
  if (BrowserWindow.fromWebContents(event.sender) !== chatWindow) throw new Error('Chat access denied');
  if (active) return lifecycle.acquire('stt', 'chat-mic', 'user enabled microphone');
  await lifecycle.release('stt', 'chat-mic', 'user disabled microphone');
  return { state: 'stopped' };
});
ipcMain.handle('saeed:tts-speak', async (event, text) => {
  if (BrowserWindow.fromWebContents(event.sender) !== chatWindow) throw new Error('Chat access denied');
  if (getSettings().muted) return { muted: true };
  const speech = String(text || '').trim().slice(0, 5000);
  if (!speech) return { skipped: true };
  await lifecycle.acquire('tts', 'chat-tts', 'speaking chat response');
  if (chatWindow && !chatWindow.isDestroyed()) chatWindow.webContents.send('saeed:tts-speak', speech);
  return { muted: false };
});
ipcMain.handle('saeed:tts-finished', async event => {
  if (BrowserWindow.fromWebContents(event.sender) !== chatWindow) throw new Error('Chat access denied');
  await lifecycle.release('tts', 'chat-tts', 'speech completed');
  return true;
});
ipcMain.on('saeed:stt-error', (event, message) => {
  if (BrowserWindow.fromWebContents(event.sender) !== chatWindow) return;
  if (chatWindow && !chatWindow.isDestroyed()) chatWindow.webContents.send('saeed:voice-error', String(message || 'Speech recognition failed'));
  void lifecycle.release('stt', 'chat-mic', 'speech recognition unavailable');
});
ipcMain.handle('saeed:chat-history', event => {
  if (BrowserWindow.fromWebContents(event.sender) !== chatWindow) throw new Error('Chat access denied');
  return brain.getHistory();
});
ipcMain.handle('saeed:chat-send', async (event, text) => {
  if (BrowserWindow.fromWebContents(event.sender) !== chatWindow) throw new Error('Chat access denied');
  return brain.send(text);
});
ipcMain.handle('saeed:brain-provider-get', event => {
  if (BrowserWindow.fromWebContents(event.sender) !== chatWindow) throw new Error('Chat access denied');
  return brain.getProvider();
});
ipcMain.handle('saeed:brain-provider-save', (event, provider) => {
  if (BrowserWindow.fromWebContents(event.sender) !== chatWindow) throw new Error('Chat access denied');
  return brain.setProvider(provider);
});
ipcMain.handle('saeed:brain-history-clear', event => {
  if (BrowserWindow.fromWebContents(event.sender) !== chatWindow) throw new Error('Chat access denied');
  return brain.clearHistory();
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
  const modelPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'saeed.glb')
    : path.join(__dirname, '..', 'assets', 'saeed.glb');
  const exists = fs.existsSync(modelPath);
  return { path: modelPath, url: pathToFileURL(modelPath).href, exists, bytes: exists ? fs.statSync(modelPath).size : 0 };
});

app.whenReady().then(async () => {
  app.setAppUserModelId('com.saeed.desktop');
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const trustedLocalWindow = webContents.getURL().startsWith('file://');
    callback(trustedLocalWindow && permission === 'media');
  });
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
