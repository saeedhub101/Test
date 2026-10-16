'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateGlb } = require('../scripts/fetch-character-asset');

function glbHeader(size = 20) {
  const data = Buffer.alloc(size);
  data.write('glTF', 0, 'ascii');
  data.writeUInt32LE(2, 4);
  data.writeUInt32LE(size, 8);
  return data;
}

test('accepts a correctly sized GLB v2 header', () => {
  assert.equal(validateGlb(glbHeader()), true);
});

test('rejects invalid GLB signatures, versions, and declared lengths', () => {
  const badSignature = glbHeader();
  badSignature.write('NOPE', 0, 'ascii');
  assert.throws(() => validateGlb(badSignature), /invalid GLB signature/);

  const badVersion = glbHeader();
  badVersion.writeUInt32LE(1, 4);
  assert.throws(() => validateGlb(badVersion), /version 2/);

  const badLength = glbHeader();
  badLength.writeUInt32LE(21, 8);
  assert.throws(() => validateGlb(badLength), /length header/);
});

test('pins the canonical character asset to an immutable source commit', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'fetch-character-asset.js'), 'utf8');
  assert.match(script, /Saeed-V2\.0\/[0-9a-f]{40}\/assets\/Saeed_AI-3D\.glb/);
  assert.doesNotMatch(script, /Saeed-V2\.0\/main\/assets\/Saeed_AI-3D\.glb/);
});
