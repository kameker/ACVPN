'use strict';
const path = require('node:path');
const { createProxyCoordinator } = require('./proxy-coordinator');
const profile = process.argv[2];
if (!profile || !path.isAbsolute(profile)) process.exit(1);
const manager = createProxyCoordinator({ profile, ownerPid: 0 });
async function recover() {
  for (let attempt = 0; attempt < 5; attempt++) {
    try { manager.recover(); return; }
    catch { if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); }
  }
  process.exitCode = 1;
}
recover();
