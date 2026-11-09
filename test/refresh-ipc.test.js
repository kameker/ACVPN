const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const vm=require('node:vm');const {EventEmitter}=require('node:events');const {parseLink}=require('../src/core');
test('refresh all updates each subscription, reports failures and blocks conflicting actions',async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'acvpn-refresh-'));let action,release,started;const startedPromise=new Promise(r=>started=r),gate=new Promise(r=>release=r);
 const link='socks5://127.0.0.1:1080#Server',old=parseLink(link),other=parseLink('socks5://127.0.0.1:1081#Old');
 fs.writeFileSync(path.join(profile,'data.enc'),JSON.stringify({groups:[{id:'good',name:'Good',url:'https://good.test',servers:[old]},{id:'bad',name:'Bad',url:'https://bad.test',servers:[other]}],selected:old.id,rules:[],settings:{},favorites:[],recent:{}}));
 const fakeFetch=async url=>{if(url.hostname==='good.test'){started();await gate;return new Response(link,{status:200})}return new Response('',{status:503})};
 const app=new EventEmitter();Object.assign(app,{isPackaged:false,requestSingleInstanceLock:()=>true,whenReady:()=>Promise.resolve(),getPath:()=>profile,quit(){},setLoginItemSettings(){}});
 class Window extends EventEmitter{constructor(){super();this.webContents=new EventEmitter();this.webContents.send=()=>{};this.webContents.setWindowOpenHandler=()=>{}}removeMenu(){}loadFile(){}isDestroyed(){return false}}
 class Tray extends EventEmitter{setToolTip(){}setContextMenu(){}destroy(){}}
 const electron={app,BrowserWindow:Window,ipcMain:{handle(_name,fn){action=fn}},safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},clipboard:{},Tray,Menu:{buildFromTemplate:()=>[]},Notification:{isSupported:()=>false},dialog:{showErrorBox(){}}};
 const load=id=>id==='electron'?electron:id==='./windows-proxy'?{createProxyManager:()=>({recover(){}}),nativeOperation(){}}:require(id.startsWith('./')?path.join(__dirname,'../src',id):id);
 try{
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8'),{require:load,__dirname:path.join(__dirname,'../src'),process,structuredClone,setTimeout,clearTimeout,setInterval:()=>0,clearInterval,console,AbortController,AbortSignal,URL,fetch:fakeFetch,Buffer});await new Promise(setImmediate);
  const invoke=(name,payload)=>action(null,name,payload);const updating=invoke('refreshAll');await Promise.race([startedPromise,updating.then(result=>{throw Error(`Update finished prematurely: ${JSON.stringify(result)}`)})]);
  assert.equal((await invoke('state')).refreshRunning,true);assert.match((await invoke('select',{id:old.id})).error,/Wait for subscriptions/);assert.match((await invoke('ping')).error,/Wait for subscriptions/);
  release();const result=await updating;assert.equal(result.updated,1);assert.equal(result.failed,1);
  const snap=await invoke('state');assert.equal(snap.refreshRunning,false);assert.equal(snap.groups[0].servers[0].name,'Server');assert.equal(snap.groups[1].servers[0].name,'Old');assert.equal(snap.selected,snap.groups[0].servers[0].id);
 }finally{release();fs.rmSync(profile,{recursive:true,force:true});}
});
