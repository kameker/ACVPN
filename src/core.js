const net = require('node:net');
const { randomUUID } = require('node:crypto');
const {normalizeApplicationPath}=require('./app-rules');
function b64(s) { return Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString('utf8'); }
function parseLink(input) {
  const raw = input.trim(); let type, server, port, name, outbound, params;
  if (raw.startsWith('vmess://')) {
    let v; try { v=JSON.parse(b64(raw.slice(8))); } catch { throw Error('Invalid VMess link'); }
    type='vmess'; server=v.add; port=Number(v.port); name=v.ps || server;
    outbound={type,server,server_port:port,uuid:v.id,security:v.scy || 'auto',alter_id:Number(v.aid || 0)};
    params=new URLSearchParams({type:v.net || 'tcp',host:v.host || '',path:v.path || '',security:v.tls || '',sni:v.sni || v.host || ''});
  } else {
    let u; try { u=new URL(raw); } catch { throw Error('Invalid configuration link'); }
    type=u.protocol.slice(0,-1).toLowerCase();
    if (!['vless','trojan','ss','socks','socks5'].includes(type)) throw Error('Unsupported protocol');
    server=u.hostname.replace(/^\[|\]$/g,''); port=Number(u.port); name=decodeURIComponent(u.hash.slice(1)) || server; params=u.searchParams;
    let user=decodeURIComponent(u.username), pass=decodeURIComponent(u.password);
    if(type==='ss') {
      if (!pass) { const decoded=b64(user); const i=decoded.indexOf(':'); if(i<1) throw Error('Invalid Shadowsocks credentials'); user=decoded.slice(0,i);pass=decoded.slice(i+1); }
      if(params.has('plugin')) throw Error('Shadowsocks plugins are not supported');
      outbound={type:'shadowsocks',server,server_port:port,method:user,password:pass};
    } else if(type==='socks'||type==='socks5') { outbound={type:'socks',server,server_port:port,version:'5',...(user?{username:user,password:pass}: {})}; }
    else if(type==='trojan') outbound={type,server,server_port:port,password:user};
    else outbound={type,server,server_port:port,uuid:user,...(params.get('flow')?{flow:params.get('flow')}: {})};
  }
  if(!server || !Number.isInteger(port) || port<1 || port>65535) throw Error('Server or port is invalid');
  if (['vless','vmess'].includes(type) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(outbound.uuid||'')) throw Error('Invalid UUID');
  if(type==='trojan' && !outbound.password) throw Error('Missing password');
  if(['vless','vmess','trojan'].includes(type)) {
    const sec=params.get('security') || (type==='trojan'?'tls':'');
    if(sec && !['tls','reality','none'].includes(sec)) throw Error('Unsupported security');
    if(sec==='tls'||sec==='reality') {
      outbound.tls={enabled:true,server_name:params.get('sni') || server};
      if(params.get('fp') || sec==='reality') outbound.tls.utls={enabled:true,fingerprint:params.get('fp')||'chrome'};
      if(sec==='reality') { if(!params.get('pbk')) throw Error('Reality public key is missing'); outbound.tls.reality={enabled:true,public_key:params.get('pbk'),short_id:params.get('sid')||''}; }
    }
    const transport=params.get('type') || 'tcp';
    if(transport==='ws') outbound.transport={type:'ws',path:params.get('path')||'/',...(params.get('host')?{headers:{Host:params.get('host')}}:{})};
    else if(transport==='grpc') outbound.transport={type:'grpc',service_name:params.get('serviceName')||params.get('path')||''};
    else if(!['tcp','none'].includes(transport)) throw Error('Unsupported transport: '+transport);
  }
  return {id:randomUUID(),name:String(name).slice(0,120),server,port,outbound};
}
function parseList(text) {
  let body=text.trim(); if(!body) throw Error('Empty subscription');
  if(!/^(vless|vmess|trojan|ss|socks5?):\/\//im.test(body)) body=b64(body).trim();
  const lines=body.split(/\r?\n/).map(x=>x.trim()).filter(Boolean); const servers=[]; let skipped=0;
  for(const line of lines) { try { servers.push(parseLink(line)); } catch { skipped++; } }
  if(!servers.length) throw Error('No supported configurations found');
  return {servers,skipped};
}
function ruleValue(value) {
 const v=value.trim().toLowerCase(); const [ip,bits,...extra]=v.split('/'); const family=net.isIP(ip);
 if(family && !extra.length && (bits===undefined || (/^\d+$/.test(bits) && Number(bits)<= (family===4?32:128)))) return {ip_cidr:[bits===undefined?`${ip}/${family===4?32:128}`:v]};
 if(v.length<=253 && /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(v)) return {domain_suffix:[v]};
 throw Error('Invalid domain, IP or CIDR');
}
function network(value) {
 const [ip,prefix] = value.split('/'); const family=net.isIP(ip); if(!family)return null;
 let n=0n; if(family===4) { for(const part of ip.split('.')) n=(n<<8n)+BigInt(Number(part)); }
 else { let v=ip.toLowerCase(); if(v.includes('.')) {const i=v.lastIndexOf(':');const a=v.slice(i+1).split('.').map(Number);v=v.slice(0,i)+':'+((a[0]<<8)|a[1]).toString(16)+':'+((a[2]<<8)|a[3]).toString(16);}const halves=v.split('::');const left=halves[0]?halves[0].split(':'):[];const right=halves[1]?halves[1].split(':'):[];const parts=halves.length===2?[...left,...Array(8-left.length-right.length).fill('0'),...right]:left;for(const part of parts)n=(n<<16n)+BigInt('0x'+part); }
 return {n,bits:Number(prefix??(family===4?32:128)),width:family===4?32:128};
}
function overlap(a,b) {const x=network(a),y=network(b);if(x&&y&&x.width===y.width){const bits=Math.min(x.bits,y.bits),shift=BigInt(x.width-bits);return (x.n>>shift)===(y.n>>shift);}if(x||y)return false;return a===b||a.endsWith('.'+b)||b.endsWith('.'+a);}
function makeConfig(server,rules,defaultRoute,appRules=[]) {
 const mappings={direct:'direct',vpn:'proxy',block:'block'};
 const appRoutes=appRules.filter(r=>r.enabled).map(r=>{if(!Object.hasOwn(mappings,r.action))throw Error('Invalid action');return {process_path:[normalizeApplicationPath(r.value)],...(r.action==='block'?{action:'reject'}:{action:'route',outbound:mappings[r.action]})};});
 return {log:{disabled:true},inbounds:[{type:'mixed',tag:'local',listen:'127.0.0.1',listen_port:2080}],outbounds:[{...server.outbound,tag:'proxy'},{type:'direct',tag:'direct'}],route:{rules:[...appRoutes,...rules.filter(r=>r.enabled).map(r=>({...ruleValue(r.value),...(r.action==='block'?{action:'reject'}:{action:'route',outbound:mappings[r.action]})}))],final:defaultRoute==='direct'?'direct':'proxy'}};
}
module.exports={parseLink,parseList,ruleValue,makeConfig,overlap};
