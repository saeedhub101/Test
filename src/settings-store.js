'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = Object.freeze({
  characterSize: 'small',
  alwaysOnTop: true,
  lowPowerMode: true,
  clickThrough: false,
  muted: false,
  animationsPaused: false
});
const SIZES = Object.freeze({
  small: { width: 300, height: 400 },
  medium: { width: 420, height: 560 },
  large: { width: 560, height: 740 }
});

class SettingsStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.value = { ...DEFAULTS };
    this.load();
  }

  load() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      this.value = {
        characterSize: SIZES[saved.characterSize] ? saved.characterSize : DEFAULTS.characterSize,
        alwaysOnTop: typeof saved.alwaysOnTop === 'boolean' ? saved.alwaysOnTop : DEFAULTS.alwaysOnTop,
        lowPowerMode: typeof saved.lowPowerMode === 'boolean' ? saved.lowPowerMode : DEFAULTS.lowPowerMode,
        clickThrough: typeof saved.clickThrough === 'boolean' ? saved.clickThrough : DEFAULTS.clickThrough,
        muted: typeof saved.muted === 'boolean' ? saved.muted : DEFAULTS.muted,
        animationsPaused: typeof saved.animationsPaused === 'boolean' ? saved.animationsPaused : DEFAULTS.animationsPaused
      };
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('[settings] Could not load settings; using defaults:', error.message);
      this.value = { ...DEFAULTS };
    }
    return this.get();
  }

  get() {
    return { ...this.value, characterBounds: { ...SIZES[this.value.characterSize] } };
  }

  update(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new TypeError('Settings update must be an object');
    }
    const allowed = new Set(['characterSize', 'alwaysOnTop', 'lowPowerMode', 'clickThrough', 'muted', 'animationsPaused']);
    const unknown = Object.keys(patch).filter(key => !allowed.has(key));
    if (unknown.length) throw new TypeError('Unknown settings key(s): ' + unknown.join(', '));
    const next = { ...this.value };
    if ('characterSize' in patch) {
      if (!Object.hasOwn(SIZES, patch.characterSize)) throw new TypeError('Invalid character size');
      next.characterSize = patch.characterSize;
    }
    for (const key of ['alwaysOnTop', 'lowPowerMode', 'clickThrough', 'muted', 'animationsPaused']) {
      if (key in patch) {
        if (typeof patch[key] !== 'boolean') throw new TypeError(`${key} must be boolean`);
        next[key] = patch[key];
      }
    }
    // Commit the in-memory state only after durable persistence succeeds.
    // A failed disk write must not leave this process reporting settings that
    // will disappear on the next restart.
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
      fs.renameSync(temp, this.filePath);
    } catch (error) {
      try { fs.rmSync(temp, { force: true }); } catch {}
      throw error;
    }
    this.value = next;
    return this.get();
  }
}

module.exports = { SettingsStore, DEFAULTS, SIZES };
