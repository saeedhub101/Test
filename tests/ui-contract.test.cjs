'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pairs = [
  ['chat.html', 'chat.js'],
  ['character-settings.html', 'character-settings.js'],
  ['diagnostics.html', 'diagnostics.js']
];

for (const [htmlName, scriptName] of pairs) {
  test(`${htmlName} contains every statically referenced control in ${scriptName}`, () => {
    const html = fs.readFileSync(path.join(root, 'src', htmlName), 'utf8');
    const script = fs.readFileSync(path.join(root, 'src', scriptName), 'utf8');
    const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${htmlName} contains duplicate element IDs`);
    const referenced = new Set();
    for (const regex of [
      /\$\(['"]([A-Za-z][A-Za-z0-9_-]*)['"]\)/g,
      /document\.getElementById\(['"]([A-Za-z][A-Za-z0-9_-]*)['"]\)/g
    ]) {
      for (const match of script.matchAll(regex)) referenced.add(match[1]);
    }
    const missing = [...referenced].filter(id => !ids.includes(id));
    assert.deepEqual(missing, [], `Missing HTML controls: ${missing.join(', ')}`);
  });
}
