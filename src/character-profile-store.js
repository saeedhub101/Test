'use strict';

const fs = require('node:fs');
const path = require('node:path');

function validateProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Character profile must be an object');
  const boneRotations = {};
  for (const [name, rotation] of Object.entries(input.boneRotations || {})) {
    if (!name || !rotation || typeof rotation !== 'object') continue;
    const values = {};
    for (const axis of ['x', 'y', 'z']) {
      const value = rotation[axis] ?? 0;
      if (!Number.isFinite(value) || Math.abs(value) > 180) throw new TypeError(`Invalid rotation for ${name}.${axis}`);
      values[axis] = value;
    }
    boneRotations[name] = values;
  }
  const morphWeights = {};
  for (const [name, weight] of Object.entries(input.morphWeights || {})) {
    if (!name || !Number.isFinite(weight) || weight < 0 || weight > 1) throw new TypeError(`Invalid morph weight: ${name}`);
    morphWeights[name] = weight;
  }
  const accessories = Array.isArray(input.accessories) ? input.accessories.slice(0, 100).filter(item =>
    item && typeof item.id === 'string' && item.id.length <= 80
  ).map(item => ({
    id: item.id,
    enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
    attachBone: typeof item.attachBone === 'string' ? item.attachBone.slice(0, 200) : ''
  })) : [];
  const rawAxis = input.axisCorrection && typeof input.axisCorrection === 'object' ? input.axisCorrection : {};
  const axisCorrection = {};
  for (const axis of ['x', 'y', 'z']) {
    const sign = rawAxis[axis + 'Sign'] ?? 1;
    const scale = rawAxis[axis + 'Scale'] ?? 1;
    if (![1, -1].includes(sign)) throw new TypeError(`Invalid ${axis} axis sign`);
    if (!Number.isFinite(scale) || scale < 0.1 || scale > 3) throw new TypeError(`Invalid ${axis} axis scale`);
    axisCorrection[axis + 'Sign'] = sign;
    axisCorrection[axis + 'Scale'] = scale;
  }
  const rawAnimation = input.animation && typeof input.animation === 'object' ? input.animation : {};
  const animation = {
    clip: typeof rawAnimation.clip === 'string' ? rawAnimation.clip.slice(0, 200) : '',
    speed: Number.isFinite(rawAnimation.speed) && rawAnimation.speed >= 0.1 && rawAnimation.speed <= 2 ? rawAnimation.speed : 1,
    loop: typeof rawAnimation.loop === 'boolean' ? rawAnimation.loop : true
  };
  return { version: 1, boneRotations, morphWeights, axisCorrection, animation, accessories };
}

class CharacterProfileStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.profile = { version: 1, boneRotations: {}, morphWeights: {}, axisCorrection: { xSign: 1, ySign: 1, zSign: 1, xScale: 1, yScale: 1, zScale: 1 }, animation: { clip: '', speed: 1, loop: true }, accessories: [] };
    this.load();
  }
  load() {
    try { this.profile = validateProfile(JSON.parse(fs.readFileSync(this.filePath, 'utf8'))); }
    catch (error) {
      if (error.code !== 'ENOENT') console.warn('[character-profile] Using defaults:', error.message);
      this.profile = { version: 1, boneRotations: {}, morphWeights: {}, animation: { clip: '', speed: 1, loop: true } };
    }
    return this.get();
  }
  get() {
    return JSON.parse(JSON.stringify(this.profile));
  }
  save(input) {
    const next = validateProfile(input);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temp = this.filePath + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temp, this.filePath);
    this.profile = next;
    return this.get();
  }
}
module.exports = { CharacterProfileStore, validateProfile };
