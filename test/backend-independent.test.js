const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('standalone backend imports servers and saves favorites without Electron', { skip: process.platform !== 'win32' }, async () => {
  const { createBackend } = require('../src/backend');
  const { createSafeStorage } = require('../src-tauri/sidecar/safe-storage');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-standalone-'));
  let backend;
  try {
    backend = createBackend({ profile, safeStorage: createSafeStorage(profile), setAutostart() {}, notify() {}, onUpdate() {}, clipboard: {}, pickApplication: async () => null });
    await backend.start();
    assert.equal((await backend.action('add', { value: 'socks5://127.0.0.1:1080#Independent' })).ok, true);
    const state = await backend.action('state');
    const server = state.groups[0].servers[0];
    assert.equal(server.name, 'Independent');
    assert.equal((await backend.action('favorite', { id: server.id })).ok, true);
    assert.equal((await backend.action('state')).groups[0].servers[0].favorite, true);
  } finally {
    if (backend) backend.shutdown();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
