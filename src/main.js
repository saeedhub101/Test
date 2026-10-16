'use strict';

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { LifecycleController } = require('./lifecycle-controller');

let tray = null;
let characterWindow = null;
let chatWindow = null;
let isQuitting = false;
const lifecycle = new LifecycleController();

const characterService = {
  async start() {
    if (characterWindow && !characterWindow.isDestroyed()) {
      characterWindow.show();
      return;
    }
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    characterWindow = new BrowserWindow({
      width: 360, height: 480, x: Math.max(0, width - 390), y: Math.max(0, height - 520),
      frame: false, transparent: true, resizable: false, alwaysOnTop: true,
      show: false, backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true, nodeIntegration: false, sandbox: true
      }
    });
    const createdWindow = characterWindow;
    createdWindow.setMenuBarVisibility(false);
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

lifecycle.register('character', characterService);
lifecycle.register('chat', chatService);

function createTray() {
  // Use a generated empty native image so startup does not depend on optional assets.
  const image = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l8sAAAAASUVORK5CYII=');
  tray = new Tray(image);
  tray.setToolTip('Saeed');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Saeed', click: () => lifecycle.acquire('character', 'tray-character', 'tray show') },
    { label: 'Hide Saeed', click: () => lifecycle.release('character', 'tray-character', 'tray hide') },
    { label: 'Open Chat', click: () => lifecycle.acquire('chat', 'chat-window', 'tray open chat') },
    { type: 'separator' },
    { label: 'Diagnostics', click: () => openDiagnostics() },
    { type: 'separator' },
    { label: 'Quit Saeed', click: () => { isQuitting = true; app.quit(); } }
  ]));
  tray.on('double-click', () => lifecycle.acquire('character', 'tray-character', 'tray double click'));
}

function openDiagnostics() {
  const report = lifecycle.diagnostics().map(s =>
    `${s.name}: ${s.state}; consumers=[${s.consumers.join(', ')}]; reason=${s.lastReason || '-'}`
  ).join('\n');
  const { dialog } = require('electron');
  dialog.showMessageBox({ type: 'info', title: 'Saeed diagnostics', message: report || 'No services registered.' });
}

ipcMain.handle('saeed:window-action', async (_event, action) => {
  if (action === 'hide-character') return lifecycle.release('character', 'tray-character', 'character window request');
  if (action === 'show-character') return lifecycle.acquire('character', 'tray-character', 'character window request');
  if (action === 'open-chat') return lifecycle.acquire('chat', 'chat-window', 'character requested chat');
  if (action === 'close-chat') return lifecycle.release('chat', 'chat-window', 'chat close request');
  if (action === 'quit') { isQuitting = true; app.quit(); return true; }
  throw new Error('Unsupported window action');
});

ipcMain.handle('saeed:diagnostics', () => lifecycle.diagnostics());
ipcMain.handle('saeed:asset-status', () => {
  const modelPath = path.join(__dirname, '..', 'assets', 'saeed.glb');
  return { path: modelPath, exists: fs.existsSync(modelPath), bytes: fs.existsSync(modelPath) ? fs.statSync(modelPath).size : 0 };
});

app.whenReady().then(async () => {
  app.setAppUserModelId('com.saeed.desktop');
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
