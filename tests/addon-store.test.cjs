'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AddonStore, validatePack } = require('../src/addon-store');

test('imports, enables, searches, and removes a declarative skill pack', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saeed-addons-'));
  try {
    const source = path.join(dir, 'pack.json');
    fs.writeFileSync(source, JSON.stringify({
      name: 'Office workflows', version: '1.0.0', type: 'skill-pack',
      description: 'Reusable office guidance',
      skills: [{ title: 'Prepare a report', content: 'Summarize verified data and list missing inputs.', tags: ['report', 'office'] }]
    }));
    const store = new AddonStore(path.join(dir, 'library'));
    const [pack] = store.importFile(source);
    assert.equal(pack.enabled, false);
    assert.equal(store.searchSkills('report').length, 0);
    store.setEnabled(pack.id, true);
    assert.equal(store.searchSkills('report')[0].title, 'Prepare a report');
    assert.equal(new AddonStore(path.join(dir, 'library')).list()[0].enabled, true);
    assert.equal(store.remove(pack.id), true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('rejects executable add-ons and invalid skill definitions', () => {
  assert.throws(() => validatePack({ name: 'Unsafe', type: 'javascript', skills: [] }), /executable code is not accepted/);
  assert.throws(() => validatePack({ name: 'Empty', type: 'skill-pack', skills: [{ title: '', content: '' }] }), /Each skill needs/);
});


test('does not change enabled state when add-on persistence fails', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saeed-addons-'));
  try {
    const source = path.join(dir, 'pack.json');
    fs.writeFileSync(source, JSON.stringify({
      name: 'Test pack', version: '1.0.0', type: 'skill-pack',
      skills: [{ title: 'One skill', content: 'A test skill.' }]
    }));
    const library = path.join(dir, 'library');
    const store = new AddonStore(library);
    const [pack] = store.importFile(source);
    const blocked = path.join(dir, 'blocked');
    fs.writeFileSync(blocked, 'not a directory');
    store.directory = blocked;
    assert.throws(() => store.setEnabled(pack.id, true));
    assert.equal(store.list()[0].enabled, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
