const test = require('node:test');
const assert = require('node:assert/strict');
const { createWindowsUi } = require('../src-tauri/sidecar/windows-ui');

test('native Windows UI passes clipboard text as data instead of shell code', () => {
  const calls = [];
  const ui = createWindowsUi((program, args, options) => { calls.push({ program, args, options }); return { status: 0, stdout: 'текст' }; });
  const text = 'тест $(command); `payload`';
  ui.clipboard.writeText(text);
  assert.equal(calls[0].program, 'powershell.exe');
  assert.equal(calls[0].options.input, text);
  assert.equal(calls[0].args.join(' ').includes(text), false);
  assert.equal(ui.clipboard.readText(), 'текст');
});

test('native file picker returns a selected path or cancellation', async () => {
  let output = 'C:\\Program Files\\App\\app.exe';
  const ui = createWindowsUi(() => ({ status: 0, stdout: output }));
  assert.deepEqual(await ui.dialog.showOpenDialog(null, { title: 'Выберите приложение' }), { canceled: false, filePaths: [output] });
  output = '';
  assert.deepEqual(await ui.dialog.showOpenDialog(null, { title: 'Choose' }), { canceled: true, filePaths: [] });
});
