'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CharacterProfileStore, validateProfile } = require('../src/character-profile-store');

test('saves and reloads bone rotations and morph weights', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saeed-profile-'));
  const file = path.join(dir, 'profile.json');
  try {
    const store = new CharacterProfileStore(file);
    store.save({ boneRotations: { Head: { x: 10, y: -20, z: 5 } }, morphWeights: { Smile: 0.75 } });
    const profile = new CharacterProfileStore(file).get();
    assert.deepEqual(profile.boneRotations.Head, { x: 10, y: -20, z: 5 });
    assert.equal(profile.morphWeights.Smile, 0.75);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('rejects unsafe rotation and morph values', () => {
  assert.throws(() => validateProfile({ boneRotations: { Head: { x: 181 } } }), /Invalid rotation/);
  assert.throws(() => validateProfile({ morphWeights: { Smile: 2 } }), /Invalid morph weight/);
});

test('ignores invalid profile sections and normalizes missing axes', () => {
  const profile = validateProfile({ boneRotations: { Head: { y: 25 } }, morphWeights: {} });
  assert.deepEqual(profile.boneRotations.Head, { x: 0, y: 25, z: 0 });
});
