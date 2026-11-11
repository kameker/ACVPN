const test = require('node:test');
const assert = require('node:assert/strict');
const { launchUpdateAfterExit } = require('../src-tauri/sidecar/update-launcher');

test('updater passes installer path as data and waits for the application process', () => {
  let invocation, payload, detached = false, ready = false, finish;
  const spawn = (program, args, options) => {
    invocation = { program, args, options };
    return { pid: 123, once() {}, stdin: { on() {}, end(value, callback) { payload = JSON.parse(value); finish = callback; } }, unref() { detached = true; } };
  };
  const installer = 'C:\\Temp\\test $(not-a-command).exe';
  launchUpdateAfterExit(installer, 456, spawn, error => { assert.ifError(error); ready = true; });
  assert.equal(invocation.program, 'powershell.exe');
  assert.equal(invocation.args.join(' ').includes(installer), false);
  assert.equal(invocation.options.windowsHide, true);
  assert.deepEqual(payload, { installer, hostPid: 456 });
  assert.equal(detached, true);
  assert.equal(ready, false);
  finish();
  assert.equal(ready, true);
});
