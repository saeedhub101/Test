'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function validatePack(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Add-on pack must be a JSON object');
  const name = String(input.name || '').trim();
  const description = String(input.description || '').trim();
  const version = String(input.version || '1.0.0').trim();
  if (!name || name.length > 120) throw new TypeError('Add-on name is required and must be under 120 characters');
  if (description.length > 1000) throw new TypeError('Add-on description must be under 1000 characters');
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new TypeError('Add-on version must use major.minor.patch format');
  if (input.type !== 'skill-pack') throw new TypeError('Only declarative skill-pack add-ons are currently supported; executable code is not accepted');
  if (!Array.isArray(input.skills) || input.skills.length > 100) throw new TypeError('A skill pack must contain up to 100 skills');
  const skills = input.skills.map(skill => {
    const title = String(skill?.title || '').trim();
    const content = String(skill?.content || '').trim();
    if (!title || title.length > 120 || !content || content.length > 8000) throw new TypeError('Each skill needs a title (120 chars max) and content (8000 chars max)');
    const tags = Array.isArray(skill.tags) ? [...new Set(skill.tags.map(tag => String(tag).trim().slice(0, 40)).filter(Boolean))].slice(0, 12) : [];
    return { title, content, tags };
  });
  return { name, description, version, type: 'skill-pack', skills };
}

class AddonStore {
  constructor(directory) {
    this.directory = directory;
    this.packs = [];
    fs.mkdirSync(directory, { recursive: true });
    this.load();
  }

  load() {
    this.packs = [];
    for (const file of fs.readdirSync(this.directory).filter(name => name.endsWith('.json') && name !== 'state.json')) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(this.directory, file), 'utf8'));
        const pack = validatePack(data);
        this.packs.push({ id: path.basename(file, '.json'), ...pack, enabled: data.enabled === true });
      } catch (error) {
        console.warn('[addons] Skipping invalid add-on manifest:', file, error.message);
      }
    }
    return this.list();
  }

  list() {
    return this.packs.map(pack => ({ id: pack.id, name: pack.name, description: pack.description, version: pack.version, type: pack.type, enabled: pack.enabled, skillsCount: pack.skills.length }));
  }

  importFile(sourcePath) {
    const stat = fs.statSync(sourcePath);
    if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error('Add-on JSON must be a file under 1 MiB');
    const validated = validatePack(JSON.parse(fs.readFileSync(sourcePath, 'utf8')));
    const id = crypto.randomUUID();
    const destination = path.join(this.directory, id + '.json');
    const pack = { id, ...validated, enabled: false };
    fs.writeFileSync(destination, JSON.stringify(pack, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    this.packs.push(pack);
    return this.list();
  }

  setEnabled(id, enabled) {
    if (typeof enabled !== 'boolean') throw new TypeError('Enabled state must be boolean');
    const pack = this.packs.find(item => item.id === id);
    if (!pack) throw new Error('Add-on not found');
    const nextPack = { ...pack, enabled };
    this.#persist(nextPack);
    pack.enabled = enabled;
    return this.list();
  }

  remove(id) {
    const pack = this.packs.find(item => item.id === id);
    if (!pack) return false;
    fs.rmSync(path.join(this.directory, id + '.json'), { force: true });
    this.packs = this.packs.filter(item => item.id !== id);
    return true;
  }

  searchSkills(query) {
    const terms = String(query || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return this.packs.filter(pack => pack.enabled).flatMap(pack => pack.skills.map(skill => ({
      ...skill, addon: pack.name,
      score: terms.reduce((score, term) => score + (skill.title.toLocaleLowerCase().includes(term) ? 3 : 0) + (skill.tags.join(' ').toLocaleLowerCase().includes(term) ? 2 : 0) + (skill.content.toLocaleLowerCase().includes(term) ? 1 : 0), 0)
    }))).filter(skill => !terms.length || skill.score > 0).sort((a, b) => b.score - a.score).slice(0, 20);
  }

  #persist(pack) {
    const temp = path.join(this.directory, pack.id + '.' + process.pid + '.json.tmp');
    const target = path.join(this.directory, pack.id + '.json');
    try {
      fs.writeFileSync(temp, JSON.stringify(pack, null, 2) + '\n', { mode: 0o600 });
      fs.renameSync(temp, target);
    } catch (error) {
      try { fs.rmSync(temp, { force: true }); } catch {}
      throw error;
    }
  }
}

module.exports = { AddonStore, validatePack };
