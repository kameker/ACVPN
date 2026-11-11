const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSafeStorage } = require('../src-tauri/sidecar/safe-storage');

test('protected storage encrypts data and detects tampering', { skip: process.platform !== 'win32' }, () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-storage-'));
  try {
    const storage = createSafeStorage(profile);
    const encrypted = storage.encryptString('Новые данные 🔐');
    assert.equal(encrypted.includes(Buffer.from('Новые данные')), false);
    assert.equal(createSafeStorage(profile).decryptString(encrypted), 'Новые данные 🔐');
    encrypted[encrypted.length - 1] ^= 1;
    assert.throws(() => storage.decryptString(encrypted));
  } finally { fs.rmSync(profile, { recursive: true, force: true }); }
});

test('does not replace a missing or invalid key in an existing profile', { skip: process.platform !== 'win32' }, () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-missing-key-'));
  try {
    fs.writeFileSync(path.join(profile, 'data.enc'), Buffer.from('existing encrypted data'));
    assert.equal(createSafeStorage(profile).isEncryptionAvailable(), false);
    assert.equal(fs.existsSync(path.join(profile, 'Local State')), false);
    assert.equal(fs.readFileSync(path.join(profile, 'data.enc'), 'utf8'), 'existing encrypted data');
  } finally { fs.rmSync(profile, { recursive: true, force: true }); }
});
