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

test('persists validated axis sign and scale corrections', () => {
  const profile = validateProfile({ axisCorrection: { xSign: -1, yScale: 2.5 } });
  assert.equal(profile.axisCorrection.xSign, -1);
  assert.equal(profile.axisCorrection.yScale, 2.5);
  assert.equal(profile.axisCorrection.zSign, 1);
  assert.throws(() => validateProfile({ axisCorrection: { zSign: 0 } }), /axis sign/);
  assert.throws(() => validateProfile({ axisCorrection: { xScale: 4 } }), /axis scale/);
});

test('persists absolute rest-pose rotations independently from offsets', () => {
  const profile = validateProfile({ restPose: { Head: { x: 10, y: -20, z: 30 } }, boneRotations: { Head: { x: 2 } } });
  assert.deepEqual(profile.restPose.Head, { x: 10, y: -20, z: 30 });
  assert.deepEqual(profile.boneRotations.Head, { x: 2, y: 0, z: 0 });
  assert.throws(() => validateProfile({ restPose: { Head: { x: 400 } } }), /Invalid rest pose/);
});

test('persists only recognized semantic motion bindings', () => {
  const profile = validateProfile({ motionBindings: { greeting: 'Wave', tool_failed: 'Confused', unknown: 'Unsafe' } });
  assert.deepEqual(profile.motionBindings, { greeting: 'Wave', tool_failed: 'Confused' });
  assert.throws(() => validateProfile({ motionBindings: { wake: 42 } }), /Invalid motion binding/);
});


test('recovers complete profile defaults after malformed saved JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saeed-profile-'));
  const file = path.join(dir, 'profile.json');
  try {
    fs.writeFileSync(file, '{broken');
    const profile = new CharacterProfileStore(file).get();
    assert.deepEqual(profile.axisCorrection, { xSign: 1, ySign: 1, zSign: 1, xScale: 1, yScale: 1, zScale: 1 });
    assert.deepEqual(profile.motionBindings, {});
    assert.deepEqual(profile.accessories, []);
    assert.deepEqual(profile.animation, { clip: '', speed: 1, loop: true });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});


test('keeps the active profile unchanged when profile persistence fails', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saeed-profile-'));
  try {
    const blocked = path.join(dir, 'blocked');
    const store = new CharacterProfileStore(path.join(blocked, 'profile.json'));
    const before = store.get();
    fs.writeFileSync(blocked, 'not a directory');
    assert.throws(() => store.save(before));
    assert.deepEqual(store.get(), before);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
