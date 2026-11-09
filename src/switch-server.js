function stopAndWait(proc,stop,timeoutMs=5000){
  if(!proc){stop();return Promise.resolve();}
  return new Promise((resolve,reject)=>{
    let finished=false,timer;
    function complete(error){if(finished)return;finished=true;clearTimeout(timer);proc.removeListener('exit',onExit);proc.removeListener('error',onError);error?reject(error):resolve();}
    function onExit(){complete();}function onError(){complete(new Error('Could not stop the previous server'));}
    proc.once('exit',onExit);proc.once('error',onError);timer=setTimeout(()=>complete(new Error('Previous server did not stop in time')),timeoutMs);
    try{stop();if(proc.exitCode!==null||proc.signalCode!==null)complete();}catch(error){complete(error);}
  });
}
function createServerSwitcher({exists,current,isConnected,isConnecting,stop,setSelected,start,onSwitching}){
  let busy=false;
  return async function select(id){
    if(busy||isConnecting())throw Error('Wait for the current connection to finish');
    if(!exists(id))throw Error('Server not found');
    if(current()===id)return;
    if(!isConnected()){setSelected(id);return;}
    busy=true;onSwitching(true);
    try{await stop();setSelected(id);await start();}finally{busy=false;onSwitching(false);}
  };
}
module.exports={stopAndWait,createServerSwitcher};
