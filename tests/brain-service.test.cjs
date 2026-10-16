'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { BrainService } = require('../src/brain-service');

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'saeed-brain-')); }

test('uses local intents without calling the AI provider and persists history', async () => {
  const dir = tempDir();
  let calls = 0;
  try {
    const brain = new BrainService({ dataDirectory: dir, fetchImpl: async () => { calls++; throw new Error('should not call'); } });
    await brain.start();
    const result = await brain.send('مرحبا');
    assert.equal(result.source, 'local');
    assert.match(result.answer, /أهلاً/);
    assert.equal(calls, 0);
    const reloaded = new BrainService({ dataDirectory: dir });
    await reloaded.start();
    assert.equal(reloaded.getHistory().length, 2);
    await brain.stop();
    await reloaded.stop();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('sends conversation to an OpenAI-compatible endpoint', async () => {
  const dir = tempDir();
  let request;
  try {
    const brain = new BrainService({
      dataDirectory: dir,
      fetchImpl: async (url, options) => {
        request = { url, options, body: JSON.parse(options.body) };
        return { ok: true, json: async () => ({ choices: [{ message: { content: 'Answer from test model' } }] }) };
      }
    });
    await brain.start();
    brain.setProvider({ endpoint: 'http://127.0.0.1:11434/v1/chat/completions', model: 'test-model' });
    const result = await brain.send('Explain this');
    assert.equal(result.source, 'provider');
    assert.equal(result.answer, 'Answer from test model');
    assert.equal(request.body.model, 'test-model');
    assert.equal(request.body.messages.at(-1).content, 'Explain this');
    await brain.stop();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('returns honest offline fallback when provider is unreachable', async () => {
  const dir = tempDir();
  try {
    const brain = new BrainService({ dataDirectory: dir, fetchImpl: async () => { throw new Error('connection refused'); } });
    await brain.start();
    const result = await brain.send('How are you?');
    assert.equal(result.source, 'offline-fallback');
    assert.match(result.answer, /couldn't reach an AI model/i);
    await brain.stop();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('does not persist API key in plaintext and retains it on blank update', () => {
  const dir = tempDir();
  try {
    const brain = new BrainService({
      dataDirectory: dir,
      encryptSecret: value => Buffer.from('encrypted:' + value),
      decryptSecret: value => value.toString().replace('encrypted:', '')
    });
    return (async () => {
      await brain.start();
      brain.setProvider({ apiKey: 'secret-token' });
      brain.setProvider({ model: 'changed-model', apiKey: '' });
      assert.equal(brain.getProvider().hasApiKey, true);
      const raw = fs.readFileSync(path.join(dir, 'provider.json'), 'utf8');
      assert.equal(raw.includes('secret-token'), false);
      const restored = new BrainService({ dataDirectory: dir, encryptSecret: value => value, decryptSecret: value => value.toString().replace('encrypted:', '') });
      await restored.start();
      assert.equal(restored.getProvider().hasApiKey, true);
    })().finally(() => fs.rmSync(dir, { recursive: true, force: true }));
  } finally {
    // Cleanup is performed after the async assertions above.
  }
});

test('emits a semantic lifecycle command for a local character intent', async () => {
  const dir = tempDir();
  const events = [];
  try {
    const brain = new BrainService({ dataDirectory: dir, onEvent: event => events.push(event) });
    await brain.start();
    const result = await brain.send('hide saeed');
    assert.equal(result.source, 'local');
    assert.ok(events.some(event => event.type === 'command' && event.action === 'hide-character'));
    await brain.stop();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
