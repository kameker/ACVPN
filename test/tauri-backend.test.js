const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');

test('Tauri backend retains server and favorites without exposing server credentials', { skip: process.platform !== 'win32', timeout: 30000 }, async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-tauri-backend-'));
  const script = path.join(__dirname, '../src-tauri/sidecar/backend.js');
  let child;
  function start() {
    child = spawn(process.execPath, [script], { env: { ...process.env, ACVPN_TAURI_PROFILE: profile }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let errors = '';
    child.stderr.on('data', data => { errors += data; });
    const pending = new Map();
    readline.createInterface({ input: child.stdout }).on('line', line => {
      const message = JSON.parse(line);
      if (message.id && pending.has(message.id)) { pending.get(message.id)(message.result); pending.delete(message.id); }
    });
    let id = 0;
    return {
      call(action, payload = {}) { return new Promise((resolve, reject) => {
        const n = ++id;
        const timer = setTimeout(() => reject(Error('Backend timed out: ' + errors)), 10000);
        pending.set(n, value => { clearTimeout(timer); resolve(value); });
        child.stdin.write(JSON.stringify({ id: n, action, payload }) + '\n');
      }); },
      async stop() { child.stdin.end(); await new Promise(resolve => child.once('exit', resolve)); },
    };
  }
  try {
    let backend = start();
    const state = await backend.call('state');
    assert.equal(state.groups.length, 0);
    const secret = '12345678-1234-1234-1234-123456789abc';
    const added = await backend.call('add', { value: `vless://${secret}@example.org:443#Example` });
    assert.equal(added.ok, true);
    let snapshot = await backend.call('state');
    assert.equal(JSON.stringify(snapshot).includes(secret), false);
    const server = snapshot.groups[0].servers[0];
    assert.equal(server.name, 'Example');
    await backend.call('favorite', { id: server.id });
    await backend.call('select', { id: server.id });
    await backend.stop();
    backend = start();
    snapshot = await backend.call('state');
    assert.equal(snapshot.selected, server.id);
    assert.equal(snapshot.groups[0].servers[0].favorite, true);
    await backend.stop();
  } finally {
    if (child && child.exitCode === null) child.kill();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
