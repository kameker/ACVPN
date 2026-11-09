const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');

test('two real Electron processes activate the first and recover the proxy only once', {timeout:20000}, async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'acvpn-single-'));
 const executable=require('electron'),fixture=path.join(__dirname,'../test-fixtures/single-instance-electron.cjs');
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 let errors='';const start=()=>{const child=spawn(executable,[fixture,profile],{stdio:['pipe','ignore','pipe'],windowsHide:true,env});child.stderr.on('data',data=>{errors+=data});return child;};
 const first=start();let second;
 const events=()=>{try{return fs.readFileSync(path.join(profile,'events.log'),'utf8').trim().split('\n')}catch{return []}};
 const until=async condition=>{for(let i=0;i<100;i++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error(`Timed out. Events: ${events().join(', ')}. Electron: ${errors}`)};
 try{
  await until(()=>events().includes('window'));
  second=start();
  await until(()=>events().includes('focus'));
  await until(()=>second.exitCode!==null);
  assert.equal(second.exitCode,0);
  assert.equal(events().filter(e=>e==='recover').length,1);
  assert.equal(events().filter(e=>e==='window').length,1);
  assert.deepEqual(events().slice(-3),['restore','show','focus']);
  assert.equal(events().includes('error'),false);
 }finally{
  if(second&&second.exitCode===null)second.kill();
  if(first.exitCode===null){const exited=new Promise(resolve=>first.once('exit',resolve));first.stdin.end('quit');await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,1500))]);if(first.exitCode===null){first.kill();await exited;}}
  fs.rmSync(profile,{recursive:true,force:true});
 }
});
