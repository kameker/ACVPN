const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('acvpn',{action:(name,payload)=>ipcRenderer.invoke('action',name,payload),onUpdate:fn=>ipcRenderer.on('update',(_event,data)=>fn(data))});
