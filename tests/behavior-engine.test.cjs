'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('BehaviorEngine maps semantic events to small motion offsets without owning the rig', async () => {
  const { BehaviorEngine } = await import('../src/behavior-engine.mjs');
  const engine = new BehaviorEngine({ random: () => 0 });
  engine.handleEvent({ type: 'greeting', emotionState: { values: { curiosity: 0.5, happiness: 0.7 } } }, 1000);
  const head = engine.boneOffsets('Head', 1200);
  const spine = engine.boneOffsets('Spine', 1200);
  assert.ok(Number.isFinite(head.x) && Number.isFinite(head.z));
  assert.ok(Number.isFinite(spine.x));
  assert.equal(engine.shouldBlink(1200), true);
});

test('BehaviorEngine decays event reactions by ending their active window', async () => {
  const { BehaviorEngine } = await import('../src/behavior-engine.mjs');
  const engine = new BehaviorEngine({ random: () => 0.5 });
  engine.handleEvent({ type: 'thinking' }, 100);
  assert.notEqual(engine.boneOffsets('Head', 200).y, 0);
  assert.equal(engine.boneOffsets('Head', 5000).y, 0);
});

test('random idle gestures do not repeat immediately and defer during active user work', async () => {
  const { BehaviorEngine } = await import('../src/behavior-engine.mjs');
  const engine = new BehaviorEngine({ random: () => 0 });
  engine.handleEvent({ type: 'thinking' }, 0);
  assert.equal(engine.pollIdle(6000), null);
  engine.handleEvent({ type: 'wake' }, 20000);
  const first = engine.pollIdle(30000);
  assert.ok(first);
  const second = engine.pollIdle(40000);
  assert.ok(second);
  assert.notEqual(first, second);
});

test('sleep suppresses idle gestures until a wake event', async () => {
  const { BehaviorEngine } = await import('../src/behavior-engine.mjs');
  const engine = new BehaviorEngine({ random: () => 0 });
  engine.handleEvent({ type: 'sleep' }, 100);
  assert.equal(engine.pollIdle(20000), null);
  assert.ok(engine.boneOffsets('Head', 20000).x > 0.02);
  engine.handleEvent({ type: 'wake' }, 21000);
  assert.equal(engine.sleeping, false);
});
