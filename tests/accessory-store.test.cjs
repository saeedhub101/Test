'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AccessoryStore } = require('../src/accessory-store');

function writeGlb(file) {
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' } }));
  const paddedLength = Math.ceil(json.length / 4) * 4;
  const bytes = Buffer.alloc(12 + 8 + paddedLength);
  bytes.write('glTF', 0, 'ascii');
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(paddedLength, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  json.copy(bytes, 20);
  bytes.fill(0x20, 20 + json.length);
  fs.writeFileSync(file, bytes);
}

test('imports valid GLB accessories into the confined user library', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saeed-accessories-'));
  try {
    const source = path.join(dir, 'hat.glb');
    writeGlb(source);
    const store = new AccessoryStore(path.join(dir, 'library'));
    const item = store.importFile(source);
    assert.equal(store.list().length, 1);
    assert.equal(fs.existsSync(store.getPath(item.id)), true);
    assert.equal(store.remove(item.id), true);
    assert.equal(store.list().length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('rejects non-GLB files and invalid GLB metadata', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saeed-accessories-'));
  try {
    const store = new AccessoryStore(path.join(dir, 'library'));
    const bad = path.join(dir, 'bad.glb');
    fs.writeFileSync(bad, 'not a glb file');
    assert.throws(() => store.importFile(bad), /under 50 MiB|invalid GLB/);
    const invalid = path.join(dir, 'invalid.glb');
    writeGlb(invalid);
    const bytes = fs.readFileSync(invalid);
    bytes.write('nope', 20, 'ascii');
    fs.writeFileSync(invalid, bytes);
    assert.throws(() => store.importFile(invalid), /invalid JSON metadata/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
