const test = require('node:test');
const assert = require('node:assert/strict');
const { createShutdownCoordinator } = require('../src-tauri/sidecar/shutdown');

test('shutdown retries while a connection is starting and stops once clean shutdown succeeds', () => {
  const scheduled = []; let attempts = 0;
  const coordinator = createShutdownCoordinator({
    tryQuit: () => ++attempts >= 3,
    schedule: fn => scheduled.push(fn),
  });
  coordinator.begin();
  coordinator.begin();
  assert.equal(attempts, 1);
  assert.equal(coordinator.isShuttingDown(), true);
  scheduled.shift()(); scheduled.shift()();
  assert.equal(attempts, 3);
  assert.equal(scheduled.length, 0);
});
