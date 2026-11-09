const test=require('node:test');const assert=require('node:assert/strict');const {spawnSync}=require('node:child_process');
const {normalizeApplicationPath}=require('../src/app-rules');const {makeConfig}=require('../src/core');const {makeTunConfig}=require('../src/tun-config');
const server={outbound:{type:'socks',server:'127.0.0.1',server_port:1080}};
test('application paths must be absolute Windows executable paths',()=>{
 assert.equal(normalizeApplicationPath('C:\\Program Files\\App\\..\\App\\App.exe'),'C:\\Program Files\\App\\App.exe');
 for(const bad of ['relative.exe','C:relative.exe','C:\\test.txt','', 'C:\\folder\\app.exe\0'])assert.throws(()=>normalizeApplicationPath(bad),/Invalid application path/);
});
test('real core applies executable routing to local proxy traffic',async()=>{
 const net=require('node:net'),http=require('node:http'),{spawn}=require('node:child_process');
 const listen=s=>new Promise(resolve=>s.listen(0,'127.0.0.1',()=>resolve(s.address().port)));
 const target=http.createServer((_req,res)=>res.end('ok'));const targetPort=await listen(target);const reserve=net.createServer();const proxyPort=await listen(reserve);await new Promise(resolve=>reserve.close(resolve));
 async function requestWithRules(apps,defaultRoute='direct'){
  const config=makeConfig(server,[],defaultRoute,apps);config.inbounds[0].listen_port=proxyPort;
  const core=spawn('./vendor/sing-box.exe',['run','-c','stdin'],{stdio:['pipe','ignore','pipe'],windowsHide:true});let error='';core.stderr.on('data',d=>error+=d);core.stdin.end(JSON.stringify(config));
  try{
   let ready=false;for(let i=0;i<80;i++){await new Promise(r=>setTimeout(r,50));if(core.exitCode!==null)throw Error(error);ready=await new Promise(r=>{const s=net.connect(proxyPort,'127.0.0.1');s.on('connect',()=>{s.destroy();r(true)});s.on('error',()=>r(false));});if(ready)break;}assert.ok(ready,'core did not start');
   return await new Promise(resolve=>{const req=http.get({host:'127.0.0.1',port:proxyPort,path:`http://127.0.0.1:${targetPort}/`},res=>{res.resume();resolve(res.statusCode)});req.setTimeout(3000,()=>req.destroy());req.on('error',()=>resolve(null));});
  }finally{if(core.exitCode===null){const exited=new Promise(resolve=>core.once('exit',resolve));core.kill();await exited;}}
 }
 try{assert.equal(await requestWithRules([]),200,'baseline request failed');assert.notEqual(await requestWithRules([{value:process.execPath,action:'block',enabled:true}]),200,'application rule did not block the same request');assert.equal(await requestWithRules([{value:process.execPath,action:'direct',enabled:true}],'vpn'),200,'application rule did not bypass the default VPN route');assert.notEqual(await requestWithRules([{value:process.execPath,action:'vpn',enabled:true}]),200,'application rule did not use the unavailable test VPN route');}finally{await new Promise(resolve=>target.close(resolve));}
});
test('application rules precede site rules and disabled rules do not affect routing',()=>{
 const apps=[{value:'C:\\Apps\\One.exe',action:'direct',enabled:true},{value:'C:\\Apps\\Two.exe',action:'block',enabled:true},{value:'C:\\Apps\\Three.exe',action:'vpn',enabled:false}];
 const config=makeConfig(server,[{value:'example.com',action:'vpn',enabled:true}],'vpn',apps);
 assert.deepEqual(config.route.rules,[{process_path:['C:\\Apps\\One.exe'],action:'route',outbound:'direct'},{process_path:['C:\\Apps\\Two.exe'],action:'reject'},{domain_suffix:['example.com'],action:'route',outbound:'proxy'}]);
 assert.equal(spawnSync('./vendor/sing-box.exe',['check','-c','stdin'],{input:JSON.stringify(config)}).status,0);
 const tun=makeTunConfig(server,[],'vpn',apps);assert.deepEqual(tun.route.rules.slice(2),config.route.rules.slice(0,2));assert.equal(spawnSync('./vendor/sing-box.exe',['check','-c','stdin'],{input:JSON.stringify(tun)}).status,0);
});
