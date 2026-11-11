'use strict';
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

function createLoginItems({ executable, run = spawnSync, registryKey = runKey, name = 'ACVPN' }) {
  function execute(args) {
    const result = run('reg.exe', args, { windowsHide: true, encoding: 'utf8', timeout: 12000 });
    if (result.error) throw Error('Could not change Windows autostart');
    return result.status;
  }
  return {
    set(enabled) {
      if (enabled) {
        if (typeof executable !== 'string' || !path.win32.isAbsolute(executable) || path.win32.extname(executable).toLowerCase() !== '.exe' || /["\x00-\x1f]/.test(executable)) throw Error('Invalid application path');
        if (execute(['add', registryKey, '/v', name, '/t', 'REG_SZ', '/d', `"${executable}"`, '/f']) !== 0) throw Error('Could not enable Windows autostart');
      } else if (execute(['query', registryKey, '/v', name]) === 0) {
        if (execute(['delete', registryKey, '/v', name, '/f']) !== 0) throw Error('Could not disable Windows autostart');
      }
    },
  };
}
module.exports = { createLoginItems };
