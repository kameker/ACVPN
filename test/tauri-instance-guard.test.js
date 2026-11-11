const test = require('node:test');
const assert = require('node:assert/strict');
const { assertOldApplicationStopped } = require('../src-tauri/sidecar/instance-guard');

test('profile import is blocked while the Electron application is running', () => {
  const active = () => ({ status: 0, stdout: '"ACVPN.exe","42","Console","1","200 K"\r\n' });
  assert.throws(() => assertOldApplicationStopped(active), /close the existing ACVPN/i);
  const inactive = () => ({ status: 0, stdout: '"other.exe","23","Console","1","200 K"\r\n' });
  assert.doesNotThrow(() => assertOldApplicationStopped(inactive));
});

test('profile import fails closed if process status cannot be checked', () => {
  assert.throws(() => assertOldApplicationStopped(() => ({ status: 1 })), /check running applications/i);
});
