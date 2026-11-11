'use strict';
const { spawnSync } = require('node:child_process');

function assertOldApplicationStopped(run = spawnSync) {
  const result = run('tasklist.exe', ['/FI', 'IMAGENAME eq ACVPN.exe', '/FO', 'CSV', '/NH'], {
    encoding: 'utf8', windowsHide: true, timeout: 12000,
  });
  if (result.error || result.status !== 0 || typeof result.stdout !== 'string') throw Error('Could not check running applications');
  if (result.stdout.split(/\r?\n/).some(line => /^\s*"ACVPN\.exe"\s*,/i.test(line))) {
    throw Error('Please close the existing ACVPN before importing its profile');
  }
}
module.exports = { assertOldApplicationStopped };
