'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CharacterModelStore } = require('../src/character-model-store');

function writeGlb(file) {
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' } }));
  const length = Math.ceil(json.length / 4) * 4;
  const data = Buffer.alloc(20 + length);
  data.write('glTF', 0, 'ascii'); data.writeUInt32LE(2, 4); data.writeUInt32LE(data.length, 8);
  data.writeUInt32LE(length, 12); data.writeUInt32LE(0x4e4f534a, 16); json.copy(data, 20); data.fill(0x20, 20 + json.length);
  fs.writeFileSync(file, data);
}

test('imports and selects character models with independent profile paths', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saeed-models-'));
  try {
    const defaultPath = path.join(dir, 'default.glb'); writeGlb(defaultPath);
    const source = path.join(dir, 'custom.glb'); writeGlb(source);
    const userData = path.join(dir, 'user');
    const store = new CharacterModelStore({ directory: path.join(userData, 'models'), defaultPath, statePath: path.join(userData, 'selected.json') });
    const item = store.importFile(source);
    assert.equal(store.getSelectedPath(), defaultPath);
    store.select(item.id);
    assert.equal(store.getSelectedPath(), path.join(userData, 'models', item.file));
    assert.notEqual(store.profilePath(userData), path.join(userData, 'character-profile.json'));
    const reloaded = new CharacterModelStore({ directory: path.join(userData, 'models'), defaultPath, statePath: path.join(userData, 'selected.json') });
    assert.equal(reloaded.list().find(model => model.id === item.id).selected, true);
    reloaded.remove(item.id);
    assert.equal(reloaded.getSelectedPath(), defaultPath);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});


test('keeps the selected model unchanged when selection cannot be persisted', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saeed-models-'));
  try {
    const defaultPath = path.join(dir, 'default.glb'); writeGlb(defaultPath);
    const source = path.join(dir, 'custom.glb'); writeGlb(source);
    const userData = path.join(dir, 'user');
    const blocked = path.join(userData, 'blocked');
    const store = new CharacterModelStore({
      directory: path.join(userData, 'models'),
      defaultPath,
      statePath: path.join(blocked, 'selected.json')
    });
    const item = store.importFile(source);
    fs.writeFileSync(blocked, 'not a directory');
    assert.throws(() => store.select(item.id));
    assert.equal(store.getSelectedPath(), defaultPath);
    assert.equal(store.selectedId, '');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
