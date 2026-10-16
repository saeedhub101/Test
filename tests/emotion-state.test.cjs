'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EmotionState, BASE } = require('../src/emotion-state');

test('semantic events adjust persistent mood gradually', () => {
  const state = new EmotionState({ updatedAt: 1000 });
  const before = state.snapshot(1000);
  const after = state.apply('task_completed', 2000);
  assert.ok(after.values.satisfaction > before.values.satisfaction);
  const later = state.snapshot(3000);
  assert.ok(later.values.satisfaction < after.values.satisfaction);
  assert.ok(later.values.satisfaction > BASE.satisfaction);
});

test('unknown events decay toward neutral without invalid values', () => {
  const state = new EmotionState({ values: { happiness: 1 }, updatedAt: 0, halfLifeMs: 1000 });
  const result = state.snapshot(1000);
  assert.ok(result.values.happiness < 1);
  assert.ok(result.values.happiness > BASE.happiness);
  for (const value of Object.values(result.values)) assert.ok(value >= 0 && value <= 1);
});
