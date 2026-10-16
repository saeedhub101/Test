'use strict';

export class BehaviorEngine {
  constructor({ random = Math.random } = {}) {
    this.random = random;
    this.mood = 'neutral';
    this.emotionState = null;
    this.behaviorUntil = 0;
    this.nextBlinkAt = 0;
  }

  handleEvent(event, now) {
    if (!event || typeof event.type !== 'string') return;
    if (event.emotionState) this.emotionState = event.emotionState;
    if (event.type === 'emotion_state') return;
    const durations = {
      greeting: 1800, listening: 500, thinking: 1200, tool_started: 600,
      tool_succeeded: 1600, tool_failed: 1300, task_completed: 1600,
      sleep: 0, wake: 1000
    };
    this.mood = event.type;
    this.behaviorUntil = now + (durations[event.type] ?? 700);
    if (['greeting', 'wake', 'tool_succeeded', 'task_completed'].includes(event.type)) {
      this.nextBlinkAt = Math.min(this.nextBlinkAt || Infinity, now + 150);
    }
  }

  boneOffsets(name, now) {
    const phase = now / 1500;
    const normalized = String(name || '').toLowerCase();
    const offsets = { x: 0, y: 0, z: 0 };
    const emotions = this.emotionState?.values || {};
    if (/(head|neck)/.test(normalized)) {
      offsets.x += Math.sin(phase) * 0.012;
      offsets.z += Math.sin(phase * 0.35) * ((emotions.curiosity || 0.25) * 0.025);
      if ((emotions.happiness || 0) > 0.6) offsets.z += Math.sin(phase * 0.7) * 0.008;
      if (now < this.behaviorUntil) {
        if (['greeting', 'wake', 'task_completed', 'tool_succeeded'].includes(this.mood)) {
          offsets.z += Math.sin((now - (this.behaviorUntil - 1600)) / 1600 * Math.PI) * 0.08;
        }
        if (this.mood === 'thinking') offsets.y += 0.06;
        if (this.mood === 'tool_failed') offsets.z -= 0.045;
      }
    }
    if (/(spine|chest|upperchest)/.test(normalized)) offsets.x += Math.sin(phase) * 0.006;
    return offsets;
  }

  shouldBlink(now) {
    if (!this.nextBlinkAt) this.nextBlinkAt = now + 2500 + this.random() * 3500;
    if (now < this.nextBlinkAt) return false;
    this.nextBlinkAt = now + 2500 + this.random() * 3500;
    return true;
  }
}
