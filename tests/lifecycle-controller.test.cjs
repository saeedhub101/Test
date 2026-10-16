'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LifecycleController } = require('../src/lifecycle-controller');

function service(events, name) {
  return {
    async start() { events.push(`start:${name}`); },
    async stop() { events.push(`stop:${name}`); },
    async dispose() { events.push(`dispose:${name}`); }
  };
}

test('starts dependencies once and stops only after last consumer releases', async () => {
  const events = [];
  const manager = new LifecycleController({ logger: {} });
  manager.register('shared', service(events, 'shared'));
  manager.register('chat', service(events, 'chat'), { dependencies: ['shared'] });

  await manager.acquire('shared', 'character-window', 'character visible');
  await manager.acquire('chat', 'chat-window', 'chat opened');
  assert.deepEqual(events, ['start:shared', 'start:chat']);

  await manager.release('shared', 'character-window', 'character hidden');
  assert.equal(manager.snapshot('shared').state, 'running', 'dependency stays active while chat uses it');

  await manager.release('chat', 'chat-window', 'chat closed');
  assert.equal(manager.snapshot('chat').state, 'stopped');
  assert.equal(manager.snapshot('shared').state, 'stopped');
  assert.deepEqual(events, ['start:shared', 'start:chat', 'stop:chat', 'stop:shared']);
});

test('deduplicates concurrent starts', async () => {
  let starts = 0;
  const manager = new LifecycleController({ logger: {} });
  manager.register('voice', {
    async start() { starts++; await new Promise(resolve => setTimeout(resolve, 5)); },
    async stop() {}
  });
  await Promise.all([
    manager.acquire('voice', 'mic', 'mic on'),
    manager.acquire('voice', 'chat', 'chat needs voice')
  ]);
  assert.equal(starts, 1);
  assert.equal(manager.snapshot('voice').consumers.length, 2);
});

test('shutdown disposes active services in reverse registration order', async () => {
  const events = [];
  const manager = new LifecycleController({ logger: {} });
  manager.register('character', service(events, 'character'));
  manager.register('chat', service(events, 'chat'));
  await manager.acquire('character', 'tray', 'startup');
  await manager.acquire('chat', 'chat-window', 'open chat');
  await manager.shutdown();
  assert.deepEqual(events, [
    'start:character', 'start:chat',
    'stop:chat', 'dispose:chat',
    'stop:character', 'dispose:character'
  ]);
  await assert.rejects(() => manager.acquire('chat', 'late', 'after shutdown'), /shutting down/);
});
