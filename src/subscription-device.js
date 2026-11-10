const fs=require('node:fs');const path=require('node:path');const {createHash,randomUUID}=require('node:crypto');
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
 return {'X-HWID':id};
}
module.exports={deviceHeaders,getOrCreateDeviceId,allowSubscription};
