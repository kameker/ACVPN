const electron=require('electron');
const {EventEmitter}=require('node:events');
const Module=require('node:module');
const fs=require('node:fs');
const path=require('node:path');
const profile=process.argv[2];
electron.app.setPath('userData',profile);
const record=event=>fs.appendFileSync(path.join(profile,'events.log'),`${event}\n`);
class Window extends EventEmitter{
 constructor(){super();this.webContents=new EventEmitter();this.webContents.send=()=>{};this.webContents.setWindowOpenHandler=()=>{};record('window');}
 removeMenu(){} loadFile(){} isDestroyed(){return false} isMinimized(){return true} restore(){record('restore')} show(){record('show')} focus(){record('focus')} hide(){}
}
class Tray extends EventEmitter{setToolTip(){} setContextMenu(){} destroy(){}}
const fakeElectron={...electron,BrowserWindow:Window,Tray,Menu:{buildFromTemplate:()=>[]},safeStorage:{isEncryptionAvailable:()=>true},ipcMain:{handle(){}},dialog:{showErrorBox:()=>record('error')}};
const originalLoad=Module._load;
Module._load=function(id,parent,isMain){
 if(id==='electron'&&parent?.filename.endsWith(`${path.sep}src${path.sep}main.js`))return fakeElectron;
 if(id==='./windows-proxy'&&parent?.filename.endsWith(`${path.sep}src${path.sep}main.js`))return {createProxyManager:()=>({recover:()=>record('recover')})};
 return originalLoad.apply(this,arguments);
};
require('../src/main');
process.stdin.on('data',()=>electron.app.quit());
