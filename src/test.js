// Parses every example (and any files given on the command line) and checks that all diagrams lay out.
// Usage: cd src && node test.js [more-grammar-files...]
const core = require('./core.js'), fs = require('fs'), path = require('path');
const files = fs.readdirSync(path.join(__dirname, 'samples')).map(f => path.join(__dirname, 'samples', f)).concat(process.argv.slice(2));
for (const f of files) {
  const doc = core.parseDoc(fs.readFileSync(f, 'utf8'));
  let bad = 0;
  for (const n of doc.ruleOrder) for (const d of doc.rules[n]) if (/NaN|undefined/.test(core.renderSVG(d.ast, 1000).svg)) bad++;
  for (const c of doc.commands) if (/NaN|undefined/.test(core.renderSVG(c.ast, 1000).svg)) bad++;
  console.log(path.basename(f).padEnd(22), doc.dialect.padEnd(9), 'rules', String(doc.ruleOrder.length).padStart(4), 'commands', String(doc.commands.length).padStart(4),
    'undefined', String(doc.issues.undef.length).padStart(3), 'bracket warnings', String(doc.issues.warnings.length).padStart(3), bad ? 'LAYOUT ERRORS ' + bad : 'ok');
}

// Explorer smoke test: the JSON example should accept {"a":1} and suggest ',' or '}' afterwards.
const fsx = require('fs'), pathx = require('path');
const jdoc = core.parseDoc(fsx.readFileSync(pathx.join(__dirname, 'samples', 'json.abnf'), 'utf8'));
const jr = core.exploreChars(jdoc, 'JSON-text', '{"a":1');
console.log('explore JSON:', jr.cands.slice(0, 6).map(c => c.label).join(' '), jr.done ? '(complete)' : '');
