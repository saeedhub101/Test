'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('packaging includes the Electron entry point and exactly one external GLB resource', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(packageJson.main, 'src/main.js');
  assert.ok(packageJson.build.files.includes('src/**'), 'the package file filter must include top-level and nested source files');
  assert.equal(packageJson.build.asar, true);
  assert.deepEqual(packageJson.build.extraResources, [{ from: 'assets/saeed.glb', to: 'assets/saeed.glb' }]);
  assert.equal(packageJson.build.extraResources.filter(item => item.from === 'assets/saeed.glb').length, 1);
});
