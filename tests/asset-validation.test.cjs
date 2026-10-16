'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateGlb } = require('../scripts/fetch-character-asset');

function validHeader() {
  const buffer = Buffer.alloc(20);
  buffer.write('glTF', 0, 'ascii');
  buffer.writeUInt32LE(2, 4);
  buffer.writeUInt32LE(buffer.length, 8);
  return buffer;
}

test('accepts a structurally valid GLB v2 header', () => {
  assert.equal(validateGlb(validHeader()), true);
});

test('rejects non-GLB data', () => {
  const buffer = validHeader();
  buffer.write('NOPE', 0, 'ascii');
  assert.throws(() => validateGlb(buffer), /signature/);
});

test('rejects unsupported GLB versions', () => {
  const buffer = validHeader();
  buffer.writeUInt32LE(1, 4);
  assert.throws(() => validateGlb(buffer), /version 2/);
});

test('rejects a length header that differs from actual bytes', () => {
  const buffer = validHeader();
  buffer.writeUInt32LE(999, 8);
  assert.throws(() => validateGlb(buffer), /length header/);
});

test('rejects truncated files', () => {
  assert.throws(() => validateGlb(Buffer.from('glTF')), /too small/);
});
