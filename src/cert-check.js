const net=require('node:net');
const http=require('node:http');
const tls=require('node:tls');
const {spawn}=require('node:child_process');
const {makeConfig}=require('./core');

const DEFAULT_TARGET={host:'www.cloudflare.com',port:443,servername:'www.cloudflare.com'};
function certificateKind(server) {
  const tlsOptions=server?.outbound?.tls;
  if(!tlsOptions?.enabled)return 'no_tls';
  if(tlsOptions.reality?.enabled)return 'reality';
  if(tlsOptions.insecure)return 'unverified';
  return 'eligible';
}
function certificateFailure(logs) {
  return /certificate signed by unknown authority|certificate is valid for|certificate has expired|certificate is not valid|certificate relies on legacy common name|cannot validate certificate|unknown certificate authority|certificate verify failed|x509:/i.test(logs);
}
async function unusedPort() {
  return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):resolve(port));});});
}
async function checkCertificate({server,binary,signal,target=DEFAULT_TARGET,timeoutMs=10000}) {
  const kind=certificateKind(server);if(kind!=='eligible')return kind;
  if(signal?.aborted)return 'unknown';
  let port;try{port=await unusedPort();}catch{return 'unknown';}
  if(signal?.aborted)return 'unknown';
  const config=makeConfig(server,[],'vpn');config.inbounds[0].listen_port=port;config.log={level:'error'};
  return new Promise(resolve=>{
    let proc,request,tunnel,secure,timer,retry,settleTimer,done=false,logs='',waiting=false;
    function finish(result) {
      if(done)return;done=true;clearTimeout(timer);clearTimeout(retry);clearTimeout(settleTimer);signal?.removeEventListener('abort',abort);
      request?.destroy();secure?.destroy();tunnel?.destroy();if(proc && proc.exitCode===null && proc.signalCode===null)proc.kill();
      resolve(result);
    }
    function failed(){if(done||waiting)return;waiting=true;settleTimer=setTimeout(()=>finish(certificateFailure(logs)?'invalid':'unknown'),250);}
    function abort(){finish('unknown');}
    function startRequest(){
      if(done)return;
      request=http.request({host:'127.0.0.1',port,method:'CONNECT',path:`${target.host}:${target.port}`,agent:false});
      request.on('connect',(response,socket,head)=>{
        tunnel=socket;if(response.statusCode!==200){failed();return;}if(head.length)socket.unshift(head);
        secure=tls.connect({socket,servername:target.servername||target.host,...(target.ca?{ca:target.ca}:{})});
        secure.once('secureConnect',()=>finish('valid'));secure.once('error',failed);secure.once('close',()=>{if(!done)failed();});
      });
      request.once('error',failed);request.end();
    }
    function waitReady(){
      if(done)return;if(proc.exitCode!==null||proc.signalCode!==null){failed();return;}
      const socket=net.createConnection({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();startRequest();});socket.once('error',()=>{socket.destroy();retry=setTimeout(waitReady,100);});
    }
    try{
      proc=spawn(binary,['run','-c','stdin'],{windowsHide:true,stdio:['pipe','ignore','pipe']});
      proc.once('error',failed);proc.once('exit',()=>{if(!done)failed();});proc.stdin.on('error',()=>{});
      proc.stderr.on('data',data=>{logs=(logs+data.toString()).slice(-16384);});proc.stdin.end(JSON.stringify(config));
      timer=setTimeout(()=>finish(certificateFailure(logs)?'invalid':'unknown'),timeoutMs);
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}waitReady();
    }catch{finish('unknown');}
  });
}
module.exports={certificateKind,certificateFailure,checkCertificate,DEFAULT_TARGET};
