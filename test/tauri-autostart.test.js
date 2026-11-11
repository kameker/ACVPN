const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoginItems } = require('../src-tauri/sidecar/autostart');

test('autostart writes the quoted application path without shell interpolation', () => {
  const calls = [];
  const runner = (program, args) => { calls.push({ program, args }); return { status: 0 }; };
  const login = createLoginItems({ executable: 'C:\\Program Files\\ACVPN\\ACVPN.exe', run: runner });
  login.set(true);
  assert.equal(calls[0].program, 'reg.exe');
  assert.ok(calls[0].args.includes('"C:\\Program Files\\ACVPN\\ACVPN.exe"'));
  assert.ok(calls[0].args.includes('REG_SZ'));
  login.set(false);
  assert.ok(calls.some(call => call.args[0] === 'delete'));
});

test('autostart refuses malformed executable paths', () => {
  for (const executable of ['relative.exe', 'C:\\foo.txt', 'C:\\bad"name.exe']) {
    assert.throws(() => createLoginItems({ executable, run: () => ({ status: 0 }) }).set(true));
  }
});
