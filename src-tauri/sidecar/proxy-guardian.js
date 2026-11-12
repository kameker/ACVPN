'use strict';
const path = require('node:path');
const { createProxyCoordinator } = require('./proxy-coordinator');
const profile = process.argv[2];
if (!profile || !path.isAbsolute(profile)) process.exit(1);
const manager = createProxyCoordinator({ profile, ownerPid: 0 });
let ending = false;
async function recover() {
  if (ending) return;
  ending = true;
  for (let attempt = 0; attempt < 5; attempt++) {
    try { manager.recover(); process.exit(0); }
    catch { if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); }
  }
  process.exit(1);
}
process.stdin.resume();
process.stdin.once('end', recover);
process.stdin.once('error', recover);
const ownerPid = process.ppid;
setInterval(() => {
  try { process.kill(ownerPid, 0); }
  catch (error) { if (error.code === 'ESRCH') recover(); }
}, 500);
process.stdout.write('ready\n');
