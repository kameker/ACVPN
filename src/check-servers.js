const {certificateKind,checkCertificate}=require('./cert-check');
async function runServerChecks(servers,{binary,signal,ping,onProgress=()=>{},concurrency=8,check=checkCertificate}) {
  const previous=new Map(servers.map(server=>[server,{latency:server.latency,certStatus:server.certStatus,certCheckedAt:server.certCheckedAt}]));const completed=new Set();
  for(const server of servers){server.latency=null;const kind=certificateKind(server);server.certStatus=kind==='eligible'?'checking':kind;delete server.certCheckedAt;}
  onProgress();let next=0;
  async function worker(){
    while(!signal?.aborted){
      const index=next++;if(index>=servers.length)return;const server=servers[index];
      try{
        server.latency=await ping(server,signal);if(signal?.aborted)return;
        const kind=certificateKind(server);
        server.certStatus=kind==='eligible'?(server.latency===null?'unknown':await check({server,binary,signal})):kind;
        if(signal?.aborted)return;server.certCheckedAt=Date.now();
      }catch{if(signal?.aborted)return;server.latency=null;server.certStatus='unknown';server.certCheckedAt=Date.now();}
      completed.add(server);onProgress(server);
    }
  }
  try{await Promise.all(Array.from({length:Math.min(Math.max(1,concurrency),servers.length)},()=>worker()));}
  finally{if(signal?.aborted)for(const server of servers){if(completed.has(server))continue;const old=previous.get(server);for(const key of ['latency','certStatus','certCheckedAt']){if(old[key]===undefined)delete server[key];else server[key]=old[key]}}}
}
module.exports={runServerChecks};
