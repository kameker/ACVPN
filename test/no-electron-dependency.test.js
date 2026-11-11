const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('runtime and dependency lock do not depend on Electron', () => {
  const root = path.join(__dirname, '..');
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  for (const name of Object.keys(lock.packages)) {
    assert.doesNotMatch(name, /(?:^|\/)node_modules\/(?:electron|electron-builder|electron-updater)(?:\/|$)/i);
  }
  for (const dir of ['src', 'src-tauri/sidecar']) {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
      const code = fs.readFileSync(path.join(root, dir, entry.name), 'utf8');
      assert.doesNotMatch(code, /require\s*\(\s*['"]electron(?:[\-/][^'"]*)?['"]\s*\)/i, `${dir}/${entry.name}`);
      assert.doesNotMatch(code, /Module\._load\s*=/, `${dir}/${entry.name}`);
    }
  }
});
