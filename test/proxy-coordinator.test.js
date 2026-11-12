const test = require('node:test');
const assert = require('node:assert/strict');
const { createProxyCoordinator } = require('../src-tauri/sidecar/proxy-coordinator');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { createSafeStorage } = require('../src-tauri/sidecar/safe-storage');

test('coordinator sends recovery operations as data to a hidden helper and reports conflicts', () => {
  const calls = [];
  const run = (file, args, options) => {
    calls.push({ file, args, options });
    return { status: 0, stdout: JSON.stringify({ result: { recovered: true, restored: false } }) };
  };
  const manager = createProxyCoordinator({ profile: 'C:\\Users\\Example\\Profile', ownerPid: 42, run });
  assert.deepEqual(manager.recover(), { recovered: true, restored: false });
  assert.equal(calls[0].file, 'powershell.exe');
  assert.equal(calls[0].options.windowsHide, true);
  assert.equal(JSON.parse(calls[0].options.input).ownerPid, 42);
  assert.equal(JSON.parse(calls[0].options.input).action, 'recover');
  assert.equal(calls[0].args.join(' ').includes('C:\\Users\\Example\\Profile'), false);
});

test('Windows coordinator returns without changing proxy settings when no recovery journal exists', { skip: process.platform !== 'win32' }, () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-coordinator-'));
  try { assert.equal(createProxyCoordinator({ profile, ownerPid: process.pid }).recover(), false); }
  finally { fs.rmSync(profile, { recursive: true, force: true }); }
});

test('Windows recovery helper will not touch a journal owned by a live process', { skip: process.platform !== 'win32', timeout: 20000 }, () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-coordinator-owner-'));
  try {
    const storage = createSafeStorage(profile);
    const journal = path.join(profile, 'proxy-recovery.enc');
    fs.writeFileSync(journal, storage.encryptString(JSON.stringify({ pid: process.pid, previous: {} })));
    assert.throws(() => createProxyCoordinator({ profile, ownerPid: 0 }).recover(), /Another ACVPN instance/);
    assert.equal(fs.existsSync(journal), true);
  } finally { fs.rmSync(profile, { recursive: true, force: true }); }
});

test('Windows mutex serializes recovery workers across processes', { skip: process.platform !== 'win32', timeout: 15000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-mutex-'));
  const output = path.join(directory, 'order'); const mutex = 'Local\\ACVPN-Test-' + randomUUID();
  const worker = path.join(directory, 'worker.cjs');
  fs.writeFileSync(worker, "const fs=require('node:fs');const input=JSON.parse(fs.readFileSync(0,'utf8'));fs.appendFileSync(input.output,`start:${input.id}\\n`);setTimeout(()=>{fs.appendFileSync(input.output,`end:${input.id}\\n`);process.stdout.write(JSON.stringify({result:true}));},250);");
  function invoke(id) {
    return new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '../src-tauri/sidecar/proxy-lock.ps1')], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      let errors = ''; child.stderr.on('data', data => { errors += data; }); child.once('error', reject);
      child.once('exit', code => code === 0 ? resolve() : reject(Error(errors)));
      child.stdin.end(JSON.stringify({ id, mutex, output, node: process.execPath, worker }));
    });
  }
  try {
    await Promise.all([invoke('a'), invoke('b')]);
    const lines = fs.readFileSync(output, 'utf8').trim().split('\n');
    assert.ok(lines.join(',') === 'start:a,end:a,start:b,end:b' || lines.join(',') === 'start:b,end:b,start:a,end:a', lines.join(','));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
