const test=require('node:test');const assert=require('node:assert/strict');const {createHash}=require('node:crypto');const {deviceHeaders,deviceRequestHeaders,getOrCreateDeviceId,allowSubscription}=require('../src/subscription-device');
test('device identifier is sent only for the explicitly authorized subscription',()=>{
 const url='https://provider.example/sub/secret',other='https://provider.example/sub/other';const digest=createHash('sha256').update(url).digest('hex');const files={'C:\\profile\\subscription-device.enc':'550e8400-e29b-41d4-a716-446655440000','C:\\profile\\subscription-device-allow.enc':JSON.stringify({subscriptions:[digest]})};const storage={existsSync:p=>Object.hasOwn(files,p),readFileSync:p=>Buffer.from(files[p])};const safeStorage={decryptString:b=>b.toString()};const options={safeStorage,userData:'C:\\profile',storage};
 const result=deviceHeaders(url,options);assert.equal(result['X-HWID'],files['C:\\profile\\subscription-device.enc']);assert.ok(result['X-Device-OS']);assert.ok(result['X-Device-Model']);assert.deepEqual(deviceHeaders(other,options),{});delete files['C:\\profile\\subscription-device.enc'];assert.throws(()=>deviceHeaders(url,options),/unavailable/);
});
test('explicit consent enables a stable device ID only for the selected subscription',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'acvpn-consent-'));const safeStorage={encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()};const options={safeStorage,userData:dir};const first='https://example.test/one',second='https://example.test/two';
 try{const id=getOrCreateDeviceId(options);assert.equal(getOrCreateDeviceId(options),id);assert.deepEqual(deviceHeaders(first,options),{});allowSubscription(first,options);assert.equal(deviceHeaders(first,options)['X-HWID'],id);assert.deepEqual(deviceHeaders(second,options),{});allowSubscription(second,options);assert.equal(deviceHeaders(first,options)['X-HWID'],id);assert.equal(deviceHeaders(second,options)['X-HWID'],id);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('device metadata identifies OS and username using safe HTTP headers',()=>{
 const id='550e8400-e29b-41d4-a716-446655440000';const result=deviceRequestHeaders(id,{platform:'win32',username:'ivan',release:'10.0.26100'});
 assert.equal(result['X-HWID'],id);assert.equal(result['X-Device-OS'],'Windows');assert.equal(result['X-Device-Model'],'Windows-ivan');assert.equal(result['X-Ver-OS'],'10.0.26100');
 const unicode=deviceRequestHeaders(id,{platform:'win32',username:'Иван\r\nX-Test: injected',release:'10.0.1'});assert.match(unicode['X-Device-Model'],/^Windows-/);assert.doesNotMatch(unicode['X-Device-Model'],/[^\x20-\x7e]/);
});
