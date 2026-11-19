const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBackend } = require('../src/backend');
const { parseLink } = require('../src/core');

function create(profile, options = {}) {
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value), decryptString: value => value.toString() };
  return createBackend({ profile, safeStorage, clipboard: {}, pickApplication: async () => null, setAutostart() {}, ...options });
}

test('application updates cannot be checked or installed through the backend', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-no-update-'));
  let checks = 0, installs = 0;
  const updater = { on() {}, checkForUpdates() { checks++; }, quitAndInstall() { installs++; } };
  const backend = create(profile, { updater, proxyOperation: () => ({}) });
  try { await backend.start(); assert.match((await backend.action('checkAppUpdates')).error, /Unknown action/); assert.equal(checks, 0); assert.equal(installs, 0); }
  finally { backend.shutdown(); fs.rmSync(profile, { recursive: true, force: true }); }
});

test('proxy conflict remains visible until user explicitly resolves it', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-conflict-ui-'));
  const choices = [];
  const proxyManagerFactory = () => ({ recover: () => ({ recovered: true, restored: false }), resolve: choice => choices.push(choice) });
  const backend = create(profile, { proxyManagerFactory, proxyOperation: () => ({}) });
  try {
    await backend.start();
    assert.equal((await backend.action('state')).coreProblem, 'proxyConflict');
    await backend.action('disconnect');
    assert.equal((await backend.action('state')).coreProblem, 'proxyConflict');
    assert.match((await backend.action('resolveProxyConflict', { choice: 'invalid' })).error, /Invalid/);
    assert.equal((await backend.action('resolveProxyConflict', { choice: 'keep' })).ok, true);
    assert.deepEqual(choices, ['keep']);
    assert.equal((await backend.action('state')).coreProblem, null);
  } finally { backend.shutdown(); fs.rmSync(profile, { recursive: true, force: true }); }
});

test('startup warns when Windows points to an unreachable local proxy without changing it', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-orphan-'));
  const operations = [];
  const proxyOperation = op => { operations.push(op); return { server: { exists: true, value: '127.0.0.1:2080' }, enabled: { exists: true, value: 1 }, hasPac: false }; };
  const backend = create(profile, { proxyOperation, checkProxyListening: async () => false });
  try {
    await backend.start();
    assert.equal((await backend.action('state')).coreProblem, 'orphanProxy');
    assert.deepEqual(operations, ['read']);
  } finally { backend.shutdown(); fs.rmSync(profile, { recursive: true, force: true }); }
});

test('startup does not warn when the proxy is disabled or listening', async () => {
  for (const [enabled, listening] of [[0, false], [1, true]]) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-proxy-ok-'));
    const backend = create(profile, {
      proxyOperation: () => ({ server: { exists: true, value: '127.0.0.1:2080' }, enabled: { exists: true, value: enabled } }),
      checkProxyListening: async () => listening,
    });
    try { await backend.start(); assert.equal((await backend.action('state')).coreProblem, null); }
    finally { backend.shutdown(); fs.rmSync(profile, { recursive: true, force: true }); }
  }
});

test('subscription device ID is sent only with consent and retained for refresh', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-add-device-')); const requests = [];
  const fetchImpl = async (_url, options) => {
    requests.push(options.headers);
    return new Response(options.headers['X-HWID'] ? 'socks5://127.0.0.1:1080#Server' : 'vless://550e8400-e29b-41d4-a716-446655440000@0.0.0.0:443#App%20not%20supported');
  };
  const backend = create(profile, { fetchImpl });
  try {
    await backend.start(); const value = 'https://provider.example/subscription';
    assert.match((await backend.action('add', { value })).error, /does not support this client/);
    assert.equal(requests[0]['X-HWID'], undefined);
    assert.equal((await backend.action('add', { value, useDeviceId: true })).ok, true);
    const id = requests[1]['X-HWID']; assert.ok(id);
    assert.equal((await backend.action('refreshAll')).updated, 1);
    assert.equal(requests[2]['X-HWID'], id);
  } finally { backend.shutdown(); fs.rmSync(profile, { recursive: true, force: true }); }
});

test('application rules can be saved, edited and deleted and reject duplicates', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-app-rules-')); const backend = create(profile);
  try {
    await backend.start();
    assert.equal((await backend.action('applicationRule', { value: process.execPath, ruleAction: 'direct' })).ok, true);
    const rule = (await backend.action('state')).appRules[0]; assert.equal(rule.available, true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'data.enc'), 'utf8')).appRules[0].value, rule.value);
    assert.match((await backend.action('applicationRule', { value: process.execPath, ruleAction: 'block' })).error, /already exists/);
    assert.equal((await backend.action('applicationRule', { id: rule.id, value: rule.value, ruleAction: 'block', enabled: false })).ok, true);
    assert.equal((await backend.action('state')).appRules[0].enabled, false);
    assert.match((await backend.action('applicationRule', { value: 'C:\\nonexistent-acvpn-app.exe', ruleAction: 'direct' })).error, /unavailable/);
    await backend.action('deleteApplicationRule', { id: rule.id }); assert.equal((await backend.action('state')).appRules.length, 0);
  } finally { backend.shutdown(); fs.rmSync(profile, { recursive: true, force: true }); }
});

test('subscription refresh reports partial failures and blocks conflicting operations', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-refresh-')); let release, started;
  const gate = new Promise(resolve => { release = resolve; }); const entered = new Promise(resolve => { started = resolve; });
  const link = 'socks5://127.0.0.1:1080#Server', old = parseLink(link), other = parseLink('socks5://127.0.0.1:1081#Old');
  fs.writeFileSync(path.join(profile, 'data.enc'), JSON.stringify({ groups: [{ id: 'good', name: 'Good', url: 'https://good.test', servers: [old] }, { id: 'bad', name: 'Bad', url: 'https://bad.test', servers: [other] }], selected: old.id, rules: [], settings: {}, favorites: [], recent: {} }));
  const fetchImpl = async url => { if (url.hostname === 'good.test') { started(); await gate; return new Response(link); } return new Response('', { status: 503 }); };
  const backend = create(profile, { fetchImpl });
  try {
    await backend.start(); const updating = backend.action('refreshAll'); await entered;
    assert.equal((await backend.action('state')).refreshRunning, true);
    assert.match((await backend.action('select', { id: old.id })).error, /Wait for subscriptions/);
    assert.match((await backend.action('ping')).error, /Wait for subscriptions/);
    release(); const result = await updating; assert.equal(result.updated, 1); assert.equal(result.failed, 1);
    const state = await backend.action('state'); assert.equal(state.selected, state.groups[0].servers[0].id); assert.equal(state.groups[1].refreshError,'Subscription HTTP 503');
  } finally { release(); backend.shutdown(); fs.rmSync(profile, { recursive: true, force: true }); }
});

test('failed autostart change does not alter in-memory settings', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'acvpn-settings-'));
  const backend = create(profile, { setAutostart() { throw Error('registry unavailable'); } });
  try {
    await backend.start();
    const before = (await backend.action('state')).settings;
    const response = await backend.action('settings', { settings: { ...before, autostart: true } });
    assert.match(response.error, /registry unavailable/);
    assert.deepEqual((await backend.action('state')).settings, before);
  } finally { backend.shutdown(); fs.rmSync(profile, { recursive: true, force: true }); }
});
test('server checks can target one server or one subscription and be stopped',async()=>{const profile=fs.mkdtempSync(path.join(os.tmpdir(),'acvpn-ping-scope-'));const first=parseLink('socks5://127.0.0.1:10001'),second=parseLink('socks5://127.0.0.1:10002'),third=parseLink('socks5://127.0.0.1:10003');fs.writeFileSync(path.join(profile,'data.enc'),JSON.stringify({groups:[{id:'one',name:'One',servers:[first,second]},{id:'two',name:'Two',servers:[third]}],selected:null,rules:[],settings:{}}));let calls=[],block=false,signalStarted;const entered=new Promise(r=>signalStarted=r);const backend=create(profile,{proxyOperation:()=>({}),pingProbe:async(s,signal)=>{calls.push(s.id);if(!block)return 17;signalStarted();return new Promise(r=>signal.addEventListener('abort',()=>r(null),{once:true}));}});try{await backend.start();assert.equal((await backend.action('ping',{serverId:first.id})).ok,true);assert.deepEqual(calls,[first.id]);calls=[];assert.equal((await backend.action('ping',{groupId:'two'})).ok,true);assert.deepEqual(calls,[third.id]);calls=[];block=true;const pending=backend.action('ping',{groupId:'one'});await entered;assert.equal((await backend.action('stopPing')).ok,true);await pending;assert.equal((await backend.action('state')).pingRunning,false);assert.match((await backend.action('ping',{serverId:'missing'})).error,/not found/i)}finally{backend.shutdown();fs.rmSync(profile,{recursive:true,force:true})}});
test('subscription diagnostics report safe summary without saving a group',async()=>{const profile=fs.mkdtempSync(path.join(os.tmpdir(),'acvpn-sub-diagnostic-'));const fetchImpl=async()=>new Response('socks5://127.0.0.1:1080#ok\nhysteria2://secret@example.test:443');const backend=create(profile,{fetchImpl,proxyOperation:()=>({})});try{await backend.start();const result=await backend.action('checkSubscription',{value:'https://example.test/sub/token'});assert.equal(result.supported,1);assert.equal(result.skipped,1);assert.deepEqual(result.skippedTypes,{hysteria2:1});assert.equal((await backend.action('state')).groups.length,0);assert.doesNotMatch(JSON.stringify(result),/secret|token|example/)}finally{backend.shutdown();fs.rmSync(profile,{recursive:true,force:true})}});
test('subscription ordering and collapsed state survive restart',async()=>{const profile=fs.mkdtempSync(path.join(os.tmpdir(),'acvpn-group-order-'));const one=parseLink('socks5://127.0.0.1:1081'),two=parseLink('socks5://127.0.0.1:1082');fs.writeFileSync(path.join(profile,'data.enc'),JSON.stringify({groups:[{id:'a',name:'A',url:'https://a.test',servers:[one]},{id:'b',name:'B',url:'https://b.test',servers:[two]}],selected:null,rules:[],settings:{}}));const backend=create(profile,{proxyOperation:()=>({})});try{await backend.start();assert.equal((await backend.action('moveGroup',{id:'b',direction:'up'})).ok,true);assert.equal((await backend.action('collapseGroup',{id:'b',collapsed:true})).ok,true);const groups=(await backend.action('state')).groups;assert.deepEqual(groups.map(g=>g.id),['b','a']);assert.equal(groups[0].collapsed,true);backend.shutdown();const restarted=create(profile,{proxyOperation:()=>({})});try{await restarted.start();const saved=(await restarted.action('state')).groups;assert.deepEqual(saved.map(g=>g.id),['b','a']);assert.equal(saved[0].collapsed,true)}finally{restarted.shutdown()}}finally{backend.shutdown();fs.rmSync(profile,{recursive:true,force:true})}});
test('single-subscription refresh reports HTTP error without replacing saved servers',async()=>{const profile=fs.mkdtempSync(path.join(os.tmpdir(),'acvpn-sub-http-'));const server=parseLink('socks5://127.0.0.1:1081');fs.writeFileSync(path.join(profile,'data.enc'),JSON.stringify({groups:[{id:'a',name:'A',url:'https://example.test/sub',servers:[server]}],selected:server.id,rules:[],settings:{}}));const backend=create(profile,{proxyOperation:()=>({}),fetchImpl:async()=>new Response('',{status:403})});try{await backend.start();assert.match((await backend.action('refresh',{id:'a'})).error,/HTTP 403/);const state=await backend.action('state');assert.equal(state.groups[0].servers[0].id,server.id);assert.equal(state.selected,server.id)}finally{backend.shutdown();fs.rmSync(profile,{recursive:true,force:true})}});
test('subscription response read failures do not expose provider or token',async()=>{const profile=fs.mkdtempSync(path.join(os.tmpdir(),'acvpn-sub-stream-'));const fetchImpl=async()=>new Response(new ReadableStream({start(c){const e=Error('private token');e.code='ECONNRESET';c.error(e)}}));const backend=create(profile,{fetchImpl,proxyOperation:()=>({})});try{await backend.start();const r=await backend.action('checkSubscription',{value:'https://example.test/private'});assert.equal(r.error,'Subscription network failed');assert.doesNotMatch(JSON.stringify(r),/private|example/)}finally{backend.shutdown();fs.rmSync(profile,{recursive:true,force:true})}});
test('saved subscription can be diagnosed without replacing saved servers',async()=>{const profile=fs.mkdtempSync(path.join(os.tmpdir(),'acvpn-check-group-'));const original=parseLink('socks5://127.0.0.1:1081');fs.writeFileSync(path.join(profile,'data.enc'),JSON.stringify({groups:[{id:'a',name:'A',url:'https://example.test/sub',servers:[original]}],selected:original.id,rules:[],settings:{}}));const backend=create(profile,{proxyOperation:()=>({}),fetchImpl:async()=>new Response('socks5://127.0.0.1:1082#other\nhysteria2://secret@example.test:443')});try{await backend.start();const r=await backend.action('checkGroup',{id:'a'});assert.equal(r.supported,1);assert.equal(r.skipped,1);assert.deepEqual(r.skippedTypes,{hysteria2:1});const state=await backend.action('state');assert.equal(state.groups[0].servers[0].id,original.id);assert.equal(state.selected,original.id);assert.doesNotMatch(JSON.stringify(r),/secret|example/)}finally{backend.shutdown();fs.rmSync(profile,{recursive:true,force:true})}});
