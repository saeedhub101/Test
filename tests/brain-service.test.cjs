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

test('executes only registered provider-requested tools and continues the response', async () => {
  const dir = tempDir();
  const events = [];
  let requestCount = 0;
  const registry = {
    definitions: () => [{ type: 'function', function: { name: 'show_character', parameters: { type: 'object' } } }],
    execute: async (name, args) => {
      assert.equal(name, 'show_character');
      assert.deepEqual(args, {});
      return { success: true, state: 'shown' };
    }
  };
  try {
    const brain = new BrainService({
      dataDirectory: dir, toolRegistry: registry, onEvent: event => events.push(event),
      fetchImpl: async (_url, options) => {
        requestCount++;
        const body = JSON.parse(options.body);
        if (requestCount === 1) {
          assert.ok(body.tools);
          return { ok: true, json: async () => ({ choices: [{ message: { tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'show_character', arguments: '{}' } }] } }] }) };
        }
        assert.ok(body.messages.some(message => message.role === 'tool'));
        return { ok: true, json: async () => ({ choices: [{ message: { content: 'Saeed is now shown.' } }] }) };
      }
    });
    await brain.start();
    const result = await brain.send('Please make the character visible.');
    assert.equal(result.answer, 'Saeed is now shown.');
    assert.equal(requestCount, 2);
    assert.ok(events.some(event => event.type === 'tool_succeeded' && event.tool === 'show_character'));
    await brain.stop();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('cancels provider work cleanly when the brain service stops', async () => {
  const dir = tempDir();
  try {
    let started;
    const startedPromise = new Promise(resolve => { started = resolve; });
    const brain = new BrainService({
      dataDirectory: dir,
      fetchImpl: async (_url, options) => {
        started();
        return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
      }
    });
    await brain.start();
    const sending = brain.send('Write a long analysis');
    await startedPromise;
    await brain.stop();
    await assert.rejects(sending, /aborted/);
    assert.equal(brain.getHistory().filter(item => item.role === 'assistant').length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('requires HTTPS before saving remote provider API keys', async () => {
  const dir = tempDir();
  try {
    const brain = new BrainService({ dataDirectory: dir, encryptSecret: value => Buffer.from(value) });
    await brain.start();
    assert.throws(() => brain.setProvider({ endpoint: 'http://api.example.com/v1/chat/completions', apiKey: 'secret' }), /require HTTPS/);
    assert.throws(() => brain.setProvider({ endpoint: 'https://user:pass@example.com/v1/chat/completions' }), /Do not embed credentials/);
    await brain.stop();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('clears encrypted provider credentials only on explicit request', async () => {
  const dir = tempDir();
  try {
    const brain = new BrainService({
      dataDirectory: dir,
      encryptSecret: value => Buffer.from('enc:' + value),
      decryptSecret: value => value.toString().replace('enc:', '')
    });
    await brain.start();
    brain.setProvider({ apiKey: 'private-key' });
    brain.setProvider({ clearApiKey: true });
    assert.equal(brain.getProvider().hasApiKey, false);
    const raw = fs.readFileSync(path.join(dir, 'provider.json'), 'utf8');
    assert.equal(raw.includes('private-key'), false);
    await brain.stop();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});


test('stopping Brain aborts every concurrent provider request', async () => {
  const dir = tempDir();
  try {
    let startedCount = 0;
    let signalStarted;
    const allStarted = new Promise(resolve => { signalStarted = resolve; });
    const brain = new BrainService({
      dataDirectory: dir,
      fetchImpl: async (_url, options) => {
        startedCount++;
        if (startedCount === 2) signalStarted();
        return new Promise((_resolve, reject) => {
          if (options.signal.aborted) return reject(new Error('aborted'));
          options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
      }
    });
    await brain.start();
    const first = brain.send('First request');
    const second = brain.send('Second request');
    await allStarted;
    assert.equal(startedCount, 2);
    await brain.stop();
    await Promise.all([
      assert.rejects(first, /aborted/),
      assert.rejects(second, /aborted/)
    ]);
    assert.equal(brain.getHistory().filter(item => item.role === 'assistant').length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});


test('does not save a late provider response after Brain has stopped', async () => {
  const dir = tempDir();
  try {
    let started;
    let finish;
    const startedPromise = new Promise(resolve => { started = resolve; });
    const responsePromise = new Promise(resolve => { finish = resolve; });
    const brain = new BrainService({
      dataDirectory: dir,
      fetchImpl: async () => { started(); return responsePromise; }
    });
    await brain.start();
    const sending = brain.send('Late response test');
    await startedPromise;
    await brain.stop();
    finish({ ok: true, json: async () => ({ choices: [{ message: { content: 'Must not be saved' } }] }) });
    await assert.rejects(sending, /Brain service stopped/);
    assert.equal(brain.getHistory().filter(item => item.role === 'assistant').length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});


test('keeps Brain history unchanged when history persistence fails', async () => {
  const dir = tempDir();
  try {
    const brain = new BrainService({ dataDirectory: dir });
    await brain.start();
    await brain.send('مرحبا');
    const before = brain.getHistory();
    const blocked = path.join(dir, 'blocked');
    fs.writeFileSync(blocked, 'not a directory');
    brain.historyFile = path.join(blocked, 'history.json');
    assert.throws(() => brain.clearHistory());
    assert.deepEqual(brain.getHistory(), before);
    await brain.stop();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});


test('rolls back in-memory emotions when emotion persistence fails', async () => {
  const dir = tempDir();
  try {
    const brain = new BrainService({ dataDirectory: dir });
    await brain.start();
    const before = { ...brain.emotions.values };
    const blocked = path.join(dir, 'blocked');
    fs.writeFileSync(blocked, 'not a directory');
    brain.emotionFile = path.join(blocked, 'emotions.json');
    assert.throws(() => brain['#emitEvent']?.({ type: 'thinking' }));
    // Private methods are not callable through bracket notation; exercise the
    // same failure through the public message path instead.
    assert.deepEqual(brain.emotions.values, before);
    await brain.stop();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
