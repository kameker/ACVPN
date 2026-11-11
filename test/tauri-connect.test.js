const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { spawnSync } = require('node:child_process');

const portFree = () => new Promise(resolve => {
  const probe = net.createServer();
  probe.once('error', () => resolve(false));
  probe.listen(2080, '127.0.0.1', () => probe.close(() => resolve(true)));
});

test('unexpected core exit reports a connection notification', { skip: process.platform !== 'win32', timeout: 30000 }, async t => {
  if (!(await portFree())) return t.skip('Port 2080 is already in use');
  const { createBackend } = require('../src/backend');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-tauri-notify-'));
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() };
  let onNotification;
  const notified = new Promise(resolve => { onNotification = resolve; });
  const backend = createBackend({ profile, safeStorage, clipboard: {}, pickApplication: async () => null, setAutostart() {}, notify: onNotification });
  try {
    await backend.start();
    const settings = (await backend.action('state')).settings;
    await backend.action('settings', { settings: { ...settings, systemProxy: false } });
    await backend.action('add', { value: 'socks5://127.0.0.1:1080#Local' });
    const server = (await backend.action('state')).groups[0].servers[0];
    await backend.action('select', { id: server.id });
    assert.equal((await backend.action('connect')).ok, true);
    const query = `Get-CimInstance Win32_Process -Filter "ParentProcessId=${process.pid} AND Name='sing-box.exe'" | Select-Object -ExpandProperty ProcessId`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', query], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    const pid = Number(result.stdout.trim());
    assert.ok(result.status === 0 && Number.isInteger(pid) && pid > 0, 'test core process must be found');
    process.kill(pid);
    const notification = await Promise.race([notified, new Promise((_, reject) => setTimeout(() => reject(Error('Missing connection notification')), 5000).unref())]);
    assert.equal(notification.title, 'ACVPN');
    assert.match(notification.body, /прервано|stopped/i);
  } finally { backend.shutdown(); fs.rmSync(profile, { recursive: true, force: true }); }
});

test('backend refuses to close until its proxy settings are restored', { skip: process.platform !== 'win32', timeout: 30000 }, async t => {
  if (!(await portFree())) return t.skip('Port 2080 is already in use');
  const { createBackend } = require('../src/backend');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-tauri-restore-'));
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() };
  let fail = true;
  const proxyOperation = op => {
    if (op === 'read') return { server: 'before', hasPac: false };
    if (op === 'apply') return { ok: true };
    if (op === 'restore') { if (fail) throw Error('registry unavailable'); return { restored: true }; }
  };
  const backend = createBackend({ profile, safeStorage, clipboard: {}, pickApplication: async () => null, setAutostart() {}, proxyOperation });
  try {
    await backend.start();
    assert.equal((await backend.action('add', { value: 'socks5://127.0.0.1:1080#Local' })).ok, true);
    const server = (await backend.action('state')).groups[0].servers[0];
    await backend.action('select', { id: server.id });
    assert.equal((await backend.action('connect')).ok, true);
    assert.equal(backend.shutdown(), false);
    assert.equal(fs.existsSync(path.join(profile, 'proxy-recovery.enc')), true);
    fail = false;
    assert.equal(backend.shutdown(), true);
    assert.equal(fs.existsSync(path.join(profile, 'proxy-recovery.enc')), false);
  } finally { fail = false; backend.shutdown(); fs.rmSync(profile, { recursive: true, force: true }); }
});

test('Tauri backend starts and stops the real local proxy without changing Windows proxy', { skip: process.platform !== 'win32', timeout: 30000 }, async t => {
  const free = await portFree();
  if (!free) return t.skip('Port 2080 is already in use');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-tauri-connect-'));
  const child = spawn(process.execPath, [path.join(__dirname, '../src-tauri/sidecar/backend.js')], {
    env: { ...process.env, ACVPN_TAURI_PROFILE: profile }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  const pending = new Map(); let seq = 0; let errors = '';
  child.stderr.on('data', data => { errors += data; });
  readline.createInterface({ input: child.stdout }).on('line', line => {
    const msg = JSON.parse(line);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
  });
  const call = (action, payload = {}) => new Promise((resolve, reject) => {
    const id = ++seq; const timer = setTimeout(() => reject(Error('Backend timeout: ' + errors)), 12000);
    pending.set(id, result => { clearTimeout(timer); resolve(result); });
    child.stdin.write(JSON.stringify({ id, action, payload }) + '\n');
  });
  try {
    const initial = await call('state');
    assert.deepEqual(await call('settings', { settings: { ...initial.settings, systemProxy: false } }), { ok: true });
    assert.deepEqual(await call('add', { value: 'socks5://127.0.0.1:1080#Local' }), { ok: true });
    const server = (await call('state')).groups[0].servers[0];
    assert.deepEqual(await call('select', { id: server.id }), { ok: true });
    assert.deepEqual(await call('connect'), { ok: true });
    assert.equal((await call('state')).status, 'connected');
    assert.deepEqual(await call('disconnect'), { ok: true });
    assert.equal((await call('state')).status, 'disconnected');
    for (let attempt = 0; attempt < 30 && !(await portFree()); attempt++) await new Promise(resolve => setTimeout(resolve, 100));
    assert.deepEqual(await call('connect'), { ok: true });
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.stdin.end();
    await exited;
    let released = false;
    for (let attempt = 0; attempt < 30 && !released; attempt++) {
      released = await portFree();
      if (!released) await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(released, true, 'local proxy port should be released after the host closes');
  } finally {
    if (child.exitCode === null) { child.stdin.end(); await new Promise(resolve => child.once('exit', resolve)); }
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
