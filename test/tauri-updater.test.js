const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createTauriUpdater } = require('../src-tauri/sidecar/updater');
const { createAppUpdates } = require('../src/app-updates');

test('updater downloads only a newer Tauri installer and verifies its hash before launch', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-update-'));
  const bytes = Buffer.from('test installer');
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  const url = 'https://github.com/kameker/ACVPN/releases/download/v1.0.3/ACVPN-Tauri-Setup-1.0.3.exe';
  const release = { tag_name: 'v1.0.3', assets: [{ name: 'ACVPN-Tauri-Setup-1.0.3.exe', browser_download_url: url, size: bytes.length, digest: `sha256:${digest}` }] };
  const fetch = async input => input.includes('/releases/latest') ? new Response(JSON.stringify(release)) : new Response(bytes);
  let launched; const events = [];
  const updater = createTauriUpdater({ version: '1.0.2', directory: dir, fetch, launch: file => { launched = file; } });
  updater.on('error', error => { throw error; });
  updater.on('update-downloaded', info => events.push(info.version));
  try {
    await updater.checkForUpdates();
    assert.deepEqual(events, ['1.0.3']);
    updater.quitAndInstall();
    assert.deepEqual(fs.readFileSync(launched), bytes);
    fs.writeFileSync(launched, 'tampered');
    assert.throws(() => updater.quitAndInstall(), /integrity/i);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Tauri updates remain downloaded until the connection is safe to close', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-update-safe-'));
  const bytes = Buffer.from('installer');
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  const url = 'https://github.com/kameker/ACVPN/releases/download/v1.0.3/ACVPN-Tauri-Setup-1.0.3.exe';
  const release = { tag_name: 'v1.0.3', assets: [{ name: 'ACVPN-Tauri-Setup-1.0.3.exe', browser_download_url: url, size: bytes.length, digest: `sha256:${digest}` }] };
  const fetch = async input => input.includes('/releases/latest') ? new Response(JSON.stringify(release)) : new Response(bytes);
  let safe = false, installed = false;
  const updater = createTauriUpdater({ version: '1.0.2', directory: dir, fetch, launch() { installed = true; } });
  const controller = createAppUpdates({ updater, isSafe: () => safe, install: () => updater.quitAndInstall() });
  try {
    await controller.check();
    assert.equal(controller.state().status, 'ready');
    assert.equal(installed, false);
    safe = true;
    assert.equal(controller.maybeInstall(), true);
    assert.equal(installed, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('updater rejects a bad hash and does not report an update ready', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-update-bad-'));
  const release = { tag_name: 'v1.0.3', assets: [{ name: 'ACVPN-Tauri-Setup-1.0.3.exe', browser_download_url: 'https://github.com/kameker/ACVPN/releases/download/v1.0.3/ACVPN-Tauri-Setup-1.0.3.exe', size: 3, digest: `sha256:${'0'.repeat(64)}` }] };
  const fetch = async input => input.includes('/releases/latest') ? new Response(JSON.stringify(release)) : new Response('bad');
  let ready = false, errors = 0;
  const updater = createTauriUpdater({ version: '1.0.2', directory: dir, fetch, launch() {} });
  updater.on('update-downloaded', () => { ready = true; });
  updater.on('error', () => { errors++; });
  try { await updater.checkForUpdates(); assert.equal(ready, false); assert.equal(errors, 1); assert.deepEqual(fs.readdirSync(dir), []); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
