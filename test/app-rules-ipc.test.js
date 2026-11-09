const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const vm=require('node:vm');const {EventEmitter}=require('node:events');
test('application rule actions save, edit, reject duplicates and delete',async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'acvpn-app-rules-'));const app=new EventEmitter();let action;
 Object.assign(app,{isPackaged:false,requestSingleInstanceLock:()=>true,whenReady:()=>Promise.resolve(),getPath:()=>profile,quit(){},setLoginItemSettings(){}});
 class Window extends EventEmitter{constructor(){super();this.webContents=new EventEmitter();this.webContents.send=()=>{};this.webContents.setWindowOpenHandler=()=>{}}removeMenu(){}loadFile(){}isDestroyed(){return false}}
 class Tray extends EventEmitter{setToolTip(){}setContextMenu(){}destroy(){}}
 const electron={app,BrowserWindow:Window,ipcMain:{handle(_name,fn){action=fn}},safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},clipboard:{},Tray,Menu:{buildFromTemplate:()=>[]},Notification:{isSupported:()=>false},dialog:{showErrorBox(){}}};
 const load=id=>id==='electron'?electron:id==='./windows-proxy'?{createProxyManager:()=>({recover(){}}),nativeOperation(){}}:require(id.startsWith('./')?path.join(__dirname,'../src',id):id);
 try{
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8'),{require:load,__dirname:path.join(__dirname,'../src'),process,structuredClone,setTimeout,clearTimeout,setInterval:()=>0,clearInterval,console,AbortController,URL,fetch,Buffer});await new Promise(setImmediate);
  const invoke=(name,payload)=>action(null,name,payload);
  assert.equal((await invoke('applicationRule',{value:process.execPath,ruleAction:'direct'})).ok,true);
  let snap=await invoke('state');assert.equal(snap.appRules.length,1);assert.equal(snap.appRules[0].available,true);const rule=snap.appRules[0];
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'data.enc'),'utf8')).appRules[0].value,rule.value);
  assert.match((await invoke('applicationRule',{value:process.execPath,ruleAction:'block'})).error,/already exists/);
  assert.equal((await invoke('applicationRule',{id:rule.id,value:rule.value,ruleAction:'block',enabled:false})).ok,true);
  snap=await invoke('state');assert.equal(snap.appRules[0].action,'block');assert.equal(snap.appRules[0].enabled,false);
  assert.match((await invoke('applicationRule',{value:'C:\\nonexistent-acvpn-app.exe',ruleAction:'direct'})).error,/unavailable/);
  await invoke('deleteApplicationRule',{id:rule.id});assert.equal((await invoke('state')).appRules.length,0);
 }finally{fs.rmSync(profile,{recursive:true,force:true});}
});
