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

test('does not leak a service when its only consumer closes during startup', async () => {
  const events = [];
  let allowStart;
  const startGate = new Promise(resolve => { allowStart = resolve; });
  const manager = new LifecycleController({ logger: {} });
  manager.register('slow', {
    async start() { events.push('start:slow'); await startGate; },
    async stop() { events.push('stop:slow'); }
  });
  const opening = manager.acquire('slow', 'window', 'open');
  await new Promise(resolve => setTimeout(resolve, 0));
  await manager.release('slow', 'window', 'window closed during startup');
  allowStart();
  await opening;
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(manager.snapshot('slow').state, 'stopped');
  assert.deepEqual(events, ['start:slow', 'stop:slow']);
});

test('keeps transitive dependencies alive for a live consumer', async () => {
  const events = [];
  const manager = new LifecycleController({ logger: {} });
  manager.register('network', service(events, 'network'));
  manager.register('brain', service(events, 'brain'), { dependencies: ['network'] });
  manager.register('chat', service(events, 'chat'), { dependencies: ['brain'] });

  await manager.acquire('brain', 'other-consumer', 'brain used elsewhere');
  await manager.acquire('chat', 'chat-window', 'chat opened');
  await manager.release('brain', 'other-consumer', 'direct brain consumer closed');
  assert.equal(manager.snapshot('brain').state, 'running');
  assert.equal(manager.snapshot('network').state, 'running');

  await manager.release('chat', 'chat-window', 'chat closed');
  assert.equal(manager.snapshot('chat').state, 'stopped');
  assert.equal(manager.snapshot('brain').state, 'stopped');
  assert.equal(manager.snapshot('network').state, 'stopped');
});


test('serializes a new acquire behind an in-progress stop', async () => {
  const events = [];
  let allowStop;
  const stopGate = new Promise(resolve => { allowStop = resolve; });
  const manager = new LifecycleController({ logger: {} });
  manager.register('worker', {
    async start() { events.push('start'); },
    async stop() { events.push('stop-start'); await stopGate; events.push('stop-end'); }
  });
  await manager.acquire('worker', 'consumer', 'first use');
  const releasing = manager.release('worker', 'consumer', 'last consumer gone');
  await new Promise(resolve => setTimeout(resolve, 0));
  const acquiring = manager.acquire('worker', 'consumer-2', 'immediate reacquire');
  allowStop();
  await Promise.all([releasing, acquiring]);
  assert.equal(manager.snapshot('worker').state, 'running');
  assert.deepEqual(events, ['start', 'stop-start', 'stop-end', 'start']);
});

test('attempts dispose even when stop fails during shutdown', async () => {
  const events = [];
  const manager = new LifecycleController({ logger: {} });
  manager.register('broken', {
    async start() {},
    async stop() { events.push('stop'); throw new Error('stop failed'); },
    async dispose() { events.push('dispose'); }
  });
  await manager.acquire('broken', 'consumer', 'start');
  await manager.shutdown();
  assert.deepEqual(events, ['stop', 'dispose']);
  assert.equal(manager.snapshot('broken').state, 'failed');
});


test('cleans partially allocated resources when a service start fails', async () => {
  const events = [];
  const manager = new LifecycleController({ logger: {} });
  manager.register('partial', {
    async start() { events.push('start'); throw new Error('start failed'); },
    async stop() { events.push('stop cleanup'); },
    async dispose() { events.push('dispose cleanup'); }
  });
  await assert.rejects(() => manager.acquire('partial', 'window', 'open'), /start failed/);
  assert.deepEqual(events, ['start', 'stop cleanup', 'dispose cleanup']);
  assert.equal(manager.snapshot('partial').state, 'failed');
  assert.deepEqual(manager.snapshot('partial').consumers, []);
});

test('shutdown still disposes a service when its stop hook throws', async () => {
  const events = [];
  const manager = new LifecycleController({ logger: {} });
  manager.register('broken-stop', {
    async start() {},
    async stop() { events.push('stop'); throw new Error('stop failed'); },
    async dispose() { events.push('dispose'); }
  });
  await manager.acquire('broken-stop', 'test', 'test');
  await manager.shutdown();
  assert.deepEqual(events, ['stop', 'dispose']);
  assert.equal(manager.snapshot('broken-stop').state, 'failed');
});
