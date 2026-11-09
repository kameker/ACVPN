const test=require('node:test');const assert=require('node:assert/strict');const {parseRunningApplications,listRunningApplications}=require('../src/running-apps');
test('running process list uses executable paths, removes duplicates and ignores inaccessible entries',()=>{
 const input=JSON.stringify([{Path:'C:\\Apps\\Browser.exe'},{Path:'c:\\apps\\browser.exe'},{Path:'C:\\Apps\\Zeta.exe'},{Path:null},{Path:'bad'},{Path:'C:\\Apps\\text.txt'}]);
 assert.deepEqual(parseRunningApplications(input),[{name:'Browser.exe',path:'C:\\Apps\\Browser.exe'},{name:'Zeta.exe',path:'C:\\Apps\\Zeta.exe'}]);
 assert.deepEqual(parseRunningApplications(JSON.stringify({Path:'C:\\Tools\\app.exe'})),[{name:'app.exe',path:'C:\\Tools\\app.exe'}]);
});
test('listing errors are surfaced instead of returning an empty list',async()=>{await assert.rejects(()=>listRunningApplications(async()=>{throw Error('failed')}),/Could not list running applications/);});
