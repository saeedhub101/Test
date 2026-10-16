'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LifecycleController } = require('../src/lifecycle-controller');

function makeService(events, name) {
  return {
    async start() { events.push('start:' + name); },
    async stop() { events.push('stop:' + name); }
  };
}

test('startup loads only character; chat demand starts brain and microphone demand starts STT', async () => {
  const events = [];
  const lifecycle = new LifecycleController({ logger: {} });
  lifecycle.register('character', makeService(events, 'character'));
  lifecycle.register('brain', makeService(events, 'brain'));
  lifecycle.register('stt', makeService(events, 'stt'), { dependencies: ['brain'] });
  lifecycle.register('chat', makeService(events, 'chat'), { dependencies: ['brain'] });
  await lifecycle.acquire('character', 'tray-character', 'startup');
  assert.deepEqual(events, ['start:character']);
  await lifecycle.acquire('chat', 'chat-window', 'open chat');
  assert.deepEqual(events, ['start:character', 'start:brain', 'start:chat']);
  await lifecycle.acquire('stt', 'chat-mic', 'mic on');
  assert.deepEqual(events, ['start:character', 'start:brain', 'start:chat', 'start:stt']);
});

test('hiding character releases voice while chat keeps brain; closing chat stops unused services', async () => {
  const events = [];
  const lifecycle = new LifecycleController({ logger: {} });
  lifecycle.register('character', makeService(events, 'character'));
  lifecycle.register('brain', makeService(events, 'brain'));
  lifecycle.register('stt', makeService(events, 'stt'), { dependencies: ['brain'] });
  lifecycle.register('tts', makeService(events, 'tts'));
  lifecycle.register('chat', makeService(events, 'chat'), { dependencies: ['brain'] });
  await lifecycle.acquire('character', 'tray-character', 'startup');
  await lifecycle.acquire('chat', 'chat-window', 'open chat');
  await lifecycle.acquire('stt', 'chat-mic', 'mic on');
  await lifecycle.acquire('tts', 'chat-tts', 'speaking');
  await lifecycle.release('stt', 'chat-mic', 'hide character');
  await lifecycle.release('tts', 'chat-tts', 'hide character');
  await lifecycle.release('character', 'tray-character', 'hide character');
  assert.equal(lifecycle.snapshot('brain').state, 'running');
  assert.equal(lifecycle.snapshot('stt').state, 'stopped');
  assert.equal(lifecycle.snapshot('tts').state, 'stopped');
  await lifecycle.release('chat', 'chat-window', 'close chat');
  assert.equal(lifecycle.snapshot('brain').state, 'stopped');
  assert.equal(lifecycle.snapshot('character').state, 'stopped');
});
