const test=require('node:test');const assert=require('node:assert/strict');const {runServerChecks}=require('../src/check-servers');
test('latency and certificate checks update each server without treating offline servers as invalid',async()=>{
 const make=(id,outbound)=>({id,outbound});const tls={type:'trojan',tls:{enabled:true}};const servers=[make('bad',tls),make('ok',tls),make('offline',tls),make('reality',{tls:{enabled:true,reality:{enabled:true}}}),make('no-tls',{type:'socks'})];let active=0,max=0;const progress=[];
 await runServerChecks(servers,{ping:async s=>s.id==='offline'?null:25,check:async({server})=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,20));active--;return server.id==='bad'?'invalid':'valid';},concurrency:2,onProgress:s=>{if(s)progress.push(s.id);}});
 assert.deepEqual(servers.map(s=>s.certStatus),['invalid','valid','unknown','reality','no_tls']);assert.deepEqual(servers.map(s=>s.latency),[25,25,null,25,25]);assert.equal(progress.length,5);assert.ok(max<=2);assert.ok(servers.every(s=>Number.isFinite(s.certCheckedAt)));
});
