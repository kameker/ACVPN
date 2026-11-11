// Only used by a diagnostic build with an explicitly isolated temporary root.
const { initializeProfile } = require('../../sidecar/profile-init');
try {
  process.stdout.write(initializeProfile(process.env.ACVPN_OLD_PROFILE, process.env.ACVPN_TAURI_PROFILE, () => {}));
} catch (error) {
  process.stderr.write(String(error.message || 'Test profile initialization failed'));
  process.exitCode = 1;
}
