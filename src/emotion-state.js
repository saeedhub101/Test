'use strict';

const BASE = Object.freeze({
  curiosity: 0.25,
  happiness: 0.35,
  thinking: 0.05,
  confusion: 0.05,
  satisfaction: 0.15,
  sleepiness: 0.1,
  calm: 0.65
});

const EFFECTS = Object.freeze({
  greeting: { happiness: 0.15, curiosity: 0.12, sleepiness: -0.08 },
  listening: { curiosity: 0.12, calm: 0.08 },
  thinking: { thinking: 0.45, curiosity: 0.06, calm: -0.08 },
  tool_started: { thinking: 0.18, curiosity: 0.08 },
  tool_succeeded: { satisfaction: 0.35, happiness: 0.15, thinking: -0.15 },
  task_completed: { satisfaction: 0.28, happiness: 0.12, thinking: -0.2 },
  tool_failed: { confusion: 0.28, thinking: 0.18, calm: -0.12 },
  sleep: { sleepiness: 0.45, thinking: -0.2, calm: 0.12 },
  wake: { sleepiness: -0.4, curiosity: 0.12, happiness: 0.06 }
});

class EmotionState {
  constructor({ values = BASE, updatedAt = Date.now(), halfLifeMs = 90000 } = {}) {
    this.values = { ...BASE, ...values };
    this.updatedAt = updatedAt;
    this.halfLifeMs = halfLifeMs;
    this.#clamp();
  }

  apply(eventType, now = Date.now()) {
    this.#decay(now);
    const changes = EFFECTS[eventType] || {};
    for (const [name, delta] of Object.entries(changes)) {
      this.values[name] = (this.values[name] ?? BASE[name] ?? 0.5) + delta;
    }
    this.#clamp();
    this.updatedAt = now;
    return this.snapshot(now);
  }

  snapshot(now = Date.now()) {
    this.#decay(now);
    const values = { ...this.values };
    const dominant = Object.entries(values)
      .filter(([name]) => name !== 'calm')
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'calm';
    return { values, dominant, updatedAt: this.updatedAt };
  }

  #decay(now) {
    const elapsed = Math.max(0, now - this.updatedAt);
    if (!elapsed) return;
    const factor = Math.pow(0.5, elapsed / this.halfLifeMs);
    for (const name of Object.keys(BASE)) {
      this.values[name] = BASE[name] + (this.values[name] - BASE[name]) * factor;
    }
    this.updatedAt = now;
  }

  #clamp() {
    for (const name of Object.keys(BASE)) {
      const value = Number(this.values[name]);
      this.values[name] = Math.max(0, Math.min(1, Number.isFinite(value) ? value : BASE[name]));
    }
  }
}

module.exports = { EmotionState, BASE, EFFECTS };
