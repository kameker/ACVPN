const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {normalizeApplicationPath}=require('./app-rules');
const run=promisify(execFile);
const script="[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding; $ErrorActionPreference='SilentlyContinue'; @(Get-Process | ForEach-Object { try { if ($_.Path) { [PSCustomObject]@{Path=$_.Path} } } catch {} }) | ConvertTo-Json -Compress";
function parseRunningApplications(output){
 const parsed=JSON.parse(output||'[]');const records=Array.isArray(parsed)?parsed:parsed?[parsed]:[];const found=new Map();
 for(const record of records){try{const value=normalizeApplicationPath(record?.Path);const key=value.toLowerCase();if(!found.has(key))found.set(key,{name:path.win32.basename(value),path:value});}catch{}}
 return [...found.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'})||a.path.localeCompare(b.path,undefined,{sensitivity:'base'}));
}
async function listRunningApplications(exec=run){try{const result=await exec('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:4*1024*1024});return parseRunningApplications(result.stdout);}catch{throw Error('Could not list running applications');}}
module.exports={parseRunningApplications,listRunningApplications};
