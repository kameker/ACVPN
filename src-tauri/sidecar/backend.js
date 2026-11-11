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
const { createTauriUpdater } = require('./updater');
const { launchUpdateAfterExit } = require('./update-launcher');

const profile = process.env.ACVPN_TAURI_PROFILE;
if (!profile || !path.isAbsolute(profile)) throw Error('A private profile path is required');
fs.mkdirSync(profile, { recursive: true });
const windowsUi = createWindowsUi();
let outputOpen = true, quitting = false;
const write = value => { if (outputOpen) process.stdout.write(JSON.stringify(value) + '\n'); };
let updater = null;
if (process.env.ACVPN_TAURI_RELEASE_VERSION && process.env.ACVPN_TAURI_HOST_PID) {
  const hostPid = Number(process.env.ACVPN_TAURI_HOST_PID);
  if (!Number.isSafeInteger(hostPid) || hostPid < 1) throw Error('Invalid application process');
  updater = createTauriUpdater({
    version: process.env.ACVPN_TAURI_RELEASE_VERSION,
    directory: path.join(profile, 'updates'),
    launch(file) {
      launchUpdateAfterExit(file, hostPid, undefined, error => {
        if (error) updater.emit('error', Error('Could not start update launcher'));
        else write({ event: 'update-install' });
      });
    },
  });
}
const backend = createBackend({
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
  updater,
});
const shutdown = createShutdownCoordinator({
  tryQuit() {
    if (quitting) return true;
    if (!backend.shutdown()) { write({ event: 'shutdown-error' }); return false; }
    quitting = true; setImmediate(() => process.exit(0)); return true;
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
