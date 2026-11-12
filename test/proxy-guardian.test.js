const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { createProxyGuard } = require('../src-tauri/sidecar/proxy-guard-start');

test('guardian registration failure prevents activation and does not launch helper', async () => {
  let started = false;
  const guard = createProxyGuard({ profile: 'C:\\Users\\Example\\Profile', run: () => ({ status: 1 }), start: () => { started = true; } });
  await assert.rejects(guard.ensure(), /register proxy recovery/);
  assert.equal(started, false);
});

test('guardian failure after readiness triggers the failure callback', async () => {
  const child = new EventEmitter(); child.exitCode = null; child.killed = false;
  child.stdin = new EventEmitter(); child.stdin.unref = () => {};
  child.stdout = new EventEmitter(); child.stdout.unref = () => {};
  child.unref = () => {}; child.kill = () => { child.killed = true; };
  let failures = 0;
  const guard = createProxyGuard({ profile: 'C:\\Users\\Example\\Profile', run: () => ({ status: 0 }), start: () => { setImmediate(() => child.stdout.emit('data', Buffer.from('ready\n'))); return child; }, onFailure: () => failures++ });
  await guard.ensure(); child.emit('exit', 1);
  assert.equal(failures, 1);
});

test('real guardian starts with a temporary profile before proxy activation', { skip: process.platform !== 'win32', timeout: 15000 }, async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-guard-start-'));
  const calls = [];
  const guard = createProxyGuard({ profile, run: (file, args) => { calls.push({ file, args }); return { status: 0 }; } });
  try { await guard.ensure(); assert.equal(calls[0].file, 'reg.exe'); assert.ok(calls[0].args.includes('ACVPN Proxy Recovery')); }
  finally { guard.stop(); fs.rmSync(profile, { recursive: true, force: true }); }
});

test('guardian observes owner pipe closure without touching proxy when there is no journal', { skip: process.platform !== 'win32', timeout: 15000 }, async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-guard-'));
  const child = spawn(process.execPath, [path.join(__dirname, '../src-tauri/sidecar/proxy-guardian.js'), profile], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let stderr = '';
  child.stderr.on('data', data => { stderr += data; });
  try {
    await new Promise((resolve, reject) => { child.once('error', reject); child.stdout.once('data', data => String(data).includes('ready') ? resolve() : reject(Error('Guardian did not initialize'))); });
    const exited = new Promise(resolve => child.once('exit', (code) => resolve(code)));
    child.stdin.end();
    assert.equal(await exited, 0, stderr);
    assert.deepEqual(fs.readdirSync(profile), []);
  } finally { if (child.exitCode === null) child.kill(); fs.rmSync(profile, { recursive: true, force: true }); }
});
