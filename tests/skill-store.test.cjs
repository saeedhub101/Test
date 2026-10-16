'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SkillStore } = require('../src/skill-store');

test('saves, searches, edits and deletes user-approved skills', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saeed-skills-'));
  try {
    const file = path.join(dir, 'skills.json');
    const store = new SkillStore(file);
    const skill = store.save({ title: 'Insurance renewal', content: 'Check policy expiry and verify required documents.', tags: ['insurance', 'renewal'] });
    assert.equal(store.search('policy').length, 1);
    assert.equal(store.search('renewal')[0].id, skill.id);
    store.save({ id: skill.id, title: 'Policy workflow', content: 'Confirm identity and expiry date before submission.', tags: ['policy'] });
    assert.equal(store.list()[0].title, 'Policy workflow');
    assert.equal(new SkillStore(file).list().length, 1);
    assert.equal(store.delete(skill.id), true);
    assert.equal(store.delete(skill.id), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('rejects empty or oversized skill content', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saeed-skills-'));
  try {
    const store = new SkillStore(path.join(dir, 'skills.json'));
    assert.throws(() => store.save({ title: '', content: 'text' }), /title is required/);
    assert.throws(() => store.save({ title: 'Valid', content: 'x'.repeat(8001) }), /8000 characters/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
