'use strict';

// Private JSON-lines connection to the Tauri host; no TCP control port.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { createBackend } = require('../../src/backend');
const { createSafeStorage } = require('./safe-storage');
const { createWindowsUi } = require('./windows-ui');
const { createShutdownCoordinator } = require('./shutdown');
const { createLoginItems } = require('./autostart');
const { createProxyCoordinator } = require('./proxy-coordinator');
const { createProxyGuard } = require('./proxy-guard-start');

const profile = process.env.ACVPN_TAURI_PROFILE;
if (!profile || !path.isAbsolute(profile)) throw Error('A private profile path is required');
fs.mkdirSync(profile, { recursive: true });
const windowsUi = createWindowsUi();
let outputOpen = true, quitting = false;
const write = value => { if (outputOpen) process.stdout.write(JSON.stringify(value) + '\n'); };
const production = !!process.env.ACVPN_TAURI_RELEASE_VERSION;
let backend;
async function guardFailed() {
  let disconnected = false;
  for (let attempt = 0; attempt < 5 && !quitting; attempt++) {
    const result = await backend.action('disconnect');
    if (!result.error) {
      const state = await backend.action('state');
      if (!state.coreRunning && state.coreProblem !== 'proxyRestore') { disconnected = true; break; }
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  write({ event: 'notification', data: { title: 'ACVPN', body: disconnected ? 'Помощник восстановления остановился; соединение отключено. / Recovery helper stopped; connection disconnected.' : 'Помощник восстановления остановился. Проверьте соединение. / Recovery helper stopped. Check your connection.' } });
}
const proxyGuard = production ? createProxyGuard({ profile, onFailure: () => { guardFailed().catch(() => {}); } }) : null;
backend = createBackend({
  profile,
  safeStorage: createSafeStorage(profile),
  clipboard: windowsUi.clipboard,
  async pickApplication(title) {
    const result = await windowsUi.dialog.showOpenDialog(null, { title });
    return result.canceled ? null : result.filePaths[0] || null;
  },
  setAutostart(enabled) {
    if (!process.env.ACVPN_TAURI_EXECUTABLE) {
      if (enabled) throw Error('Autostart is not available in the Tauri preview');
      return;
    }
    createLoginItems({ executable: process.env.ACVPN_TAURI_EXECUTABLE }).set(enabled);
  },
  notify(data) { write({ event: 'notification', data }); },
  onUpdate(data) { write({ event: 'update', data }); },
  restoreAutostart: process.env.ACVPN_TAURI_MIGRATED === '1',
  proxyManagerFactory: production ? () => createProxyCoordinator({ profile, ownerPid: process.pid }) : null,
  ensureProxyGuard: production ? () => proxyGuard.ensure() : async () => {},
});
const shutdown = createShutdownCoordinator({
  tryQuit() {
    if (quitting) return true;
    if (!backend.shutdown()) { write({ event: 'shutdown-error' }); return false; }
    quitting = true; proxyGuard?.stop(); setImmediate(() => process.exit(0)); return true;
  },
});
process.stdout.on('error', () => { outputOpen = false; shutdown.begin(); });
let startupError;
const ready = backend.start().catch(error => { startupError = error; });
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', async line => {
  try {
    if (Buffer.byteLength(line) > 2_000_000) throw Error('Request too large');
    const request = JSON.parse(line);
    if (!Number.isSafeInteger(request.id) || typeof request.action !== 'string') throw Error('Invalid request');
    await ready;
    const result = startupError ? { error: String(startupError.message || 'Backend startup failed').slice(0, 180) } : await backend.action(request.action, request.payload || {});
    write({ id: request.id, result });
  } catch { write({ error: 'Invalid request' }); }
});
input.on('close', () => { ready.finally(() => shutdown.begin()); });
