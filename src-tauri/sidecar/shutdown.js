'use strict';

function createShutdownCoordinator({ tryQuit, schedule = fn => setTimeout(fn, 1000) }) {
  let shuttingDown = false;
  function attempt() { if (!tryQuit()) schedule(attempt); }
  return {
    begin() { if (!shuttingDown) { shuttingDown = true; attempt(); } },
    isShuttingDown() { return shuttingDown; },
  };
}
module.exports = { createShutdownCoordinator };
