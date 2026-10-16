'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

class AccessoryStore {
  constructor(directory) {
    this.directory = directory;
    this.manifestPath = path.join(directory, 'accessories.json');
    this.items = [];
    fs.mkdirSync(directory, { recursive: true });
    this.load();
  }

  load() {
    try {
      const items = JSON.parse(fs.readFileSync(this.manifestPath, 'utf8'));
      this.items = Array.isArray(items) ? items.filter(item =>
        item && typeof item.id === 'string' && /^[a-f0-9-]{36}$/i.test(item.id) &&
        typeof item.name === 'string' && typeof item.file === 'string' &&
        path.basename(item.file) === item.file && item.file.endsWith('.glb')
      ).slice(0, 100) : [];
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('[accessories] Could not read catalog:', error.message);
      this.items = [];
    }
    return this.list();
  }

  list() {
    return this.items.map(({ id, name, file, bytes }) => ({ id, name, file, bytes }));
  }

  getPath(id) {
    const item = this.items.find(value => value.id === id);
    if (!item) throw new Error('Accessory not found');
    const target = path.resolve(this.directory, item.file);
    if (path.dirname(target) !== path.resolve(this.directory)) throw new Error('Invalid accessory path');
    if (!fs.existsSync(target)) throw new Error('Accessory file is missing');
    return target;
  }

  importFile(sourcePath) {
    if (this.items.length >= 100) throw new Error('Accessory limit reached (100)');
    if (path.extname(sourcePath).toLowerCase() !== '.glb') throw new TypeError('Only GLB accessory files are supported');
    const stat = fs.statSync(sourcePath);
    if (!stat.isFile() || stat.size < 20 || stat.size > 50 * 1024 * 1024) throw new Error('Accessory must be a GLB file under 50 MiB');
    const header = Buffer.alloc(20);
    const fd = fs.openSync(sourcePath, 'r');
    try { fs.readSync(fd, header, 0, header.length, 0); } finally { fs.closeSync(fd); }
    const jsonLength = header.readUInt32LE(12);
    if (header.toString('ascii', 0, 4) !== 'glTF' || header.readUInt32LE(4) !== 2 ||
        header.readUInt32LE(8) !== stat.size || header.readUInt32LE(16) !== 0x4e4f534a ||
        jsonLength < 2 || jsonLength > stat.size - 20 || jsonLength % 4 !== 0) {
      throw new Error('Accessory has an invalid GLB 2.0 header');
    }
    const jsonChunk = Buffer.alloc(jsonLength);
    const jsonFd = fs.openSync(sourcePath, 'r');
    try { fs.readSync(jsonFd, jsonChunk, 0, jsonLength, 20); } finally { fs.closeSync(jsonFd); }
    try {
      const gltfJson = JSON.parse(jsonChunk.toString('utf8').trim());
      if (gltfJson.asset?.version !== '2.0') throw new Error('Invalid glTF asset version');
    } catch { throw new Error('Accessory GLB contains invalid JSON metadata'); }
    const id = crypto.randomUUID();
    const name = path.basename(sourcePath, path.extname(sourcePath)).replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().slice(0, 80) || 'Accessory';
    const file = id + '.glb';
    fs.copyFileSync(sourcePath, path.join(this.directory, file), fs.constants.COPYFILE_EXCL);
    this.items.push({ id, name, file, bytes: stat.size });
    this.#persist();
    return { id, name, file, bytes: stat.size };
  }

  remove(id) {
    const item = this.items.find(value => value.id === id);
    if (!item) return false;
    this.items = this.items.filter(value => value.id !== id);
    const filePath = path.resolve(this.directory, item.file);
    if (path.dirname(filePath) === path.resolve(this.directory)) fs.rmSync(filePath, { force: true });
    this.#persist();
    return true;
  }

  #persist() {
    const temp = this.manifestPath + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(this.items, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temp, this.manifestPath);
  }
}

module.exports = { AccessoryStore };
