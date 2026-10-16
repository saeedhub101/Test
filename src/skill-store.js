'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

class SkillStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.skills = [];
    this.load();
  }

  load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      this.skills = Array.isArray(data) ? data.filter(skill => this.#validStored(skill)).slice(0, 200) : [];
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('[learning] Could not load skills:', error.message);
      this.skills = [];
    }
    return this.list();
  }

  list() {
    return this.skills.map(({ id, title, content, tags, createdAt, updatedAt }) => ({ id, title, content, tags: [...tags], createdAt, updatedAt }));
  }

  search(query) {
    const terms = String(query || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return this.list();
    return this.list().map(skill => ({
      ...skill,
      score: terms.reduce((score, term) => score + (skill.title.toLocaleLowerCase().includes(term) ? 3 : 0) + (skill.tags.join(' ').toLocaleLowerCase().includes(term) ? 2 : 0) + (skill.content.toLocaleLowerCase().includes(term) ? 1 : 0), 0)
    })).filter(skill => skill.score > 0).sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt).slice(0, 20);
  }

  save({ id, title, content, tags = [] } = {}) {
    title = String(title || '').trim();
    content = String(content || '').trim();
    if (!title || title.length > 120) throw new TypeError('Skill title is required and must be 120 characters or fewer');
    if (!content || content.length > 8000) throw new TypeError('Skill content is required and must be 8000 characters or fewer');
    if (!Array.isArray(tags)) throw new TypeError('Skill tags must be an array');
    tags = [...new Set(tags.map(tag => String(tag).trim().slice(0, 40)).filter(Boolean))].slice(0, 12);
    const now = Date.now();
    const existing = id ? this.skills.find(skill => skill.id === id) : null;
    if (id && !existing) throw new Error('Skill not found');
    if (!existing && this.skills.length >= 200) throw new Error('Skill limit reached (200)');
    const next = { id: existing?.id || crypto.randomUUID(), title, content, tags, createdAt: existing?.createdAt || now, updatedAt: now };
    this.skills = existing ? this.skills.map(skill => skill.id === id ? next : skill) : [next, ...this.skills];
    this.#persist();
    return { ...next, tags: [...next.tags] };
  }

  delete(id) {
    const before = this.skills.length;
    this.skills = this.skills.filter(skill => skill.id !== id);
    if (this.skills.length === before) return false;
    this.#persist();
    return true;
  }

  #validStored(skill) {
    return skill && typeof skill.id === 'string' && typeof skill.title === 'string' && typeof skill.content === 'string' &&
      skill.title.length > 0 && skill.title.length <= 120 && skill.content.length > 0 && skill.content.length <= 8000 &&
      Array.isArray(skill.tags) && Number.isFinite(skill.createdAt) && Number.isFinite(skill.updatedAt);
  }

  #persist() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temp = this.filePath + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(this.skills, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temp, this.filePath);
  }
}

module.exports = { SkillStore };
