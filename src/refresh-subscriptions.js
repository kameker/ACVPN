async function refreshSubscriptions(groups,refresh){let updated=0,failed=0;for(const group of groups.filter(g=>g.url)){try{await refresh(group);updated++;}catch{failed++;}}return {updated,failed};}
module.exports={refreshSubscriptions};
