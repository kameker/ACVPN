const {spawnSync}=require('node:child_process');
// Read-only. Does not request elevation, create an adapter or modify routes.
function tunPreflight(run=spawnSync){
 const script="$ErrorActionPreference='Stop';$p=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent());$admin=$p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator);$adapter=Get-NetAdapter -IncludeHidden -ErrorAction Stop | Where-Object { $_.Name -eq 'ACVPN-TUN' }; @{administrator=$admin;adapterNameInUse=($null -ne $adapter)}|ConvertTo-Json -Compress";
 const result=run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,encoding:'utf8',timeout:10000});
 if(result.error||result.status!==0)throw Error('Unable to inspect TUN prerequisites');
 const info=JSON.parse(result.stdout);if(typeof info.administrator!=='boolean'||typeof info.adapterNameInUse!=='boolean')throw Error('Invalid TUN preflight response');return info;
}
module.exports={tunPreflight};
