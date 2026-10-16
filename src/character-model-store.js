'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { AccessoryStore } = require('./accessory-store');

class CharacterModelStore {
  constructor({ directory, defaultPath, statePath }) {
    this.library = new AccessoryStore(directory);
    this.defaultPath = defaultPath;
    this.statePath = statePath;
    this.selectedId = '';
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (typeof state.selectedId === 'string') this.selectedId = state.selectedId;
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('[models] Could not read selection:', error.message);
    }
    if (this.selectedId && !this.library.list().some(item => item.id === this.selectedId)) this.selectedId = '';
  }

  list() {
    return [
      { id: '', name: 'Saeed default model', bytes: fs.existsSync(this.defaultPath) ? fs.statSync(this.defaultPath).size : 0, selected: !this.selectedId, isDefault: true },
      ...this.library.list().map(item => ({ ...item, selected: item.id === this.selectedId, isDefault: false }))
    ];
  }

  getSelectedPath() {
    return this.selectedId ? this.library.getPath(this.selectedId) : this.defaultPath;
  }

  importFile(sourcePath) {
    return this.library.importFile(sourcePath);
  }

  select(id) {
    if (id && !this.library.list().some(item => item.id === id)) throw new Error('Character model not found');
    const nextId = id || '';
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    const temp = this.statePath + '.' + process.pid + '.tmp';
    try {
      fs.writeFileSync(temp, JSON.stringify({ selectedId: nextId }, null, 2) + '\n', { mode: 0o600 });
      fs.renameSync(temp, this.statePath);
    } catch (error) {
      try { fs.rmSync(temp, { force: true }); } catch {}
      throw error;
    }
    this.selectedId = nextId;
    return this.list();
  }

  remove(id) {
    if (id === this.selectedId) this.select('');
    this.library.remove(id);
    return this.list();
  }

  profilePath(userDataPath) {
    return this.selectedId
      ? path.join(userDataPath, 'character-profiles', this.selectedId + '.json')
      : path.join(userDataPath, 'character-profile.json');
  }
}

module.exports = { CharacterModelStore };
