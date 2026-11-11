const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const {createHash,randomUUID}=require('node:crypto');
function deviceRequestHeaders(id,device){
 if(!device){let username;try{username=os.userInfo().username}catch{username='unknown'}device={platform:process.platform,username,release:os.release()};}
 const platform=({win32:'Windows',darwin:'macOS',linux:'Linux'})[device.platform]||'Unknown';
 let username='';for(const c of String(device.username||'unknown').replace(/[\x00-\x1f\x7f]/g,'').toWellFormed()){const piece=/^[\x20-\x7e]$/.test(c)?c:encodeURIComponent(c);if(username.length+piece.length>160)break;username+=piece;}username||='unknown';
 const version=String(device.release||'').replace(/[^\x20-\x7e]/g,'').slice(0,80);
 return {'X-HWID':id,'X-Device-OS':platform,'X-Device-Model':`${platform}-${username}`,...(version?{'X-Ver-OS':version}:{})};
}
function getOrCreateDeviceId({safeStorage,userData,storage=fs}){
 const file=path.join(userData,'subscription-device.enc');let id;
 if(storage.existsSync(file))id=safeStorage.decryptString(storage.readFileSync(file));
 else{id=randomUUID();storage.writeFileSync(file,safeStorage.encryptString(id),{flag:'wx'});}
 if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('Subscription device ID is unavailable');return id;
}
function allowSubscription(url,{safeStorage,userData,storage=fs}){
 const file=path.join(userData,'subscription-device-allow.enc');const data=storage.existsSync(file)?JSON.parse(safeStorage.decryptString(storage.readFileSync(file))):{subscriptions:[]};
 if(!Array.isArray(data.subscriptions))throw Error('Subscription device ID is unavailable');const digest=createHash('sha256').update(url).digest('hex');
 if(!data.subscriptions.includes(digest))data.subscriptions.push(digest);const tmp=file+'.'+randomUUID()+'.tmp';storage.writeFileSync(tmp,safeStorage.encryptString(JSON.stringify(data)),{flag:'wx'});storage.renameSync(tmp,file);
}
function deviceHeaders(url,{safeStorage,userData,storage=fs}){
 const deviceFile=path.join(userData,'subscription-device.enc'),allowFile=path.join(userData,'subscription-device-allow.enc');
 if(!storage.existsSync(allowFile))return {};
 const allowed=JSON.parse(safeStorage.decryptString(storage.readFileSync(allowFile)));
 const digest=createHash('sha256').update(url).digest('hex');
 if(!Array.isArray(allowed.subscriptions)||!allowed.subscriptions.includes(digest))return {};
 if(!storage.existsSync(deviceFile))throw Error('Subscription device ID is unavailable');
 const id=safeStorage.decryptString(storage.readFileSync(deviceFile));
 if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('Subscription device ID is unavailable');
 return deviceRequestHeaders(id);
}
module.exports={deviceHeaders,deviceRequestHeaders,getOrCreateDeviceId,allowSubscription};
