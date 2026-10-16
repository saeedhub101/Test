'use strict';

// Fetch the canonical model only when the local copy is missing or invalid.
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const url = 'https://raw.githubusercontent.com/saeedhub101/Saeed-V2.0/main/assets/Saeed_AI-3D.glb';
const targetDir = path.join(__dirname, '..', 'assets');
const target = path.join(targetDir, 'saeed.glb');
const temp = target + '.download';
const MAX_BYTES = 40 * 1024 * 1024;

function validateGlb(data) {
  if (!Buffer.isBuffer(data) || data.length < 20) throw new Error('Character asset is too small to be a valid GLB');
  if (data.toString('ascii', 0, 4) !== 'glTF') throw new Error('Character asset has an invalid GLB signature');
  if (data.readUInt32LE(4) !== 2) throw new Error('Character asset must use GLB version 2');
  if (data.readUInt32LE(8) !== data.length) throw new Error('Character asset length header does not match the file size');
  if (data.length > MAX_BYTES) throw new Error('Character asset exceeds 40 MiB safety limit');
  return true;
}

function download(source, redirects = 0) {
  if (redirects > 5) return Promise.reject(new Error('Too many redirects while downloading character asset'));
  return new Promise((resolve, reject) => {
    https.get(source, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        return resolve(download(new URL(response.headers.location, source).toString(), redirects + 1));
      }
      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`Character asset download failed with HTTP ${response.statusCode}`));
      }
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) {
          response.destroy(new Error('Character asset exceeds 40 MiB safety limit'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

async function ensureCharacterAsset() {
  fs.mkdirSync(targetDir, { recursive: true });
  if (fs.existsSync(target)) {
    try {
      const existing = fs.readFileSync(target);
      validateGlb(existing);
      console.log(`Character asset already valid: ${target} (${existing.length} bytes)`);
      return target;
    } catch (error) {
      console.warn('[asset] Existing character asset is invalid; fetching a clean copy:', error.message);
      fs.unlinkSync(target);
    }
  }
  const data = await download(url);
  validateGlb(data);
  fs.writeFileSync(temp, data);
  fs.renameSync(temp, target);
  console.log(`Fetched canonical character asset: ${target} (${data.length} bytes)`);
  return target;
}

if (require.main === module) {
  ensureCharacterAsset().catch(error => {
    try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch {}
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { validateGlb, ensureCharacterAsset };
