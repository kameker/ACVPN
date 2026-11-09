const {makeConfig}=require('./core');
// Build the experimental TUN configuration; the caller manages privilege checks and process lifecycle.
function makeTunConfig(server,rules,defaultRoute,appRules=[]){
 const config=makeConfig(server,rules,defaultRoute,appRules);
 config.inbounds.push({type:'tun',tag:'tun-in',interface_name:'ACVPN-TUN',address:['172.30.198.1/30','fdfe:dcba:9876::1/126'],mtu:1500,auto_route:true,strict_route:false,stack:'mixed'});
 config.dns={servers:[{type:'local',tag:'bootstrap'},{type:'https',tag:'remote',server:'1.1.1.1',detour:'proxy'}],final:'remote'};
 config.route={...config.route,auto_detect_interface:true,default_domain_resolver:'bootstrap',rules:[{action:'sniff'},{protocol:'dns',action:'hijack-dns'},...config.route.rules]};
 return config;
}
module.exports={makeTunConfig};
