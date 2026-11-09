const {createHash}=require('node:crypto');
function serverKey(server){return createHash('sha256').update(JSON.stringify(server.outbound)).digest('hex');}
function bestServer(servers){return servers.filter(s=>s.certStatus==='valid'&&Number.isFinite(s.latency)&&s.latency>=0).sort((a,b)=>a.latency-b.latency)[0]||null;}
function addRecent(recent,server,time=Date.now()){const next={...recent,[serverKey(server)]:time};return Object.fromEntries(Object.entries(next).sort((a,b)=>b[1]-a[1]).slice(0,20));}
module.exports={serverKey,bestServer,addRecent};
