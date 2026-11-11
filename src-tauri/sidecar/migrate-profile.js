'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createSafeStorage } = require('./safe-storage');
const { assertOldApplicationStopped } = require('./instance-guard');

const files = ['data.enc', 'subscription-device.enc', 'subscription-device-allow.enc'];

// Import is read-only with respect to the Electron profile. The destination
// must not exist; complete, authenticated data is staged before publication.
function migrateProfile(source, destination, { assertStopped = assertOldApplicationStopped } = {}) {
  if (!path.isAbsolute(source) || !path.isAbsolute(destination)) throw Error('Profile paths must be absolute');
  if (fs.existsSync(destination)) throw Error('Destination profile already exists');
  assertStopped();
  if (fs.existsSync(path.join(source, 'proxy-recovery.enc'))) throw Error('Disconnect and close the old application before importing');
  if (!fs.existsSync(path.join(source, 'data.enc'))) throw Error('No existing ACVPN profile');
  const state = JSON.parse(fs.readFileSync(path.join(source, 'Local State'), 'utf8'));
  const encoded = state.os_crypt?.encrypted_key;
  if (typeof encoded !== 'string' || !encoded) throw Error('Existing profile key is missing');
  const old = createSafeStorage(source);
  const snapshots = [];
  for (const name of files) {
    const file = path.join(source, name);
    if (!fs.existsSync(file)) continue;
    const encrypted = fs.readFileSync(file);
    const plaintext = old.decryptString(encrypted);
    if (name === 'data.enc' || name === 'subscription-device-allow.enc') JSON.parse(plaintext);
    snapshots.push([name, encrypted]);
  }
  const stage = path.join(path.dirname(destination), `.acvpn-import-${crypto.randomUUID()}`);
  fs.mkdirSync(stage);
  let moved = false;
  try {
    fs.writeFileSync(path.join(stage, 'Local State'), JSON.stringify({ os_crypt: { encrypted_key: encoded } }), { flag: 'wx' });
    for (const [name, contents] of snapshots) fs.writeFileSync(path.join(stage, name), contents, { flag: 'wx' });
    fs.renameSync(stage, destination);
    moved = true;
  } finally {
    if (!moved) {
      for (const name of ['Local State', ...files]) { try { fs.unlinkSync(path.join(stage, name)); } catch {} }
      try { fs.rmdirSync(stage); } catch {}
    }
  }
}
module.exports = { migrateProfile };
