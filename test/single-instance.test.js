const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {EventEmitter}=require('node:events');

function launch({lock=true}={}){
 const app=new EventEmitter(); let resolveReady; const ready=new Promise(resolve=>{resolveReady=resolve});
 let quit=0,recover=0,removed=0,window;
 Object.assign(app,{isPackaged:false,requestSingleInstanceLock:()=>lock,whenReady:()=>ready,getPath:()=>path.join(__dirname,'nonexistent-test-profile'),quit:()=>{quit++;app.emit('before-quit',{preventDefault(){}})},setLoginItemSettings(){}});
 class Window extends EventEmitter{
  constructor(){super();window=this;this.hidden=false;this.minimized=false;this.shown=0;this.focused=0;this.restored=0;this.webContents=new EventEmitter();this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=()=>{};}
  removeMenu(){} loadFile(){} isDestroyed(){return false} isMinimized(){return this.minimized} restore(){this.restored++;this.minimized=false} show(){this.shown++;this.hidden=false} focus(){this.focused++} hide(){this.hidden=true}
 }
 class Tray extends EventEmitter{setToolTip(){} setContextMenu(){} destroy(){}}
 const electron={app,BrowserWindow:Window,ipcMain:{handle(){}},safeStorage:{isEncryptionAvailable:()=>true},clipboard:{},Tray,Menu:{buildFromTemplate:()=>[]},Notification:{isSupported:()=>false},dialog:{showErrorBox(){}}};
 const fakeFs={...fs,existsSync:()=>false,unlinkSync:()=>{removed++}};
 const localRequire=id=>id==='electron'?electron:id==='node:fs'?fakeFs:id==='./windows-proxy'?{createProxyManager:()=>({recover:()=>{recover++}}),nativeOperation(){}}:require(id.startsWith('./')?path.join(__dirname,'../src',id):id);
 const code=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
 vm.runInNewContext(code,{require:localRequire,__dirname:path.join(__dirname,'../src'),process,structuredClone,setTimeout,clearTimeout,setInterval:()=>0,clearInterval,console,AbortController,URL,fetch,Buffer});
 return {app,resolveReady,get window(){return window},get quit(){return quit},get recover(){return recover},get removed(){return removed}};
}

test('second launch exits before proxy recovery or cleanup',async()=>{
 const session=launch({lock:false});session.resolveReady();await new Promise(setImmediate);
 assert.equal(session.quit,1);assert.equal(session.recover,0);assert.equal(session.removed,0);assert.equal(session.window,undefined);
});

test('a repeat launch restores and focuses the existing window',async()=>{
 const session=launch();session.resolveReady();await new Promise(setImmediate);
 assert.ok(session.window);session.window.hidden=true;session.window.minimized=true;
 session.app.emit('second-instance');
 assert.equal(session.window.restored,1);assert.equal(session.window.shown,1);assert.equal(session.window.focused,1);assert.equal(session.recover,1);
});

test('repeat launch during startup is handled once the window exists',async()=>{
 const session=launch();session.app.emit('second-instance');session.resolveReady();await new Promise(setImmediate);
 assert.ok(session.window);assert.equal(session.window.shown,1);assert.equal(session.window.focused,1);
});
