const core=require('./core.js');
const doc=core.parseDoc(require('fs').readFileSync('process.argv[2]','utf8'));
console.log('rules',doc.ruleOrder.length,'cmds',doc.commands.length);
console.log('warnings',doc.issues.warnings.length, JSON.stringify(doc.issues.warnings.slice(0,40)));
console.log('undef',doc.issues.undef.length, doc.issues.undef.map(u=>u.name+'('+u.uses.length+')').join(', '));
console.log('dups',doc.issues.dups.length, doc.issues.dups.slice(0,50).map(d=>d.name+d.count+(d.identical?'=':'!')).join(' '));
let bad=0;
for(const n of doc.ruleOrder)for(const d of doc.rules[n]){const r=core.renderSVG(d.ast,1000); if(/NaN|undefined/.test(r.svg)){bad++;console.log('bad rule',n)}}
for(const c of doc.commands){const r=core.renderSVG(c.ast,1000); if(/NaN|undefined/.test(r.svg)){bad++;console.log('bad cmd',c.label)}}
console.log('bad',bad);
const prose=doc.ruleOrder.filter(n=>doc.rules[n].some(d=>d.ast.t==='prose'));console.log('prose',prose.join(', '));
// suspicious: commands with long label / few tokens
const sizes=doc.commands.map(c=>core.renderSVG(c.ast,1000).h).sort((a,b)=>b-a);console.log('max h',sizes[0]);
const t0=Date.now(); const r=core.explore(doc,'gam print users '); console.log('explore ms',Date.now()-t0,r.matches.length,r.over);
const t1=Date.now(); const r2=core.explore(doc,'gam '); console.log('explore ms',Date.now()-t1,r2.matches.length,r2.over, r2.next.length);
