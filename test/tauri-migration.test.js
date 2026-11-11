const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSafeStorage } = require('../src-tauri/sidecar/safe-storage');

test('profile migration validates encrypted data and leaves old profile untouched', { skip: process.platform !== 'win32' }, () => {
  const { migrateProfile } = require('../src-tauri/sidecar/migrate-profile');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-profile-migrate-'));
  const source = path.join(root, 'old');
  const dest = path.join(root, 'new');
  try {
    fs.mkdirSync(source);
    const original = createSafeStorage(source);
    fs.writeFileSync(path.join(source, 'data.enc'), original.encryptString('{"groups":[{"name":"Тест"}]}'));
    fs.writeFileSync(path.join(source, 'subscription-device.enc'), original.encryptString('abc'));
    const before = fs.readFileSync(path.join(source, 'data.enc'));
    migrateProfile(source, dest, { assertStopped() {} });
    assert.deepEqual(fs.readFileSync(path.join(source, 'data.enc')), before);
    assert.equal(createSafeStorage(dest).decryptString(fs.readFileSync(path.join(dest, 'data.enc'))), '{"groups":[{"name":"Тест"}]}');
    assert.equal(createSafeStorage(dest).decryptString(fs.readFileSync(path.join(dest, 'subscription-device.enc'))), 'abc');
    assert.throws(() => migrateProfile(source, dest, { assertStopped() {} }));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('corrupt encrypted data prevents profile migration', { skip: process.platform !== 'win32' }, () => {
  const { migrateProfile } = require('../src-tauri/sidecar/migrate-profile');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-profile-corrupt-'));
  const source = path.join(root, 'old'); const dest = path.join(root, 'new');
  try {
    fs.mkdirSync(source);
    const storage = createSafeStorage(source);
    const data = storage.encryptString('test'); data[data.length - 1] ^= 1;
    fs.writeFileSync(path.join(source, 'data.enc'), data);
    assert.throws(() => migrateProfile(source, dest, { assertStopped() {} }));
    assert.equal(fs.existsSync(dest), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('profile migration refuses an outstanding proxy recovery journal', { skip: process.platform !== 'win32' }, () => {
  const { migrateProfile } = require('../src-tauri/sidecar/migrate-profile');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-profile-active-'));
  const source = path.join(root, 'old'); const dest = path.join(root, 'new');
  try {
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'proxy-recovery.enc'), 'journal');
    assert.throws(() => migrateProfile(source, dest, { assertStopped() {} }), /Disconnect and close/);
    assert.equal(fs.existsSync(dest), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
