const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {execFileSync,spawnSync}=require('node:child_process');const {randomUUID}=require('node:crypto');const {createProxyManager}=require('../src/windows-proxy');
test('Windows registry proxy helper preserves prior settings and respects external changes',()=>{
 const name='ACVPN-Test-'+randomUUID();const reg='HKCU\\Software\\'+name;const psReg='HKCU:\\Software\\'+name;assert.ok(/^HKCU\\Software\\ACVPN-Test-[a-f0-9-]+$/.test(reg));
 execFileSync('reg.exe',['add',reg,'/f'],{stdio:'ignore'});
 const call=(op,input)=>{let p=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'../src/windows-proxy.ps1'),'-Operation',op,'-RegistryPath',psReg],{input:input?JSON.stringify(input):'',encoding:'utf8'});assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout);};
 try{execFileSync('reg.exe',['add',reg,'/v','ProxyServer','/t','REG_SZ','/d','старый-proxy:8888','/f'],{stdio:'ignore'});execFileSync('reg.exe',['add',reg,'/v','ProxyEnable','/t','REG_DWORD','/d','0','/f'],{stdio:'ignore'});const before=call('read');call('apply',before);assert.equal(call('read').server.value,'127.0.0.1:2080');assert.equal(call('read').enabled.value,1);assert.equal(call('restore',before).restored,true);assert.deepEqual(call('read'),before);
 execFileSync('reg.exe',['add',reg,'/v','ProxyServer','/t','REG_SZ','/d','raced:8080','/f'],{stdio:'ignore'});let race=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'../src/windows-proxy.ps1'),'-Operation','apply','-RegistryPath',psReg],{input:JSON.stringify(before),encoding:'utf8'});assert.notEqual(race.status,0);assert.equal(call('read').server.value,'raced:8080');execFileSync('reg.exe',['add',reg,'/v','ProxyServer','/t','REG_SZ','/d','старый-proxy:8888','/f'],{stdio:'ignore'});
 call('apply',before);execFileSync('reg.exe',['add',reg,'/v','ProxyServer','/t','REG_SZ','/d','changed:9999','/f'],{stdio:'ignore'});assert.equal(call('restore',before).restored,false);assert.equal(call('read').server.value,'changed:9999');const expected=call('read');assert.equal(call('restore-confirmed',{previous:before,expected}).restored,true);assert.deepEqual(call('read'),before);
 execFileSync('reg.exe',['add',reg,'/v','ProxyServer','/t','REG_SZ','/d','старый-proxy:8888','/f'],{stdio:'ignore'});execFileSync('reg.exe',['add',reg,'/v','ProxyEnable','/t','REG_DWORD','/d','0','/f'],{stdio:'ignore'});call('apply',before);execFileSync('reg.exe',['add',reg,'/v','AutoConfigURL','/t','REG_SZ','/d','https://example.invalid/proxy.pac','/f'],{stdio:'ignore'});assert.equal(call('restore',before).restored,false);assert.equal(call('read').server.value,'127.0.0.1:2080');
 }finally{execFileSync('reg.exe',['delete',reg,'/f'],{stdio:'ignore'});}
});
test('proxy recovery journal handles crashes, active owners and apply failure',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'acvpn-proxy-test-'));const journalPath=path.join(dir,'journal');const safeStorage={encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()};let current='original';const op=(name,prev)=>{if(name==='read')return {server:current,hasPac:false};if(name==='apply'){current='ours';return {ok:true}}if(name==='restore'){if(current==='ours')current=prev.server;return {restored:true}}};
 try{const first=createProxyManager({safeStorage,journalPath,operation:op,pid:10,isAlive:()=>false});first.enable();assert.equal(current,'ours');const blocked=createProxyManager({safeStorage,journalPath,operation:op,pid:20,isAlive:()=>true});assert.throws(()=>blocked.recover(),/Another ACVPN/);const restarted=createProxyManager({safeStorage,journalPath,operation:op,pid:20,isAlive:()=>false});restarted.recover();assert.equal(current,'original');assert.equal(fs.existsSync(journalPath),false);
 const fail=createProxyManager({safeStorage,journalPath,pid:30,isAlive:()=>false,operation:(name,input)=>{if(name==='apply'){current='ours';throw Error('failed')};return op(name,input)}});assert.throws(()=>fail.enable(),/failed/);assert.equal(current,'original');assert.equal(fs.existsSync(journalPath),false);
 }finally{if(fs.existsSync(journalPath))fs.unlinkSync(journalPath);fs.rmdirSync(dir);}
});

test('a conflicting external proxy change retains the recovery journal and prevents a new activation',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'acvpn-proxy-conflict-'));const journalPath=path.join(dir,'journal');
 const safeStorage={encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()};let current='original';
 const operation=(name,previous)=>{if(name==='read')return {server:current,hasPac:false};if(name==='apply'){current='ours';return {ok:true}}if(name==='restore'){if(current!=='ours')return {restored:false};current=previous.server;return {restored:true}}};
 try{const manager=createProxyManager({safeStorage,journalPath,operation});manager.enable();current='other';assert.equal(manager.recover().restored,false);assert.equal(fs.existsSync(journalPath),true);assert.throws(()=>manager.enable(),/conflict/i);assert.equal(current,'other');}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('proxy activation is refused when the recovery journal cannot be flushed',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'acvpn-proxy-flush-'));const journalPath=path.join(dir,'journal');
 const safeStorage={encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()};let applied=false;const original=fs.fsyncSync;
 const manager=createProxyManager({safeStorage,journalPath,operation:name=>{if(name==='read')return {hasPac:false};if(name==='apply')applied=true;}});
 try{fs.fsyncSync=()=>{throw Error('flush failed')};assert.throws(()=>manager.enable(),/flush failed/);assert.equal(applied,false);assert.equal(fs.existsSync(journalPath),false);}
 finally{fs.fsyncSync=original;fs.rmSync(dir,{recursive:true,force:true});}
});

test('explicit conflict resolution preserves the journal and can retain current settings',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'acvpn-proxy-resolve-'));const journalPath=path.join(dir,'journal');
 const safeStorage={encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()};let current='original';
 const operation=(name,previous)=>{if(name==='read')return {server:current,hasPac:false};if(name==='apply'){current='ours';return {ok:true}}if(name==='restore'){if(current!=='ours')return {restored:false};current=previous.server;return {restored:true}}};
 try{const manager=createProxyManager({safeStorage,journalPath,operation});manager.enable();current='external';assert.equal(manager.recover().restored,false);manager.resolve('keep');assert.equal(current,'external');assert.equal(fs.existsSync(journalPath),false);assert.equal(fs.readdirSync(dir).length,1);manager.enable();assert.equal(current,'ours');}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('a reused PID with a different process creation time is not treated as the journal owner',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'acvpn-proxy-pid-'));const journalPath=path.join(dir,'journal');const safeStorage={encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()};
 let current='original';const op=(name,previous)=>{if(name==='read')return {server:current,hasPac:false};if(name==='apply'){current='ours';return {ok:true}}if(name==='restore'){current=previous.server;return {restored:true}}};
 try{createProxyManager({safeStorage,journalPath,operation:op,pid:42,ownerBirth:'old'}).enable();let checked=false;const next=createProxyManager({safeStorage,journalPath,operation:op,pid:42,ownerBirth:'new',isAlive:(pid,birth)=>{checked=true;assert.equal(birth,'old');return false}});assert.equal(next.recover().restored,true);assert.equal(checked,true);assert.equal(current,'original');}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('a recovered orphan is cleaned up before its journal is removed',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'acvpn-proxy-core-'));const journalPath=path.join(dir,'journal');const safeStorage={encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()};let current='original';
 const operation=(name,previous)=>{if(name==='read')return {server:current,hasPac:false};if(name==='apply'){current='ours';return {ok:true}}if(name==='restore'){current=previous.server;return {restored:true}}};
 try{createProxyManager({safeStorage,journalPath,operation,pid:1}).enable({corePid:99,coreBirth:'birth'});let called=false;const recovery=createProxyManager({safeStorage,journalPath,operation,pid:2,isAlive:()=>false,cleanup:record=>{called=true;assert.equal(record.corePid,99);assert.equal(record.coreBirth,'birth');assert.equal(fs.existsSync(journalPath),true)}});recovery.recover();assert.equal(called,true);assert.equal(fs.existsSync(journalPath),false);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('a failed orphan cleanup keeps recovery data for retry',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'acvpn-proxy-retry-'));const journalPath=path.join(dir,'journal');const safeStorage={encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()};
 const op=name=>name==='read'?{hasPac:false}:{restored:true};
 try{createProxyManager({safeStorage,journalPath,operation:op,pid:1}).enable({corePid:99,coreBirth:'birth'});const recovery=createProxyManager({safeStorage,journalPath,operation:op,pid:2,isAlive:()=>false,cleanup:()=>{throw Error('cleanup failed')}});assert.throws(()=>recovery.recover(),/cleanup failed/);assert.equal(fs.existsSync(journalPath),true);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
