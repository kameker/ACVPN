'use strict';
// The pipe remains open while ACVPN owns the helper. Closing it stops Xray,
// including when the backend process exits unexpectedly.
const {spawn}=require('node:child_process');const readline=require('node:readline');let core=null,closing=false,started=false;
function stop(){if(closing)return;closing=true;if(core&&core.exitCode===null)core.kill();else process.exit(0)}
const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});input.once('line',line=>{if(started)return;started=true;let config;try{config=JSON.parse(line)}catch{process.exit(1);return}try{core=spawn(process.argv[2],['run','-config','stdin:'],{windowsHide:true,stdio:['pipe','ignore','ignore']});core.stdin.on('error',()=>{});core.stdin.end(JSON.stringify(config));core.once('error',()=>process.exit(1));core.once('exit',code=>process.exit(closing?0:(code||1)));}catch{process.exit(1)}});input.once('close',stop);process.stdin.on('error',stop);process.on('exit',()=>{if(core&&core.exitCode===null)try{core.kill()}catch{}});
