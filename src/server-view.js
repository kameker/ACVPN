(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.serverView = api;
})(globalThis, function () {
  // ISO codes with a matching local SVG flag. Special or unassigned regions are excluded.
  const codes = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW XK'.split(' ');
  const known = new Set(codes);
  const display = {ru:new Intl.DisplayNames(['ru'],{type:'region'}),en:new Intl.DisplayNames(['en'],{type:'region'})};
  const aliases = new Map();
  function add(alias, code) {
    if (!alias || alias.length < 3) return;
    const key=alias.toLocaleLowerCase().normalize('NFKC');
    if (!aliases.has(key)) aliases.set(key, code);
    else if (aliases.get(key)!==code) aliases.set(key, null);
  }
  for (const code of codes) for (const lang of ['ru','en']) add(display[lang].of(code),code);
  for (const [alias,code] of Object.entries({'usa':'US','u.s.a.':'US','united states of america':'US','сша':'US','великобритания':'GB','united kingdom':'GB','britain':'GB','ukraine':'UA','южная корея':'KR','северная корея':'KP','россия':'RU','russia':'RU','турция':'TR','turkey':'TR','нидерланды':'NL','holland':'NL','голландия':'NL','чехия':'CZ','czech republic':'CZ','оаэ':'AE','uae':'AE'})) add(alias,code);
  const entries=[...aliases].filter(([,code])=>code).sort((a,b)=>b[0].length-a[0].length).map(([alias,code])=>({code,re:new RegExp(`(?<![\\p{L}\\p{N}])${alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![\\p{L}\\p{N}])`,'iu')}));
  function detectCountry(name, server) {
    if (!name || name===server) return null;
    const text=String(name).normalize('NFKC');
    const emoji=text.match(/([\u{1F1E6}-\u{1F1FF}])([\u{1F1E6}-\u{1F1FF}])/u);
    if (emoji) { const code=[...emoji[0]].map(c=>String.fromCharCode(c.codePointAt(0)-0x1f1e6+65)).join(''); if(known.has(code))return code; }
    for (const entry of entries) if(entry.re.test(text))return entry.code;
    // Standalone uppercase codes at the start or enclosed in brackets are common provider conventions.
    const codeMatch=text.match(/^\s*([A-Z]{2})(?=$|[\s_\-:|/])|[\[({]([A-Z]{2})[\])}]/);
    if(codeMatch) { const code=(codeMatch[1]||codeMatch[2])==='UK'?'GB':codeMatch[1]||codeMatch[2]; if(known.has(code))return code; }
    return null;
  }
  function countryName(code,lang) { return code && known.has(code) ? display[lang==='en'?'en':'ru'].of(code) : null; }
  function flagPath(code) { return code && known.has(code) ? `../node_modules/flag-icons/flags/4x3/${code.toLowerCase()}.svg` : null; }
  function byName(a,b,lang) { return a.name.localeCompare(b.name,lang,{sensitivity:'base'}); }
  function eligibleForLatency(server) { return ['valid','no_tls','reality'].includes(server.certStatus) && Number.isFinite(server.latency) && server.latency>=0; }
  function byLatency(a,b,lang,preferVerified=false) {
    if(preferVerified){const rankA=a.certStatus==='valid'?0:1,rankB=b.certStatus==='valid'?0:1;if(rankA!==rankB)return rankA-rankB;}
    const av=Number.isFinite(a.latency)&&a.latency>=0?a.latency:Infinity;
    const bv=Number.isFinite(b.latency)&&b.latency>=0?b.latency:Infinity;
    return av===bv?byName(a,b,lang):av-bv;
  }
  function byCountry(a,b,lang) {
    if(!a.country&&!b.country)return byName(a,b,lang);
    if(!a.country)return 1;if(!b.country)return -1;
    return countryName(a.country,lang).localeCompare(countryName(b.country,lang),lang)||byName(a,b,lang);
  }
  return {detectCountry,countryName,flagPath,byName,byLatency,byCountry,eligibleForLatency};
});
