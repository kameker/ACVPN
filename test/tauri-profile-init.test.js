const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { initializeProfile } = require('../src-tauri/sidecar/profile-init');
const { createSafeStorage } = require('../src-tauri/sidecar/safe-storage');

test('a missing legacy key requires explicit consent for an empty profile', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-missing-key-'));
  const source = path.join(root, 'old'); const dest = path.join(root, 'new');
  try {
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'data.enc'), 'preserve this data');
    assert.throws(() => initializeProfile(source, dest, () => {}), /LEGACY_KEY_MISSING/);
    assert.equal(fs.existsSync(dest), false);
    assert.equal(initializeProfile(source, dest, () => {}, { allowEmptyOnMissingKey: true }), 'fresh');
    assert.equal(fs.readFileSync(path.join(source, 'data.enc'), 'utf8'), 'preserve this data');
    assert.deepEqual(fs.readdirSync(dest), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('first launch imports an existing profile and subsequent launches preserve it', { skip: process.platform !== 'win32' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-profile-init-'));
  const source = path.join(root, 'old'); const dest = path.join(root, 'new');
  try {
    fs.mkdirSync(source); const old = createSafeStorage(source);
    fs.writeFileSync(path.join(source, 'data.enc'), old.encryptString('{"groups":[]}'));
    assert.equal(initializeProfile(source, dest, () => {}), 'migrated');
    const storage = createSafeStorage(dest);
    fs.writeFileSync(path.join(dest, 'data.enc'), storage.encryptString('{"groups":[1]}'));
    assert.equal(initializeProfile(source, dest, () => {}), 'existing');
    assert.equal(storage.decryptString(fs.readFileSync(path.join(dest, 'data.enc'))), '{"groups":[1]}');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('first launch creates an empty profile and always checks the old instance', { skip: process.platform !== 'win32' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-profile-fresh-'));
  const source = path.join(root, 'absent'); const dest = path.join(root, 'new');
  let checks = 0;
  try {
    assert.equal(initializeProfile(source, dest, () => { checks++; }), 'fresh');
    assert.equal(initializeProfile(source, dest, () => { checks++; }), 'existing');
    assert.equal(checks, 2); assert.ok(fs.statSync(dest).isDirectory());
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('an old proxy recovery journal blocks startup even after migration', { skip: process.platform !== 'win32' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-profile-journal-'));
  const source = path.join(root, 'old'); const dest = path.join(root, 'new');
  try {
    fs.mkdirSync(source); fs.mkdirSync(dest);
    fs.writeFileSync(path.join(source, 'proxy-recovery.enc'), 'pending');
    assert.throws(() => initializeProfile(source, dest, () => {}), /disconnect/i);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
