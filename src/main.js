'use strict';

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, safeStorage, session, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { LifecycleController } = require('./lifecycle-controller');
const { SettingsStore, SIZES } = require('./settings-store');
const { CharacterProfileStore } = require('./character-profile-store');
const { BrainService } = require('./brain-service');
const { ToolRegistry } = require('./tool-registry');
const { SkillStore } = require('./skill-store');
const { AccessoryStore } = require('./accessory-store');
const { CharacterModelStore } = require('./character-model-store');
const { AddonStore } = require('./addon-store');
const { registerIpcHandlers } = require('./ipc-controller');

let tray = null;
let characterWindow = null;
let chatWindow = null;
let characterSettingsWindow = null;
let diagnosticsWindow = null;
let characterInfo = { loaded: false, meshes: [], bones: [], morphs: [], clips: [] };
let isQuitting = false;
const lifecycle = new LifecycleController();
let settingsStore = null;
let characterProfileStore = null;
let brain = null;
let skillStore = null;
let accessoryStore = null;
let modelStore = null;
let addonStore = null;
const smokeTest = process.argv.includes('--smoke-test');
let smokeTimeout = null;

function requestLifecycle(operation) {
  void operation.catch(error => console.error('[lifecycle] user action failed:', error));
}

async function hideCharacter(reason = 'hide character') {
  await lifecycle.release('stt', 'chat-mic', reason);
  await lifecycle.release('tts', 'chat-tts', reason);
  return lifecycle.release('character', 'tray-character', reason);
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
    { label: 'Hide Saeed', click: () => requestLifecycle(hideCharacter('tray hide')) },
    { label: 'Change Character…', click: () => requestLifecycle(lifecycle.acquire('character-settings', 'character-settings-window', 'tray change character')) },
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
    { label: 'Pause character animations', type: 'checkbox', checked: settings.animationsPaused, click: item => updateSettings({ animationsPaused: item.checked }) },
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
          void (async () => {
            await lifecycle.release('stt', 'chat-mic', 'chat window closed');
            await lifecycle.release('tts', 'chat-tts', 'chat window closed');
            await lifecycle.release('learning', 'learning-panel', 'chat window closed');
            await lifecycle.release('addons', 'addons-panel', 'chat window closed');
            await lifecycle.release('chat', 'chat-window', 'chat window closed');
          })().catch(error => console.error('[lifecycle] chat close cleanup failed', error));
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
    handler: async () => { await hideCharacter('AI tool: hide character'); return { success: true, state: 'hidden' }; }
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
  .register('search_enabled_addon_skills', {
    description: 'Search skills from enabled declarative add-on packs. These packs contain data only and cannot execute code.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
    handler: async ({ query }) => {
      await lifecycle.acquire('addons', 'brain-addon-search', 'AI searched enabled add-on skills');
      try { return addonStore.searchSkills(query); }
      finally { await lifecycle.release('addons', 'brain-addon-search', 'AI add-on search completed'); }
    }
  })
  .register('search_saved_skills', {
    description: 'Search the user-approved saved skills and notes. Only search; do not create or change saved knowledge.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
    handler: async ({ query }) => {
      await lifecycle.acquire('learning', 'brain-skill-search', 'AI searched saved skills');
      try { return skillStore.search(query); }
      finally { await lifecycle.release('learning', 'brain-skill-search', 'AI skill search completed'); }
    }
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
        'hide-character': () => hideCharacter('brain command'),
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
const addonService = {
  async start() {
    if (!addonStore) addonStore = new AddonStore(path.join(app.getPath('userData'), 'addons'));
    else addonStore.load();
  },
  async stop() { addonStore = null; },
  async dispose() { addonStore = null; }
};
const diagnosticsService = {
  async start() {
    if (diagnosticsWindow && !diagnosticsWindow.isDestroyed()) {
      diagnosticsWindow.show(); diagnosticsWindow.focus(); return;
    }
    diagnosticsWindow = new BrowserWindow({
      width: 850, height: 620, minWidth: 680, minHeight: 480,
      show: false, title: 'Saeed Resource Monitor', backgroundColor: '#171923',
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    const createdWindow = diagnosticsWindow;
    createdWindow.once('ready-to-show', () => {
      if (diagnosticsWindow === createdWindow && !createdWindow.isDestroyed()) createdWindow.show();
    });
    createdWindow.on('closed', () => {
      if (diagnosticsWindow === createdWindow) {
        diagnosticsWindow = null;
        if (!app.__saeedShutdownPending) void lifecycle.release('diagnostics', 'diagnostics-window', 'diagnostics window closed');
      }
    });
    try { await createdWindow.loadFile(path.join(__dirname, 'diagnostics.html')); }
    catch (error) {
      if (diagnosticsWindow === createdWindow) diagnosticsWindow = null;
      if (!createdWindow.isDestroyed()) createdWindow.destroy();
      throw error;
    }
  },
  async stop() {
    if (diagnosticsWindow && !diagnosticsWindow.isDestroyed()) {
      const win = diagnosticsWindow; diagnosticsWindow = null; win.destroy();
    }
  },
  async dispose() { await this.stop(); }
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
lifecycle.register('addons', addonService);
lifecycle.register('diagnostics', diagnosticsService);
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

function getProcessMetrics() {
  return app.getAppMetrics().map(metric => ({
    pid: metric.pid,
    type: metric.type,
    cpuPercent: Number(metric.cpu?.percentCPUUsage || 0),
    idleWakeupsPerSecond: Number(metric.cpu?.idleWakeupsPerSecond || 0),
    workingSetBytes: Number(metric.memory?.workingSetSize || 0) * 1024,
    privateBytes: Number(metric.memory?.privateBytes || 0),
    sharedBytes: Number(metric.memory?.sharedBytes || 0)
  }));
}

function openDiagnostics() {
  requestLifecycle(lifecycle.acquire('diagnostics', 'diagnostics-window', 'tray diagnostics'));
}



function initializeStores() {
  const userData = app.getPath('userData');
  settingsStore = new SettingsStore(path.join(userData, 'settings.json'));
  const defaultModelPath = app.isPackaged ? path.join(process.resourcesPath, 'assets', 'saeed.glb') : path.join(__dirname, '..', 'assets', 'saeed.glb');
  modelStore = new CharacterModelStore({ directory: path.join(userData, 'models'), defaultPath: defaultModelPath, statePath: path.join(userData, 'models-state.json') });
  accessoryStore = new AccessoryStore(path.join(userData, 'accessories'));
  addonStore = new AddonStore(path.join(userData, 'addons'));
  skillStore = new SkillStore(path.join(userData, 'skills.json'));
  characterProfileStore = new CharacterProfileStore(modelStore.profilePath(userData));
}
function getCharacterProfileStore() {
  if (!characterProfileStore) characterProfileStore = new CharacterProfileStore(modelStore.profilePath(app.getPath('userData')));
  return characterProfileStore;
}
function getModelStore() { return modelStore; }
function getAccessoryStore() { return accessoryStore; }
function getAddonStore() { return addonStore; }
function getSkillStore() { return skillStore; }

function broadcastCharacterInfo(info) {
  characterInfo = {
    loaded: info?.loaded === true,
    meshes: Array.isArray(info?.meshes) ? info.meshes.slice(0, 1000) : [],
    bones: Array.isArray(info?.bones) ? info.bones.slice(0, 2000) : [],
    morphs: Array.isArray(info?.morphs) ? info.morphs.slice(0, 2000) : [],
    clips: Array.isArray(info?.clips) ? info.clips.slice(0, 500) : []
  };
  for (const win of [characterSettingsWindow, diagnosticsWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send('saeed:character-info-changed', characterInfo);
  }
  if (smokeTest && characterInfo.loaded) {
    if (smokeTimeout) clearTimeout(smokeTimeout);
    isQuitting = true;
    app.exit(0);
  }
}

app.whenReady().then(async () => {
  try {
    initializeStores();
    registerIpcHandlers({
      lifecycle,
      getWindows: () => [characterWindow, chatWindow, characterSettingsWindow, diagnosticsWindow],
      getSettings,
      updateSettings,
      getCharacterInfo: () => ({ ...characterInfo }),
      setCharacterInfo: broadcastCharacterInfo,
      brain,
      hideCharacter,
      getProcessMetrics,
      stores: { getCharacterProfileStore, getModelStore, getAccessoryStore, getAddonStore, getSkillStore }
    });
    createTray();
    if (smokeTest) smokeTimeout = setTimeout(() => {
      console.error('[smoke-test] Timed out before the character GLB reported loaded state');
      app.exit(2);
    }, 40000);
    await lifecycle.acquire('character', 'tray-character', 'application startup');
  } catch (error) {
    console.error('[startup] Saeed failed to initialize:', error);
    if (smokeTest) app.exit(1);
  }
});

app.on('before-quit', event => {
  if (app.__saeedShutdownPending) return;
  app.__saeedShutdownPending = true;
  if (smokeTimeout) clearTimeout(smokeTimeout);
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;
  void lifecycle.shutdown('application quit').finally(() => app.quit());
});
app.on('window-all-closed', () => {});
app.on('activate', () => {
  if (!characterWindow || characterWindow.isDestroyed()) requestLifecycle(lifecycle.acquire('character', 'tray-character', 'application activate'));
});
