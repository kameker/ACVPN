const test=require('node:test');const assert=require('node:assert/strict');const {parseList}=require('../src/core');
test('rejects provider unsupported-app placeholders instead of treating them as usable servers',()=>{
 const fake='vless://550e8400-e29b-41d4-a716-446655440000@0.0.0.0:443#App%20not%20supported';
 assert.throws(()=>parseList(fake),/Subscription provider does not support this client/);
});
test('reports skipped server types without exposing subscription content',()=>{const good='socks5://127.0.0.1:1080#ok';const result=parseList(`${good}\nhysteria2://secret@example.test:443\nvless://bad@example.test:443?type=xhttp\nnot-a-link`);assert.equal(result.servers.length,1);assert.equal(result.skipped,3);assert.deepEqual(result.skippedTypes,{hysteria2:1,'vless/xhttp':1,other:1});assert.doesNotMatch(JSON.stringify(result.skippedTypes),/secret|example/)});
const {subscriptionNetworkError}=require('../src/subscription-errors');
test('network errors classify DNS, timeout and TLS without exposing error details',()=>{for(const [cause,expected] of [[{code:'ENOTFOUND'},'Subscription DNS failed'],[{code:'ETIMEDOUT'},'Subscription timed out'],[{code:'CERT_HAS_EXPIRED'},'Subscription TLS verification failed'],[{code:'ECONNRESET'},'Subscription network failed']]){const error=subscriptionNetworkError({cause});assert.equal(error.message,expected);assert.doesNotMatch(error.message,/example|token/)} });
test('rejects HTML subscription pages even if wrapped in base64',()=>{const html='<!doctype html><html><body>Not a subscription</body></html>';assert.throws(()=>parseList(html),/returned HTML/);assert.throws(()=>parseList(Buffer.from(html).toString('base64')),/returned HTML/)});
