'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createSafeStorage } = require('./safe-storage');
const { createProxyManager } = require('../../src/windows-proxy');
function processBirth(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return 'unknown';
  const script = `try {$p=[Diagnostics.Process]::GetProcessById(${pid});try {[Console]::Write('alive:'+ $p.StartTime.ToUniversalTime().Ticks)} catch {[Console]::Write('unknown')}} catch [ArgumentException] {[Console]::Write('absent')} catch {[Console]::Write('unknown')}`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 12000 });
  if (result.error || result.status !== 0) return 'unknown';
  return result.stdout.trim();
}
function cleanupCore(record) {
  if (!record.corePid || !record.coreBirth) return;
  if (!Number.isSafeInteger(record.corePid) || record.corePid < 1 || !/^\d+$/.test(record.coreBirth)) throw Error('Invalid core process identity');
  const script = `try {$p=[Diagnostics.Process]::GetProcessById(${record.corePid});if ($p.HasExited) {exit 0};if ([string]$p.StartTime.ToUniversalTime().Ticks -eq '${record.coreBirth}') {$p.Kill();if(-not $p.WaitForExit(10000)){exit 1}}} catch [ArgumentException] {} catch {if (-not (Get-Process -Id ${record.corePid} -ErrorAction SilentlyContinue)) {exit 0};exit 1};exit 0`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  if (result.error || result.status !== 0) throw Error('Could not stop the previous proxy process');
}
try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (!path.isAbsolute(input.profile) || !Number.isInteger(input.ownerPid) || !['recover', 'enable', 'keep', 'restore-confirmed'].includes(input.action)) throw Error('Invalid proxy request');
  const ownerState = input.ownerPid > 0 ? processBirth(input.ownerPid) : 'unknown';
  if (input.ownerPid > 0 && !ownerState.startsWith('alive:')) throw Error('Cannot identify proxy owner process');
  const ownerBirth = ownerState.startsWith('alive:') ? ownerState.slice(6) : null;
  const manager = createProxyManager({ safeStorage: createSafeStorage(input.profile), journalPath: path.join(input.profile, 'proxy-recovery.enc'), pid: input.ownerPid, ownerBirth, cleanup: cleanupCore,
    isAlive(pid, birth) { const state = processBirth(pid); if (state === 'absent') return false; if (state.startsWith('alive:') && birth) return state.slice(6) === birth; return true; },
  });
  let core;
  if (input.action === 'enable') {
    const state = processBirth(input.corePid);
    if (!state.startsWith('alive:')) throw Error('Cannot identify proxy process');
    core = { corePid: input.corePid, coreBirth: state.slice(6) };
  }
  const result = input.action === 'keep' ? manager.resolve('keep') : input.action === 'restore-confirmed' ? manager.resolve('restore') : input.action === 'enable' ? manager.enable(core) : manager.recover();
  process.stdout.write(JSON.stringify({ result: result ?? null }));
} catch (error) {
  process.stdout.write(JSON.stringify({ error: String(error.message || 'Proxy recovery failed').slice(0, 180) }));
}
