const test=require('node:test');const assert=require('node:assert/strict');const {parseList}=require('../src/core');
test('rejects provider unsupported-app placeholders instead of treating them as usable servers',()=>{
 const fake='vless://550e8400-e29b-41d4-a716-446655440000@0.0.0.0:443#App%20not%20supported';
 assert.throws(()=>parseList(fake),/Subscription provider does not support this client/);
});
