'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

const api = 'https://api.github.com/repos/kameker/ACVPN/releases/latest';
const maxInstaller = 250 * 1024 * 1024;

function versionParts(value) {
  if (!/^\d+\.\d+\.\d+$/.test(value)) return null;
  const parts = value.split('.').map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}
function isNewer(version, current) {
  const a = versionParts(version), b = versionParts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
function fileDigest(file) {
  const fd = fs.openSync(file, 'r'); const hash = crypto.createHash('sha256'); const buffer = Buffer.alloc(1024 * 1024);
  try { for (;;) { const n = fs.readSync(fd, buffer, 0, buffer.length, null); if (!n) break; hash.update(buffer.subarray(0, n)); } }
  finally { fs.closeSync(fd); }
  return hash.digest('hex');
}
async function readLimited(response, limit) {
  if (!response.ok || !response.body) throw Error('Update download failed');
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > limit) throw Error('Update is too large');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > limit) throw Error('Update is too large'); chunks.push(Buffer.from(chunk)); }
  return Buffer.concat(chunks);
}

function createTauriUpdater({ version, directory, fetch = globalThis.fetch, launch }) {
  const updater = new EventEmitter();
  let downloaded;
  updater.checkForUpdates = async () => {
    updater.emit('checking-for-update');
    let partial;
    try {
      const metadata = await fetch(api, { headers: { 'User-Agent': 'ACVPN', 'Accept': 'application/vnd.github+json' }, signal: AbortSignal.timeout(30000) });
      const release = JSON.parse((await readLimited(metadata, 1024 * 1024)).toString('utf8'));
      const tag = String(release.tag_name || ''); const next = tag.replace(/^v/, '');
      if (release.draft || release.prerelease || !isNewer(next, version)) { updater.emit('update-not-available'); return; }
      const name = `ACVPN-Tauri-Setup-${next}.exe`;
      const asset = Array.isArray(release.assets) && release.assets.find(item => item.name === name);
      if (!asset) { updater.emit('update-not-available'); return; }
      const expectedUrl = `https://github.com/kameker/ACVPN/releases/download/${tag}/${name}`;
      if (asset.browser_download_url !== expectedUrl || !/^sha256:[0-9a-f]{64}$/i.test(asset.digest || '') || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > maxInstaller) throw Error('Invalid update metadata');
      updater.emit('update-available', { version: next });
      const response = await fetch(expectedUrl, { signal: AbortSignal.timeout(300000) });
      if (!response.ok || !response.body) throw Error('Update download failed');
      if (response.url) {
        const final = new URL(response.url);
        if (final.protocol !== 'https:' || !['github.com', 'release-assets.githubusercontent.com'].includes(final.hostname)) throw Error('Invalid update download host');
      }
      fs.mkdirSync(directory, { recursive: true });
      partial = path.join(directory, `acvpn-${crypto.randomUUID()}.part`);
      const fd = fs.openSync(partial, 'wx'); const hash = crypto.createHash('sha256'); let size = 0;
      try {
        for await (const chunk of response.body) {
          const bytes = Buffer.from(chunk); size += bytes.length;
          if (size > asset.size || size > maxInstaller) throw Error('Update is too large');
          hash.update(bytes);
          for (let offset = 0; offset < bytes.length;) offset += fs.writeSync(fd, bytes, offset, bytes.length - offset);
        }
      } finally { fs.closeSync(fd); }
      const digest = asset.digest.slice(7).toLowerCase();
      if (size !== asset.size || hash.digest('hex') !== digest) throw Error('Update integrity check failed');
      const file = partial.replace(/\.part$/, '.exe'); fs.renameSync(partial, file); partial = undefined;
      downloaded = { file, digest };
      updater.emit('update-downloaded', { version: next });
    } catch (error) {
      if (partial) { try { fs.unlinkSync(partial); } catch {} }
      updater.emit('error', error);
    }
  };
  updater.quitAndInstall = () => {
    if (!downloaded || fileDigest(downloaded.file) !== downloaded.digest) throw Error('Update integrity check failed');
    launch(downloaded.file);
  };
  return updater;
}
module.exports = { createTauriUpdater, isNewer };
