'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SettingsStore, DEFAULTS, SIZES } = require('../src/settings-store');

function temporaryStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'saeed-settings-'));
  const file = path.join(directory, 'settings.json');
  return { store: new SettingsStore(file), file, directory };
}

test('uses safe defaults and persists valid settings', () => {
  const { store, file, directory } = temporaryStore();
  try {
    assert.equal(store.get().characterSize, DEFAULTS.characterSize);
    const saved = store.update({ characterSize: 'large', lowPowerMode: false, clickThrough: true });
    assert.equal(saved.characterBounds.width, SIZES.large.width);
    const reloaded = new SettingsStore(file).get();
    assert.equal(reloaded.characterSize, 'large');
    assert.equal(reloaded.lowPowerMode, false);
    assert.equal(reloaded.clickThrough, true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects invalid setting values without corrupting current state', () => {
  const { store, directory } = temporaryStore();
  try {
    assert.throws(() => store.update({ characterSize: 'giant' }), /Invalid character size/);
    assert.throws(() => store.update({ clickThrough: 'yes' }), /must be boolean/);
    assert.equal(store.get().characterSize, DEFAULTS.characterSize);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('recovers from malformed persisted JSON using defaults', () => {
  const { store, file, directory } = temporaryStore();
  try {
    fs.writeFileSync(file, '{broken');
    const reloaded = new SettingsStore(file).get();
    assert.equal(reloaded.characterSize, DEFAULTS.characterSize);
    assert.equal(reloaded.alwaysOnTop, DEFAULTS.alwaysOnTop);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
