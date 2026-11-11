(function (root) {
  'use strict';
  function createBridge(tauri) {
    let lastState;
    return {
      action: async (action, payload = {}) => {
        try {
          const result = await tauri.core.invoke('acvpn_action', { action, payload });
          if (action === 'state' && result && !result.error) lastState = result;
          return result;
        }
        catch (error) { return { error: String(error?.message || error || 'Backend unavailable').slice(0, 180) }; }
      },
      onUpdate: callback => Promise.all([
        tauri.event.listen('acvpn-update', event => { lastState = event.payload; callback(lastState); }),
        tauri.event.listen('acvpn-backend-error', () => {
          if (lastState) { lastState = { ...lastState, status: 'error', coreRunning: false }; callback(lastState); }
          const notice = root.document?.getElementById('notice');
          if (notice) {
            notice.textContent = root.document.documentElement.lang === 'en'
              ? 'The background process stopped. Restart ACVPN to recover Windows proxy settings.'
              : 'Внутренний процесс остановился. Перезапустите ACVPN, чтобы восстановить настройки прокси Windows.';
            notice.hidden = false;
          }
        }),
      ]),
    };
  }
  if (typeof module === 'object' && module.exports) module.exports = { createBridge };
  else root.acvpn = createBridge(root.__TAURI__);
})(typeof window === 'object' ? window : globalThis);
