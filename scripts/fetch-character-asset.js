'use strict';

// Bootstrap the canonical Saeed GLB from the project's reference repository.
// The downloaded file is renamed to the stable runtime contract: assets/saeed.glb.
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const url = 'https://raw.githubusercontent.com/saeedhub101/Saeed-V2.0/main/assets/Saeed_AI-3D.glb';
const targetDir = path.join(__dirname, '..', 'assets');
const target = path.join(targetDir, 'saeed.glb');
const temp = target + '.download';
const MAX_BYTES = 40 * 1024 * 1024;

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

(async () => {
  fs.mkdirSync(targetDir, { recursive: true });
  if (fs.existsSync(target)) {
    const existing = fs.readFileSync(target);
    if (existing.length >= 12 && existing.subarray(0, 4).toString('ascii') === 'glTF') {
      console.log(`Character asset already valid: ${target} (${existing.length} bytes)`);
      return;
    }
    fs.unlinkSync(target);
  }
  const data = await download(url);
  if (data.length < 12 || data.subarray(0, 4).toString('ascii') !== 'glTF') {
    throw new Error('Downloaded file is not a valid GLB container');
  }
  fs.writeFileSync(temp, data);
  fs.renameSync(temp, target);
  console.log(`Fetched canonical character asset: ${target} (${data.length} bytes)`);
})().catch(error => {
  try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch {}
  console.error(error.message);
  process.exitCode = 1;
});
