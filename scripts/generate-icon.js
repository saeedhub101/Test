'use strict';

const fs = require('node:fs');
const path = require('node:path');

const size = 32;
const xorBytes = size * size * 4;
const maskStride = Math.ceil(size / 32) * 4;
const maskBytes = maskStride * size;
const dib = Buffer.alloc(40 + xorBytes + maskBytes);
dib.writeUInt32LE(40, 0);
dib.writeInt32LE(size, 4);
dib.writeInt32LE(size * 2, 8);
dib.writeUInt16LE(1, 12);
dib.writeUInt16LE(32, 14);
dib.writeUInt32LE(0, 16);
dib.writeUInt32LE(xorBytes + maskBytes, 20);

const pixels = Buffer.alloc(xorBytes);
function setPixel(x, y, r, g, b, a = 255) {
  const offset = ((size - 1 - y) * size + x) * 4;
  pixels[offset] = b; pixels[offset + 1] = g; pixels[offset + 2] = r; pixels[offset + 3] = a;
}
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const dx = x - 15.5, dy = y - 15.5;
    if (dx * dx + dy * dy <= 14.5 * 14.5) setPixel(x, y, 24, 173, 158);
    else setPixel(x, y, 20, 25, 35, 0);
  }
}
const glyph = ['01111', '11000', '10000', '01110', '00001', '00011', '11110'];
const cell = 3, gx = 8, gy = 5;
for (let row = 0; row < glyph.length; row++) {
  for (let col = 0; col < glyph[row].length; col++) {
    if (glyph[row][col] !== '1') continue;
    for (let yy = 0; yy < cell; yy++) for (let xx = 0; xx < cell; xx++) {
      setPixel(gx + col * cell + xx, gy + row * cell + yy, 255, 255, 255);
    }
  }
}
pixels.copy(dib, 40);
// The 32-bit alpha channel is authoritative; a zeroed AND mask is conventional.
const directory = Buffer.alloc(6 + 16);
directory.writeUInt16LE(0, 0);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(1, 4);
directory.writeUInt8(size, 6);
directory.writeUInt8(size, 7);
directory.writeUInt8(0, 8);
directory.writeUInt8(0, 9);
directory.writeUInt16LE(1, 10);
directory.writeUInt16LE(32, 12);
directory.writeUInt32LE(dib.length, 14);
directory.writeUInt32LE(directory.length, 18);
const output = Buffer.concat([directory, dib]);
const destination = path.join(__dirname, '..', 'assets', 'saeed.ico');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, output);
console.log('Generated Saeed icon:', destination, '(' + output.length + ' bytes)');
