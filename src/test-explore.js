const core=require('./core.js');
const doc=core.parseDoc(require('fs').readFileSync('./sample.txt','utf8'));
for(const t of ['','ga','print','gam print ','gam print u','gam print users ','gam print users todrive ','gam create ','gam user bob@x.com print users ','gam calendar a@b.c create event ','gam checkconnection ','gam checkconnection']){
  const r=core.explore(doc,t);
  console.log(JSON.stringify(t),'->',r.matches.length,'matches;',r.next.slice(0,14).map(e=>e.text+'×'+e.count).join(' '), r.matches.some(m=>m.done)?'[complete]':'');
}
const t0=Date.now(); for(let i=0;i<200;i++) core.explore(doc,'gam print users todrive x '); console.log('ms/call',(Date.now()-t0)/200);
