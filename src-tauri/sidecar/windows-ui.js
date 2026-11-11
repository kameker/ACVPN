'use strict';
const { spawnSync } = require('node:child_process');

const prefix = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Windows.Forms; [Console]::InputEncoding=[Text.UTF8Encoding]::new($false); [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); ";
const scripts = {
  readClipboard: prefix + "if ([Windows.Forms.Clipboard]::ContainsText()) { [Console]::Out.Write([Windows.Forms.Clipboard]::GetText()) }",
  writeClipboard: prefix + "$text=[Console]::In.ReadToEnd(); if ($text.Length -eq 0) { [Windows.Forms.Clipboard]::Clear() } else { [Windows.Forms.Clipboard]::SetText($text) }",
  pickApplication: prefix + "$title=[Console]::In.ReadToEnd(); $d=[Windows.Forms.OpenFileDialog]::new(); $d.Title=$title; $d.Filter='Windows applications (*.exe)|*.exe'; if ($d.ShowDialog() -eq [Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.FileName) }; $d.Dispose()",
  showError: prefix + "$message=[Console]::In.ReadToEnd(); [void][Windows.Forms.MessageBox]::Show($message,'ACVPN',[Windows.Forms.MessageBoxButtons]::OK,[Windows.Forms.MessageBoxIcon]::Error)",
};

function createWindowsUi(exec = spawnSync) {
  function run(name, input = '', timeout = 12000) {
    const result = exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', scripts[name]], {
      input, encoding: 'utf8', windowsHide: true, timeout,
    });
    if (result.error || result.status !== 0) throw Error('Windows interface is unavailable');
    return result.stdout || '';
  }
  return {
    clipboard: { readText: () => run('readClipboard'), writeText: value => { run('writeClipboard', String(value)); } },
    dialog: {
      async showOpenDialog(_window, options = {}) {
        const selected = run('pickApplication', String(options.title || 'Choose an application'), 300000);
        return { canceled: !selected, filePaths: selected ? [selected] : [] };
      },
      showErrorBox(_title, message) { try { run('showError', String(message), 300000); } catch {} },
    },
  };
}
module.exports = { createWindowsUi };
