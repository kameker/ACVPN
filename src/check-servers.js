const {certificateKind,checkCertificate}=require('./cert-check');
async function runServerChecks(servers,{binary,signal,ping,onProgress=()=>{},concurrency=8,check=checkCertificate}) {
  for(const server of servers){server.latency=null;const kind=certificateKind(server);server.certStatus=kind==='eligible'?'checking':kind;delete server.certCheckedAt;}
  onProgress();let next=0;
  async function worker(){
    while(!signal?.aborted){
      const index=next++;if(index>=servers.length)return;const server=servers[index];
      try{
        server.latency=await ping(server);if(signal?.aborted)return;
        const kind=certificateKind(server);
        server.certStatus=kind==='eligible'?(server.latency===null?'unknown':await check({server,binary,signal})):kind;
        if(signal?.aborted)return;server.certCheckedAt=Date.now();
      }catch{server.latency=null;server.certStatus='unknown';server.certCheckedAt=Date.now();}
      onProgress(server);
    }
  }
  await Promise.all(Array.from({length:Math.min(Math.max(1,concurrency),servers.length)},()=>worker()));
}
module.exports={runServerChecks};
