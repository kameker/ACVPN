'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { migrateProfile } = require('./migrate-profile');
const { assertOldApplicationStopped } = require('./instance-guard');

function initializeProfile(source, destination, guard = assertOldApplicationStopped, { allowEmptyOnMissingKey = false } = {}) {
  if (!path.isAbsolute(source) || !path.isAbsolute(destination)) throw Error('Invalid profile path');
  guard();
  if (fs.existsSync(path.join(source, 'proxy-recovery.enc'))) throw Error('Start the existing ACVPN and disconnect before migrating');
  if (fs.existsSync(destination)) {
    if (!fs.statSync(destination).isDirectory()) throw Error('Invalid destination profile');
    return 'existing';
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (fs.existsSync(path.join(source, 'data.enc'))) {
    if (!fs.existsSync(path.join(source, 'Local State'))) {
      if (!allowEmptyOnMissingKey) throw Error('LEGACY_KEY_MISSING');
    } else {
      migrateProfile(source, destination, { assertStopped() {} }); return 'migrated';
    }
  }
  fs.mkdirSync(destination);
  return 'fresh';
}
if (require.main === module) {
  try { process.stdout.write(initializeProfile(process.env.ACVPN_OLD_PROFILE, process.env.ACVPN_TAURI_PROFILE, assertOldApplicationStopped, { allowEmptyOnMissingKey: process.env.ACVPN_ALLOW_EMPTY_PROFILE === '1' })); }
  catch (error) { process.stderr.write(String(error.message || 'Could not initialize the profile').slice(0, 180)); process.exitCode = 1; }
}
module.exports = { initializeProfile };
