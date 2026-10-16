'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('BehaviorEngine maps semantic events to small motion offsets without owning the rig', async () => {
  const { BehaviorEngine } = await import('../src/behavior-engine.js');
  const engine = new BehaviorEngine({ random: () => 0 });
  engine.handleEvent({ type: 'greeting', emotionState: { values: { curiosity: 0.5, happiness: 0.7 } } }, 1000);
  const head = engine.boneOffsets('Head', 1200);
  const spine = engine.boneOffsets('Spine', 1200);
  assert.ok(Number.isFinite(head.x) && Number.isFinite(head.z));
  assert.ok(Number.isFinite(spine.x));
  assert.equal(engine.shouldBlink(1100), true);
});

test('BehaviorEngine decays event reactions by ending their active window', async () => {
  const { BehaviorEngine } = await import('../src/behavior-engine.js');
  const engine = new BehaviorEngine({ random: () => 0.5 });
  engine.handleEvent({ type: 'thinking' }, 100);
  assert.notEqual(engine.boneOffsets('Head', 200).y, 0);
  assert.equal(engine.boneOffsets('Head', 5000).y, 0);
});
