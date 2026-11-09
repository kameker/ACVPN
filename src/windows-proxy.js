const fs=require('node:fs');const {spawnSync}=require('node:child_process');const path=require('node:path');
function nativeOperation(operation,input,script=path.join(__dirname,'windows-proxy.ps1')){const run=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Operation',operation],{input:input?JSON.stringify(input):'',encoding:'utf8',windowsHide:true,timeout:12000});if(run.error||run.status!==0)throw Error(operation==='apply'?'Could not enable Windows proxy':'Could not access Windows proxy settings');try{return JSON.parse(run.stdout.trim());}catch{throw Error('Could not read Windows proxy settings');}}
function createProxyManager({safeStorage,journalPath,operation=nativeOperation,pid=process.pid,isAlive=pid=>{try{process.kill(pid,0);return true}catch{return false}}}){
 function readJournal(){return JSON.parse(safeStorage.decryptString(fs.readFileSync(journalPath)));}
 function recover(){if(!fs.existsSync(journalPath))return false;const record=readJournal();if(record.pid!==pid&&isAlive(record.pid))throw Error('Another ACVPN instance manages the Windows proxy');const result=operation('restore',record.previous);fs.unlinkSync(journalPath);return {recovered:true,restored:result.restored};}
 function enable(){if(fs.existsSync(journalPath))recover();const previous=operation('read');if(previous.hasPac)throw Error('Windows proxy auto-configuration is enabled');const record={pid,previous};fs.writeFileSync(journalPath,safeStorage.encryptString(JSON.stringify(record)),{flag:'wx'});try{operation('apply',previous);}catch(e){try{recover()}catch{}throw e;}}
 return {enable,recover};
}
module.exports={createProxyManager,nativeOperation};
