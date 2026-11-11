'use strict';
const path = require('node:path');
const { spawn } = require('node:child_process');

const script = "$ErrorActionPreference='Stop'; [Console]::InputEncoding=[Text.UTF8Encoding]::new($false); $x=[Console]::In.ReadToEnd() | ConvertFrom-Json; $p=Get-Process -Id ([int]$x.hostPid) -ErrorAction SilentlyContinue; if ($p) { if (-not $p.WaitForExit(120000)) { exit 1 } }; Start-Process -FilePath $x.installer -ArgumentList '/S' -WindowStyle Hidden";

function launchUpdateAfterExit(installer, hostPid, run = spawn, onReady = () => {}) {
  if (typeof installer !== 'string' || !path.win32.isAbsolute(installer) || path.win32.extname(installer).toLowerCase() !== '.exe' || !Number.isInteger(hostPid) || hostPid < 1) throw Error('Invalid update launch request');
  const child = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { detached: true, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
  if (!child.pid || !child.stdin) throw Error('Could not start update launcher');
  let settled = false;
  const finish = error => { if (!settled) { settled = true; onReady(error); } };
  child.once('error', finish);
  child.stdin.on('error', finish);
  child.stdin.end(JSON.stringify({ installer, hostPid }), () => finish());
  child.unref();
}
module.exports = { launchUpdateAfterExit };
