const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

for (const mode of ['guardian', 'login', 'conflict']) test(mode + ' handles isolated Windows proxy settings after owner termination', { skip: process.platform !== 'win32', timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-crash-'));
  const profile = path.join(dir, 'profile'); fs.mkdirSync(profile);
  const sidecar = path.join(dir, 'src-tauri', 'sidecar'); fs.mkdirSync(sidecar, { recursive: true });
  const src = path.join(dir, 'src'); fs.mkdirSync(src);
  for (const file of ['safe-storage.js', 'proxy-coordinator.js', 'proxy-worker.js', 'proxy-lock.ps1', 'proxy-guardian.js', 'proxy-login.js', 'proxy-login.ps1']) fs.copyFileSync(path.join(__dirname, '../src-tauri/sidecar', file), path.join(sidecar, file));
  fs.copyFileSync(path.join(__dirname, '../src/windows-proxy.js'), path.join(src, 'windows-proxy.js'));
  const name = 'ACVPN-Test-' + randomUUID(); const reg = `HKCU\\Software\\${name}`; const psReg = `HKCU:\\Software\\${name}`;
  const original = fs.readFileSync(path.join(__dirname, '../src/windows-proxy.ps1'), 'utf8');
  const isolated = original.replace('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', psReg);
  assert.notEqual(isolated, original); fs.writeFileSync(path.join(src, 'windows-proxy.ps1'), isolated);
  const ownerFile = path.join(dir, 'owner.cjs');
  fs.writeFileSync(ownerFile, `const {spawn}=require('node:child_process');const path=require('node:path');const {createProxyCoordinator}=require('./src-tauri/sidecar/proxy-coordinator');const profile=process.argv[2];const guard=spawn(process.execPath,[path.join(__dirname,'src-tauri/sidecar/proxy-guardian.js'),profile],{stdio:['pipe','pipe','ignore'],windowsHide:true,detached:true});guard.stdout.once('data',()=>{const core=spawn(process.execPath,['-e','setTimeout(()=>process.exit(0),40000)'],{stdio:'ignore',windowsHide:true});try{createProxyCoordinator({profile,ownerPid:process.pid}).enable(core.pid);process.stdout.write(JSON.stringify({corePid:core.pid})+'\\n');setInterval(()=>{},1000)}catch(e){process.stderr.write(e.stack);process.exit(1)}});`);
  if (mode === 'login') {
    let script = fs.readFileSync(ownerFile, 'utf8');
    const guardStart = script.indexOf('const guard='); const coreStart = script.indexOf('const core=', guardStart);
    assert.ok(guardStart >= 0 && coreStart > guardStart && script.endsWith(');'));
    script = script.slice(0, guardStart) + '(function(){' + script.slice(coreStart);
    fs.writeFileSync(ownerFile, script.slice(0, -2) + ')();');
  }
  execFileSync('reg.exe', ['add', reg, '/v', 'ProxyServer', '/t', 'REG_SZ', '/d', 'original:8888', '/f'], { stdio: 'ignore' });
  execFileSync('reg.exe', ['add', reg, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '0', '/f'], { stdio: 'ignore' });
  let owner;
  try {
    owner = spawn(process.execPath, [ownerFile, profile, mode], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let errors = ''; owner.stderr.on('data', data => { errors += data; });
    const info = await new Promise((resolve, reject) => { owner.once('error', reject); owner.once('exit', code => reject(Error(`Owner exited ${code}: ${errors}`))); owner.stdout.once('data', data => { try { resolve(JSON.parse(String(data).trim())); } catch (e) { reject(e); } }); });
    assert.ok(Number.isInteger(info.corePid)); assert.ok(owner.pid);
    const before = execFileSync('reg.exe', ['query', reg, '/v', 'ProxyServer'], { encoding: 'utf8' }); assert.match(before, /127\.0\.0\.1:2080/);
    if (mode === 'conflict') execFileSync('reg.exe', ['add', reg, '/v', 'ProxyServer', '/t', 'REG_SZ', '/d', 'external:9999', '/f'], { stdio: 'ignore' });
    owner.kill();
    if (mode === 'login' || mode === 'conflict') {
      for (let attempt = 0; attempt < 50; attempt++) { try { process.kill(owner.pid, 0); } catch (error) { if (error.code === 'ESRCH') break; throw error; } await new Promise(resolve => setTimeout(resolve, 100)); }
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(sidecar, 'proxy-login.ps1'), process.execPath, path.join(sidecar, 'proxy-login.js'), profile], { windowsHide: true, timeout: 20000 });
    }
    const journal = path.join(profile, 'proxy-recovery.enc');
    if (mode !== 'conflict') {
      for (let attempt = 0; attempt < 120 && fs.existsSync(journal); attempt++) await new Promise(resolve => setTimeout(resolve, 200));
      assert.equal(fs.existsSync(journal), false, 'guardian must complete recovery');
    } else assert.equal(fs.existsSync(journal), true, 'conflicting recovery must retain the journal');
    const after = execFileSync('reg.exe', ['query', reg, '/v', 'ProxyServer'], { encoding: 'utf8' }); assert.match(after, mode === 'conflict' ? /external:9999/ : /original:8888/);
    if (mode !== 'conflict') { const enabled = execFileSync('reg.exe', ['query', reg, '/v', 'ProxyEnable'], { encoding: 'utf8' }); assert.match(enabled, /0x0\b/); }
    assert.throws(() => process.kill(info.corePid, 0), { code: 'ESRCH' });
  } finally {
    if (owner && owner.exitCode === null && !owner.killed) owner.kill();
    execFileSync('reg.exe', ['delete', reg, '/f'], { stdio: 'ignore' });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
