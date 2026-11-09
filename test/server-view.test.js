const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {detectCountry,countryName,flagPath,byLatency,byCountry,eligibleForLatency}=require('../src/server-view');
test('country detection uses provider names and flags, never guesses from host names',()=>{
 for(const [name,code] of [['🇩🇪 Frankfurt','DE'],['Германия 1','DE'],['Germany #1','DE'],['[US] New York','US'],['UK London','GB'],['🇳🇱 Amsterdam','NL'],['Россия Москва','RU'],['United States 2','US']])assert.equal(detectCountry(name),code,name);
 for(const name of ['Fast Server 01','London','de.example.com','No connection'])assert.equal(detectCountry(name),null,name);
 assert.equal(detectCountry('DE','DE'),null);assert.equal(detectCountry('🇺🇸 United States'),'US');
});
test('latency sorts across subscriptions; missing values sort last',()=>{
 const servers=[{name:'Z',latency:null},{name:'A',latency:75},{name:'B',latency:12},{name:'C'},{name:'D',latency:75}];
 assert.deepEqual(servers.sort((a,b)=>byLatency(a,b,'en')).map(s=>s.name),['B','A','D','C','Z']);
});
test('country grouping is alphabetical and unknown countries appear last',()=>{
 const servers=[{name:'unknown',country:null},{name:'netherlands',country:'NL'},{name:'germany',country:'DE'},{name:'germany 2',country:'DE'}];
 assert.deepEqual(servers.sort((a,b)=>byCountry(a,b,'en')).map(s=>s.country),['DE','DE','NL',null]);
 assert.equal(countryName('DE','ru'),'Германия');assert.equal(flagPath('ZZ'),null);
 for(const code of ['DE','US','NL','GB','RU'])assert.ok(fs.existsSync(path.join(__dirname,'..','src',flagPath(code))),code);
});

test('ping sorting accepts only measured servers with trusted or inapplicable certificates',()=>{for(const status of ['valid','no_tls','reality'])assert.equal(eligibleForLatency({latency:15,certStatus:status}),true,status);for(const status of ['invalid','unknown','checking','unverified',undefined])assert.equal(eligibleForLatency({latency:15,certStatus:status}),false,String(status));assert.equal(eligibleForLatency({latency:null,certStatus:'valid'}),false);assert.equal(eligibleForLatency({latency:-1,certStatus:'no_tls'}),false);});

test('optional certificate priority orders verified servers first and preserves ping order within groups',()=>{const servers=[{name:'No TLS fast',latency:5,certStatus:'no_tls'},{name:'Verified slow',latency:80,certStatus:'valid'},{name:'Reality',latency:15,certStatus:'reality'},{name:'Verified fast',latency:30,certStatus:'valid'}];assert.deepEqual([...servers].sort((a,b)=>byLatency(a,b,'en',false)).map(s=>s.name),['No TLS fast','Reality','Verified fast','Verified slow']);assert.deepEqual([...servers].sort((a,b)=>byLatency(a,b,'en',true)).map(s=>s.name),['Verified fast','Verified slow','No TLS fast','Reality']);});
