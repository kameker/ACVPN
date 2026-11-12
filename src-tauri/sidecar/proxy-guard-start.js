'use strict';
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
function createProxyGuard({ profile, run = spawnSync, start = spawn, onFailure = () => {} }) {
  let guardian, stopping = false;
  const valid = value => typeof value === 'string' && path.win32.isAbsolute(value) && !/["\x00-\x1f]/.test(value);
  async function ensure() {
    if (guardian && guardian.exitCode === null && !guardian.killed) return;
    const node = process.execPath, login = path.join(__dirname, 'proxy-login.js'), script = path.join(__dirname, 'proxy-login.ps1');
    if (![profile, node, login, script].every(valid)) throw Error('Invalid recovery helper path');
    const command = `powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "${script}" "${node}" "${login}" "${profile}"`;
    const registry = run('reg.exe', ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'ACVPN Proxy Recovery', '/t', 'REG_SZ', '/d', command, '/f'], { windowsHide: true, encoding: 'utf8', timeout: 12000 });
    if (registry.error || registry.status !== 0) throw Error('Could not register proxy recovery at login');
    const child = start(node, [path.join(__dirname, 'proxy-guardian.js'), profile], { detached: true, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Proxy recovery helper did not start')), 10000);
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('exit', () => { clearTimeout(timer); reject(Error('Proxy recovery helper stopped')); });
        child.stdout.once('data', data => { clearTimeout(timer); String(data).trim() === 'ready' ? resolve() : reject(Error('Invalid recovery helper response')); });
      });
    } catch (error) { child.kill(); throw error; }
    child.stdin.on('error', () => {});
    child.stdin.unref(); child.stdout.unref(); child.unref(); guardian = child;
    child.once('exit', () => { if (guardian === child) { guardian = undefined; if (!stopping) onFailure(); } });
  }
  function stop() { stopping = true; if (guardian) { guardian.kill(); guardian = undefined; } }
  return { ensure, stop };
}
module.exports = { createProxyGuard };
