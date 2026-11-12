'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

function createProxyCoordinator({ profile, ownerPid, run = spawnSync }) {
  if (!path.win32.isAbsolute(profile) || !Number.isInteger(ownerPid)) throw Error('Invalid proxy coordinator parameters');
  const mutex = 'Global\\ACVPN-Proxy-' + crypto.createHash('sha256').update(profile.toLowerCase()).digest('hex');
  function invoke(action, corePid) {
    const request = { action, profile, ownerPid, corePid, mutex, node: process.execPath, worker: path.join(__dirname, 'proxy-worker.js') };
    const result = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'proxy-lock.ps1')], {
      input: JSON.stringify(request), encoding: 'utf8', windowsHide: true, timeout: 60000,
    });
    if (result.error || result.status !== 0) throw Error('Could not coordinate Windows proxy recovery');
    let value; try { value = JSON.parse(result.stdout); } catch { throw Error('Could not read Windows proxy recovery result'); }
    if (value.error) throw Error(value.error);
    return value.result;
  }
  return { recover: () => invoke('recover'), enable: corePid => invoke('enable', corePid), resolve: choice => invoke(choice === 'keep' ? 'keep' : choice === 'restore' ? 'restore-confirmed' : 'invalid') };
}
module.exports = { createProxyCoordinator };
