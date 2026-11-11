function createAppUpdates({updater,isSafe,install,onChange=()=>{},onError=()=>{}}){
 let current={status:'idle',version:null},checking=false;
 const set=(status,version=current.version)=>{current={status,version};onChange(current)};
 function maybeInstall(){if(current.status!=='ready'||!isSafe())return false;set('installing');try{install();return true}catch{set('error');onError();return false}}
 updater.autoDownload=true;updater.autoInstallOnAppQuit=false;
 updater.on('checking-for-update',()=>set('checking'));
 updater.on('update-available',info=>set('downloading',info.version));
 updater.on('update-not-available',()=>set('current',null));
 updater.on('update-downloaded',info=>{set('ready',info.version);maybeInstall()});
 updater.on('error',()=>{const wasInstalling=current.status==='installing';set('error');onError(wasInstalling)});
 async function check(){if(checking||['ready','installing','downloading'].includes(current.status))return;checking=true;try{await updater.checkForUpdates()}catch{set('error')}finally{checking=false}}
 return {state:()=>({...current}),check,maybeInstall};
}
module.exports={createAppUpdates};
