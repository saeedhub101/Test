'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('every preload IPC channel has a corresponding main-process handler or sender', () => {
  const root = path.join(__dirname, '..', 'src');
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const channels = new Set([...preload.matchAll(/ipcRenderer\.(?:invoke|send|on)\(['"]([^'"]+)['"]/g)].map(match => match[1]));
  const missing = [...channels].filter(channel => !main.includes(channel));
  assert.deepEqual(missing, [], 'IPC channels missing from main.js: ' + missing.join(', '));
});
