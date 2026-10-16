'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('preload invoke and send APIs have explicit main-process handlers', () => {
  const root = path.join(__dirname, '..', 'src');
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  const ipc = fs.readFileSync(path.join(root, 'ipc-controller.js'), 'utf8');
  const invoked = new Set([...preload.matchAll(/ipcRenderer\.invoke\(['"]([^'"]+)['"]/g)].map(m => m[1]));
  const sent = new Set([...preload.matchAll(/ipcRenderer\.send\(['"]([^'"]+)['"]/g)].map(m => m[1]));
  const handled = new Set([...ipc.matchAll(/handle\(['"]([^'"]+)['"]/g)].map(m => m[1]));
  const received = new Set([...ipc.matchAll(/on\(['"]([^'"]+)['"]/g)].map(m => m[1]));
  const missingHandlers = [...invoked].filter(channel => !handled.has(channel));
  const missingReceivers = [...sent].filter(channel => !received.has(channel));
  assert.deepEqual(missingHandlers, [], 'invoke channels without ipcMain.handle: ' + missingHandlers.join(', '));
  assert.deepEqual(missingReceivers, [], 'send channels without ipcMain.on: ' + missingReceivers.join(', '));
});

test('main-owned preload event subscriptions have corresponding senders', () => {
  const root = path.join(__dirname, '..', 'src');
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  const sources = ['main.js', 'ipc-controller.js'].map(name => fs.readFileSync(path.join(root, name), 'utf8')).join('\n');
  const subscriptions = new Set([...preload.matchAll(/ipcRenderer\.on\(['"]([^'"]+)['"]/g)].map(m => m[1]));
  const missing = [...subscriptions].filter(channel =>
    !sources.includes(".send('" + channel + "'") && !sources.includes('.send("' + channel + '"')
  );
  assert.deepEqual(missing, [], 'event subscriptions without a main-process sender: ' + missing.join(', '));
});


test('all application windows block unexpected navigation and IPC requires an approved local frame', () => {
  const root = path.join(__dirname, '..', 'src');
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const ipc = fs.readFileSync(path.join(root, 'ipc-controller.js'), 'utf8');
  assert.match(main, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
  assert.match(main, /on\('will-navigate', preventUnexpectedNavigation\)/);
  assert.match(main, /on\('will-redirect', preventUnexpectedNavigation\)/);
  const securedWindows = [...main.matchAll(/secureWindowNavigation\(createdWindow, path\.join\(__dirname, '(?:character|chat|character-settings|diagnostics)\.html'\)\)/g)];
  assert.equal(securedWindows.length, 4, 'every BrowserWindow must have navigation restrictions');
  assert.match(ipc, /trustedPageUrls/);
  assert.match(ipc, /event\.senderFrame\?\.url/);
});


test('tray debug rotation is connected to the character renderer', () => {
  const root = path.join(__dirname, '..', 'src');
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  const character = fs.readFileSync(path.join(root, 'character.js'), 'utf8');
  assert.match(main, /label: 'Debug rotate once', click: \(\) => requestDebugRotateOnce\(\)/);
  assert.match(main, /send\('saeed:debug-rotate-once'\)/);
  assert.match(preload, /onDebugRotateOnce/);
  assert.match(character, /onDebugRotateOnce\(beginDebugRotation\)/);
  assert.match(character, /debugRotateUntil = debugRotateStart \+ 1200/);
});
