'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function collectJavaScript(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScript(fullPath);
    return /\.(?:c?js|mjs)$/.test(entry.name) ? [{ path: fullPath, content: fs.readFileSync(fullPath, 'utf8') }] : [];
  });
}

test('every exposed preload IPC channel is implemented somewhere in the main-process source tree', () => {
  const root = path.join(__dirname, '..', 'src');
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  const sourceFiles = collectJavaScript(root).filter(file => file.path !== path.join(root, 'preload.js'));
  const channels = new Set([...preload.matchAll(/ipcRenderer\.(?:invoke|send|on)\(['"]([^'"]+)['"]/g)].map(match => match[1]));
  const missing = [...channels].filter(channel => !sourceFiles.some(file => file.content.includes(channel)));
  assert.deepEqual(missing, [], 'IPC channels with no implementation in src/: ' + missing.join(', '));
});
