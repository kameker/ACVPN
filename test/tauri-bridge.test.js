const test = require('node:test');
const assert = require('node:assert/strict');
const { createBridge } = require('../src-tauri/frontend-bridge');

test('Tauri bridge forwards actions and state events', async () => {
  const listeners = {}; const invocations = [];
  const api = { core: { invoke: async (name, args) => { invocations.push([name, args]); return { ok: true }; } }, event: { listen: async (name, fn) => { listeners[name] = fn; return () => {}; } } };
  const bridge = createBridge(api);
  const states = [];
  await bridge.onUpdate(state => states.push(state));
  listeners['acvpn-update']({ payload: { status: 'disconnected' } });
  assert.deepEqual(states, [{ status: 'disconnected' }]);
  assert.deepEqual(await bridge.action('select', { id: 's1' }), { ok: true });
  assert.deepEqual(invocations, [['acvpn_action', { action: 'select', payload: { id: 's1' } }]]);
});

test('unexpected backend exit changes the connection status without dropping servers', async () => {
  const listeners = {}; const states = [];
  const bridge = createBridge({ core: { invoke: async () => ({}) }, event: { listen: async (name, fn) => { listeners[name] = fn; } } });
  await bridge.onUpdate(state => states.push(state));
  listeners['acvpn-update']({ payload: { status: 'connected', coreRunning: true, groups: [{ id: 'saved' }] } });
  listeners['acvpn-backend-error']({});
  assert.equal(states.at(-1).status, 'error');
  assert.equal(states.at(-1).coreRunning, false);
  assert.deepEqual(states.at(-1).groups, [{ id: 'saved' }]);
});

test('Tauri bridge reports backend failures through the existing UI error contract', async () => {
  const bridge = createBridge({ core: { invoke: async () => { throw new Error('Backend stopped'); } }, event: { listen: async () => () => {} } });
  assert.deepEqual(await bridge.action('state'), { error: 'Backend stopped' });
});

test('backend failure also uses the initial state when no update event arrived', async () => {
  const listeners = {}, states = [];
  const bridge = createBridge({ core: { invoke: async () => ({ status: 'connected', groups: [{ id: 'saved' }] }) }, event: { listen: async (name, fn) => { listeners[name] = fn; } } });
  await bridge.onUpdate(state => states.push(state));
  await bridge.action('state');
  listeners['acvpn-backend-error']({});
  assert.equal(states.at(-1).status, 'error');
  assert.equal(states.at(-1).groups[0].id, 'saved');
});
