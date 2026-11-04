const core=require('./core.js');
const fs=require('fs');
const doc=core.parseDoc(fs.readFileSync('./sample.txt','utf8'));
console.log('rules',doc.ruleOrder.length,'cmds',doc.commands.length);
console.log(doc.commands.map(c=>c.id+': '+c.label));
console.log('issues',JSON.stringify(doc.issues.warnings),doc.issues.undef.map(u=>u.name).join(','),JSON.stringify(doc.issues.dups));
const show=(n,d=0)=>JSON.stringify(n);
console.log(show(doc.rules['Boolean'][0].ast));
console.log(show(doc.rules['Number'][0].ast));
console.log(show(doc.rules['UserList'][0].ast));
console.log(doc.rules['Locale'][0].ast.items.length, doc.rules['LabelTextColorHex'][0].ast.items.length);
console.log(doc.commands[0].text);
console.log(JSON.stringify(doc.commands[0].ast).slice(0,400));
for(const c of doc.commands){const r=core.renderSVG(c.ast,1100); console.log(c.id,Math.round(r.w),Math.round(r.h), r.svg.includes('NaN'))}
for(const n of doc.ruleOrder){const r=core.renderSVG(doc.rules[n][0].ast,1100); if(r.svg.includes('NaN')||r.svg.includes('undefined'))console.log('bad',n)}
console.log(core.docToEBNF(doc).split('\n').slice(0,40).join('\n'));
