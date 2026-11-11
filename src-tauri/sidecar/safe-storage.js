'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const scripts = {
  protect: "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $r=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))",
  unprotect: "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $r=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))",
};

function dpapi(operation, input) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', scripts[operation]], {
    input: input.toString('base64'), encoding: 'utf8', windowsHide: true, timeout: 12000,
  });
  if (result.error || result.status !== 0 || !result.stdout.trim()) throw Error('Windows secure storage is unavailable');
  return Buffer.from(result.stdout.trim(), 'base64');
}

// Compatible with the Windows v10 AES-GCM format used by Electron safeStorage.
// Never creates a replacement key when an existing protected key cannot be read.
function createSafeStorage(profile) {
  const localState = path.join(profile, 'Local State');
  let key;
  function getKey() {
    if (key) return key;
    let data = {};
    if (fs.existsSync(localState)) data = JSON.parse(fs.readFileSync(localState, 'utf8'));
    const encoded = data.os_crypt?.encrypted_key;
    if (encoded) {
      const wrapped = Buffer.from(encoded, 'base64');
      if (wrapped.length <= 5 || wrapped.subarray(0, 5).toString() !== 'DPAPI') throw Error('Unsupported Windows storage key');
      key = dpapi('unprotect', wrapped.subarray(5));
      if (key.length !== 32) throw Error('Invalid Windows storage key');
      return key;
    }
    if (['data.enc', 'subscription-device.enc', 'subscription-device-allow.enc', 'proxy-recovery.enc'].some(name => fs.existsSync(path.join(profile, name)))) {
      throw Error('Existing encrypted data has no Windows storage key');
    }
    key = crypto.randomBytes(32);
    const encrypted = Buffer.concat([Buffer.from('DPAPI'), dpapi('protect', key)]).toString('base64');
    data.os_crypt = { ...data.os_crypt, encrypted_key: encrypted };
    fs.mkdirSync(profile, { recursive: true });
    const tmp = path.join(profile, `Local State.${crypto.randomUUID()}.tmp`);
    try {
      fs.writeFileSync(tmp, JSON.stringify(data), { flag: 'wx' });
      fs.renameSync(tmp, localState);
    } catch (error) {
      key.fill(0); key = undefined;
      try { fs.unlinkSync(tmp); } catch {}
      throw error;
    }
    return key;
  }
  return {
    isEncryptionAvailable() { try { getKey(); return true; } catch { return false; } },
    encryptString(value) {
      const nonce = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), nonce);
      const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
      return Buffer.concat([Buffer.from('v10'), nonce, encrypted, cipher.getAuthTag()]);
    },
    decryptString(value) {
      const data = Buffer.from(value);
      if (data.length < 31 || data.subarray(0, 3).toString() !== 'v10') throw Error('Unsupported encrypted data');
      const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), data.subarray(3, 15));
      decipher.setAuthTag(data.subarray(data.length - 16));
      return Buffer.concat([decipher.update(data.subarray(15, -16)), decipher.final()]).toString('utf8');
    },
  };
}
module.exports = { createSafeStorage };
