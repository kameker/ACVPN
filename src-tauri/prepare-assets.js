'use strict';
const fs = require('node:fs');
const path = require('node:path');
if (process.version !== 'v24.13.1') throw Error('Node.js 24.13.1 is required to package ACVPN');
const root = path.resolve(__dirname, '..');
const assets = path.join(__dirname, 'web-assets');
const source = path.join(assets, 'src');
const flags = path.join(assets, 'flags');
fs.mkdirSync(source, { recursive: true });
fs.mkdirSync(flags, { recursive: true });
for (const name of ['style.css', 'server-view.js', 'renderer.js']) {
  let content = fs.readFileSync(path.join(root, 'src', name), 'utf8');
  if (name === 'server-view.js') content = content.replace('../node_modules/flag-icons/flags/4x3/', '../flags/');
  fs.writeFileSync(path.join(source, name), content);
}
const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8').replace(
  '<script src="server-view.js"></script>',
  '<script src="../frontend-bridge.js"></script><script src="server-view.js"></script>',
);
fs.writeFileSync(path.join(source, 'index.html'), html);
fs.copyFileSync(path.join(__dirname, 'frontend-bridge.js'), path.join(assets, 'frontend-bridge.js'));
const sourceFlags = path.join(root, 'node_modules/flag-icons/flags/4x3');
for (const item of fs.readdirSync(sourceFlags, { withFileTypes: true })) {
  if (item.isFile()) fs.copyFileSync(path.join(sourceFlags, item.name), path.join(flags, item.name));
}
fs.mkdirSync(path.join(__dirname, 'runtime'), { recursive: true });
fs.copyFileSync(process.execPath, path.join(__dirname, 'runtime/node.exe'));
