/* ===== EBNF viewer core: dialect parsers (EBNF, ABNF, informal usage syntax), railroad layout, EBNF export ===== */
var tw = function (s) { return s.length * 7.6; }; // replaced by canvas measure in the browser

var NT_RE = /^<[A-Za-z][A-Za-z0-9_\/ .\-]*>/;
var META = '[]()|*+';

function tokenize(s) {
  var toks = [], i = 0, n = s.length;
  function ws(ch) { return ch === undefined || /\s/.test(ch); }
  while (i < n) {
    var c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    var sp = i === 0 || /\s/.test(s[i - 1]);
    if (META.indexOf(c) >= 0) {
      toks.push({ k: c, sp: sp, nsp: ws(s[i + 1]) });
      i++; continue;
    }
    if (c === '<') {
      var m = NT_RE.exec(s.slice(i, i + 120));
      if (m) {
        toks.push({ k: 'nt', v: m[0].slice(1, -1).trim(), sp: sp, nsp: ws(s[i + m[0].length]) });
        i += m[0].length; continue;
      }
    }
    if (c === '"' || c === "'") {
      var nx = s[i + 1], pv = s[i - 1];
      if (nx === '<' || nx === '(' ||
          (pv && '*)>+'.indexOf(pv) >= 0 && (nx === undefined || /\s/.test(nx) || '|)]'.indexOf(nx) >= 0))) {
        i++; continue; // quote that merely wraps a list expression
      }
    }
    var j = i;
    while (j < n && !/\s/.test(s[j]) && META.indexOf(s[j]) < 0 &&
           !(s[j] === '<' && NT_RE.test(s.slice(j, j + 120)))) j++;
    if (j === i) j = i + 1;
    toks.push({ k: 'w', v: s.slice(i, j), sp: sp, nsp: ws(s[j]) });
    i = j;
  }
  return toks;
}

function mkSeq(items) {
  if (!items.length) return null;
  return items.length === 1 ? items[0] : { t: 'seq', items: items };
}
function mkChoice(items) {
  items = items.filter(Boolean);
  if (!items.length) return null;
  return items.length === 1 ? items[0] : { t: 'choice', items: items };
}

function parseExpr(s, warn) {
  var toks = tokenize(s), p = 0;
  warn = warn || function () {};
  function parseItem() {
    var t = toks[p], node;
    if (t.k === '[') {
      p++;
      var inner = parseAlts(1);
      if (toks[p] && toks[p].k === ']') p++; else warn('missing ]');
      node = { t: 'opt', item: inner || { t: 'seq', items: [] } };
    } else if (t.k === '(') {
      p++;
      var g = parseAlts(1);
      if (toks[p] && toks[p].k === ')') p++; else warn('missing )');
      node = g || { t: 'seq', items: [] };
    } else if (t.k === 'nt') {
      node = { t: 'nt', v: t.v }; p++;
    } else {
      node = { t: 'term', v: t.v || t.k }; p++;
    }
    while (p < toks.length && (toks[p].k === '*' || toks[p].k === '+') && !toks[p].sp) {
      node = { t: toks[p].k === '*' ? 'star' : 'plus', item: node }; p++;
    }
    return node;
  }
  function parseTight() {
    var first = parseItem(), opts = [first];
    while (p + 1 < toks.length && toks[p].k === '|' && !toks[p].sp && !toks[p].nsp &&
           toks[p + 1].k !== ')' && toks[p + 1].k !== ']' && toks[p + 1].k !== '|') {
      p++; opts.push(parseItem());
    }
    return opts.length > 1 ? { t: 'choice', items: opts } : first;
  }
  function parseAlts(depth) {
    var alts = [], seq = [];
    while (p < toks.length) {
      var t = toks[p];
      if (t.k === ')' || t.k === ']') {
        if (depth > 0) break;
        warn('unmatched ' + t.k);
        seq.push({ t: 'term', v: t.k }); p++; continue;
      }
      if (t.k === '|') { alts.push(mkSeq(seq)); seq = []; p++; continue; }
      seq.push(parseTight());
    }
    alts.push(mkSeq(seq));
    return mkChoice(alts);
  }
  return parseAlts(0) || { t: 'seq', items: [] };
}

function walkNT(n, fn) {
  if (!n) return;
  if (n.t === 'nt') fn(n.v);
  else if (n.items) n.items.forEach(function (c) { walkNT(c, fn); });
  else if (n.item) walkNT(n.item, fn);
  else if (n.a) { walkNT(n.a, fn); walkNT(n.b, fn); }
}

function cleanLine(ln) {
  // drop trailing "# comment" but keep hex colours such as #1c4587
  return ln.replace(/\s+#(?![0-9a-fA-F]{6}(?:\||\s|$)).*$/, '');
}

function cmdLabel(ast, text) {
  while (ast.t === 'choice') ast = ast.items[0]; // a stray | in the source splits the command in two; label by the first half
  var items = ast.t === 'seq' ? ast.items : [ast], out = [];
  for (var i = 0; i < items.length && out.length < 7; i++) {
    var c = items[i];
    if (c.t === 'term') out.push(c.v);
    else if (c.t === 'choice' && c.items.every(function (x) { return x.t === 'term'; })) out.push(c.items.map(function (x) { return x.v; }).join('|'));
    else if (c.t === 'nt' && i > 0 && i < 4) out.push('<' + c.v + '>');
    else break;
  }
  if (out.length < 2) { // e.g. "gam [<Select>] ...": show the first few pieces so the label means something
    var sh = function (c) { return c.t === 'term' ? c.v : c.t === 'nt' ? '<' + c.v + '>' : c.t === 'opt' ? '[' + sh(c.item) + ']' : '…'; };
    out = items.slice(0, 4).map(sh);
  }
  return out.join(' ') || text.slice(0, 40);
}

function parseInformal(text) {
  var lines = text.replace(/\r/g, '').split('\n');
  var counts = {}, ruleRe0 = /^<[A-Za-z][^<>]*>\s*:{0,2}=/;
  lines.forEach(function (l) { var m0 = /^([a-z][\w-]*)(\s|$)/.exec(l); if (m0 && !ruleRe0.test(l)) counts[m0[1]] = (counts[m0[1]] || 0) + 1; });
  var prefix = null, bestN = 1;
  Object.keys(counts).forEach(function (k) { if (counts[k] > bestN) { bestN = counts[k]; prefix = k; } });
  var cmdRe = prefix ? new RegExp('^' + prefix.replace(/[^\w-]/g, '') + '(\\s|$)') : null;
  var rules = {}, ruleOrder = [], commands = [], issues = { warnings: [] };
  var section = '', sub = '', cur = null;

  function flush() {
    if (!cur) return;
    var body = cur.lines.join('\n').trim();
    var nonEmpty = cur.lines.filter(function (l) { return l.trim(); });
    if (cur.kind === 'rule' && nonEmpty.length > 1 && nonEmpty.every(function (l) { return /^\s*https?:\/\//.test(l); }))
      body = nonEmpty.map(function (l) { return l.trim(); }).join(' |\n'); // one URL pattern per line
    var warns = [];
    var ast = parseExpr(body, function (w) { warns.push(w); });
    if (cur.kind === 'rule') {
      var flat = body.replace(/\s+/g, ' ');
      if ((/^(a|an|the|any|one)\s+\S/i.test(flat) && !/[\[\]()|*+<>]/.test(flat)) || /^<[^<>]*\s[^<>]*>$/.test(flat)) {
        ast = { t: 'prose', text: flat.replace(/^<|>$/g, '') }; // a description in words, not grammar
        warns = [];
      }
      if (!rules[cur.name]) { rules[cur.name] = []; ruleOrder.push(cur.name); }
      rules[cur.name].push({ ast: ast, text: body, section: cur.section, sub: cur.sub, line: cur.line, notes: cur.notes });
      warns.forEach(function (w) { issues.warnings.push({ kind: 'rule', name: cur.name, msg: w }); });
    } else {
      var id = commands.length;
      commands.push({ id: id, label: cmdLabel(ast, body), text: body, ast: ast, section: cur.section, line: cur.line, warns: warns, notes: cur.notes });
      warns.forEach(function (w) { issues.warnings.push({ kind: 'cmd', id: id, msg: w }); });
    }
    cur = null;
  }

  for (var li = 0; li < lines.length; li++) {
    var ln = lines[li], m;
    if ((m = /^(#{1,3}) (\S.*)$/.exec(ln))) {
      flush();
      if (m[1].length === 1) { section = m[2].trim(); sub = ''; } else sub = m[2].trim();
      continue;
    }
    if (/^#/.test(ln)) continue; // commented-out line, keep current block
    if (/^\s*$/.test(ln)) { flush(); continue; }
    if ((m = /^<([A-Za-z][^<>]*)>\s*:{0,2}=\s*(.*)$/.exec(ln))) {
      flush();
      cur = { kind: 'rule', name: m[1].trim(), lines: [cleanLine(m[2])], notes: [], section: section, sub: sub, line: li + 1 };
      continue;
    }
    if (cmdRe && cmdRe.test(ln)) {
      flush();
      cur = { kind: 'cmd', lines: [cleanLine(ln)], notes: [], section: section, line: li + 1 };
      continue;
    }
    if (/^\s+\S/.test(ln)) {
      if (cur) {
        if (/^\s*(See:|Must match|Maximum of|<[^<>]+>\s+(must|can|may|is|are)\b)/.test(ln)) cur.notes.push(ln.trim()); // prose, not grammar
        else cur.lines.push(cleanLine(ln));
      }
      continue;
    }
    flush(); // unindented prose
  }
  flush();

  return { rules: rules, ruleOrder: ruleOrder, commands: commands, issues: issues, prefix: prefix };
}

function analyze(doc, builtin) {
  var rules = doc.rules, ruleOrder = doc.ruleOrder, commands = doc.commands, issues = doc.issues;
  var refs = {}, dups = [];
  function note(name, where) { (refs[name] = refs[name] || []).push(where); }
  function lev(a, b) {
    var p = [], i, j;
    for (j = 0; j <= b.length; j++) p[j] = j;
    for (i = 1; i <= a.length; i++) { var prev = p[0]; p[0] = i; for (j = 1; j <= b.length; j++) { var t = p[j]; p[j] = Math.min(p[j] + 1, p[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } }
    return p[b.length];
  }
  ruleOrder.forEach(function (name) {
    rules[name].forEach(function (d) { walkNT(d.ast, function (v) { note(v, { kind: 'rule', name: name, line: d.line }); }); });
    var uniq = {};
    rules[name].forEach(function (d) { uniq[d.text.replace(/\s+/g, ' ')] = 1; });
    if (rules[name].length > 1) dups.push({ name: name, count: rules[name].length, identical: Object.keys(uniq).length === 1, lines: rules[name].map(function (d) { return d.line; }) });
  });
  commands.forEach(function (c) { walkNT(c.ast, function (v) { note(v, { kind: 'cmd', id: c.id, line: c.line }); }); });
  var undef = Object.keys(refs).filter(function (v) { return !rules[v] && !(builtin && builtin[v.toUpperCase()]); })
    .map(function (v) {
      var best = null, bd = 99, lv = v.toLowerCase();
      ruleOrder.forEach(function (n) {
        var d = lev(lv, n.toLowerCase());
        if (d < bd) { bd = d; best = n; }
      });
      var lim = v.length >= 8 ? 2 : 1;
      var lines = refs[v].map(function (u) { return u.line; }).sort(function (a, b) { return a - b; });
      return { name: v, uses: refs[v], suggest: bd <= lim ? best : null, line: lines[0] };
    })
    .sort(function (a, b) { return b.uses.length - a.uses.length; });
  issues.undef = undef; issues.dups = dups;
  issues.unused = ruleOrder.filter(function (n, k) { return !refs[n] && k > 0; });
}


/* ===== generic EBNF (W3C, ISO 14977, ANTLR-ish, plain BNF) ===== */
var EMPTY = { t: 'seq', items: [] };

function stripComments(text, mode) {
  var out = '', i = 0, n = text.length, q = null;
  function blank(seg) { return seg.replace(/[^\n]/g, ' '); }
  function toEol(from) { var e = text.indexOf('\n', from); return e < 0 ? n : e; }
  while (i < n) {
    var c = text[i], d = text[i + 1];
    if (q) {
      out += c;
      if (c === '\\' && mode === 'ebnf' && d !== undefined && d !== '\n') { out += d; i += 2; continue; }
      if (c === q || c === '\n') q = null;
      i++; continue;
    }
    if (c === '"' || (c === "'" && mode === 'ebnf')) { q = c; out += c; i++; continue; }
    if (mode === 'ebnf') {
      if ((c === '(' && d === '*') || (c === '/' && d === '*')) {
        var close = c === '(' ? '*)' : '*/', e = text.indexOf(close, i + 2), seg = e < 0 ? text.slice(i) : text.slice(i, e + 2);
        out += blank(seg); i += seg.length; continue;
      }
      if (c === '/' && d === '/') { var e2 = toEol(i); out += blank(text.slice(i, e2)); i = e2; continue; }
      if (c === '#' && (i === 0 || /\s/.test(text[i - 1])) && !/^#x[0-9A-Fa-f]/.test(text.slice(i, i + 3))) { var e3 = toEol(i); out += blank(text.slice(i, e3)); i = e3; continue; }
    } else if (c === ';') { var e4 = toEol(i); out += blank(text.slice(i, e4)); i = e4; continue; }
    out += c; i++;
  }
  return out;
}

var RULE_START = /^[ \t]*(?:(?:fragment|public|private)\s+)?(?:(<[^<>\n]+>|[A-Za-z_][\w\-]*)[ \t]*(::=|:=|<-|←|:)|((?:[A-Za-z_][\w\-]*[ \t]+)*[A-Za-z_][\w\-]*)[ \t]*(=))(?![=:>])[ \t]*/;

function splitTopLevel(body) { // cut at ';' outside quotes and brackets
  var parts = [], cur = '', q = null, depth = 0;
  for (var i = 0; i < body.length; i++) {
    var c = body[i];
    if (q) { cur += c; if (c === '\\') { cur += body[i + 1] || ''; i++; } else if (c === q || c === '\n') q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
    if (c === ';' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur);
  return parts;
}

function isClassBody(c) {
  if (!c || /\s/.test(c) || c.length < 2) return false;
  if (/^[A-Za-z_]\w*(-\w+)+$/.test(c) && c.split('-').every(function (x) { return x.length >= 3; })) return false; // key-value style name, not a range
  return c[0] === '^' || /#x[0-9A-Fa-f]/.test(c) || /\\/.test(c) || /[^\s\]]-[^\s\]]/.test(c);
}

function tokE(s, multi) {
  var toks = [], i = 0, n = s.length, m;
  function push(t, start, end) { t.sp = start === 0 || /\s/.test(s[start - 1]); t.raw = s.slice(start, end); toks.push(t); }
  while (i < n) {
    var c = s[i];
    if (/\s/.test(c) || c === ',') { i++; continue; }
    if (c === '"' || c === "'") {
      var j = i + 1;
      while (j < n && s[j] !== c && s[j] !== '\n') { if (s[j] === '\\') j++; j++; }
      if (s[j] === c) {
        var v = s.slice(i + 1, j).replace(/\\(.)/g, '$1'), end = j + 1;
        var rm = /^\s*\.\.\s*(['"])((?:\\.|[^\\])*?)\1/.exec(s.slice(end));
        if (rm) { push({ k: 'cls', v: '[' + v + '-' + rm[2] + ']' }, i, end + rm[0].length); i = end + rm[0].length; continue; }
        push({ k: 'str', v: v }, i, end); i = end; continue;
      }
      push({ k: 'sym', v: c }, i, i + 1); i++; continue;
    }
    if (c === '<' && (m = /^<([^<>\n]+)>/.exec(s.slice(i, i + 200)))) { push({ k: 'nt', v: m[1].trim() }, i, i + m[0].length); i += m[0].length; continue; }
    if (c === '[') {
      var k = s.indexOf(']', i + 1);
      if (k > 0 && isClassBody(s.slice(i + 1, k))) { push({ k: 'cls', v: s.slice(i, k + 1) }, i, k + 1); i = k + 1; continue; }
    }
    if (c === '#' && (m = /^#x[0-9A-Fa-f]+/.exec(s.slice(i, i + 12)))) { push({ k: 'hex', v: m[0] }, i, i + m[0].length); i += m[0].length; continue; }
    if ('(){}[]|/?*+~'.indexOf(c) >= 0) { push({ k: c }, i, i + 1); i++; continue; }
    if (c === '-') { push({ k: '-' }, i, i + 1); i++; continue; }
    if ((m = /^\d+/.exec(s.slice(i, i + 12)))) { push({ k: 'num', v: m[0] }, i, i + m[0].length); i += m[0].length; continue; }
    var mw = null;
    if (multi) for (var q = 0; q < multi.length; q++) if (s.substr(i, multi[q].length) === multi[q] && !/[\w\-]/.test(s[i + multi[q].length] || ' ') && (i === 0 || !/[\w\-]/.test(s[i - 1]))) { mw = multi[q]; break; }
    if (mw) { push({ k: 'id', v: mw }, i, i + mw.length); i += mw.length; continue; }
    if ((m = /^[A-Za-z_]\w*(?:-(?=[A-Za-z_\d])\w*)*/.exec(s.slice(i, i + 120)))) { push({ k: 'id', v: m[0] }, i, i + m[0].length); i += m[0].length; continue; }
    push({ k: 'sym', v: c }, i, i + 1); i++;
  }
  return toks;
}

function parseE(s, warn, multi) {
  var toks = tokE(s, multi), p = 0;
  warn = warn || function () {};
  function expect(k) { if (toks[p] && toks[p].k === k) p++; else warn('missing ' + k); }
  function item() {
    var t = toks[p], node;
    if (t.k === '~') { p++; return toks[p] ? { t: 'not', item: item() } : { t: 'term', v: '~' }; }
    if (t.k === 'num' && toks[p + 1] && toks[p + 1].k === '*') { p += 2; return toks[p] ? { t: 'rep', min: +t.v, max: +t.v, item: item() } : { t: 'term', v: t.v + '*' }; }
    if (t.k === '(') { p++; var g = alts(1); expect(')'); node = g || EMPTY; }
    else if (t.k === '[') { p++; var g2 = alts(1); expect(']'); node = { t: 'opt', item: g2 || EMPTY }; }
    else if (t.k === '{') { p++; var g3 = alts(1); expect('}'); node = { t: 'star', item: g3 || EMPTY }; }
    else if (t.k === '?') {
      var q = -1; for (var z = p + 1; z < toks.length; z++) if (toks[z].k === '?') { q = z; break; }
      if (q > 0) { node = { t: 'prose', text: toks.slice(p + 1, q).map(function (x) { return x.raw; }).join(' ') }; p = q + 1; }
      else { node = { t: 'term', v: '?' }; p++; }
    }
    else {
      if (t.k === 'str') node = { t: 'term', v: t.v };
      else if (t.k === 'hex') node = { t: 'term', v: t.v, raw: true };
      else if (t.k === 'cls') node = { t: 'cls', v: t.v };
      else if (t.k === 'nt' || t.k === 'id') node = { t: 'nt', v: t.v };
      else node = { t: 'term', v: t.v || t.k };
      p++;
    }
    while (p < toks.length && (toks[p].k === '?' || toks[p].k === '*' || toks[p].k === '+') && !toks[p].sp) {
      node = { t: toks[p].k === '?' ? 'opt' : toks[p].k === '*' ? 'star' : 'plus', item: node }; p++;
    }
    while (p + 1 < toks.length && toks[p].k === '-') { p++; node = { t: 'except', a: node, b: item() }; }
    return node;
  }
  function alts(depth) {
    var as = [], seq = [];
    while (p < toks.length) {
      var t = toks[p];
      if (t.k === ')' || t.k === ']' || t.k === '}') {
        if (depth > 0) break;
        warn('unmatched ' + t.k); seq.push({ t: 'term', v: t.k }); p++; continue;
      }
      if (t.k === '|' || t.k === '/') { as.push(mkSeq(seq)); seq = []; p++; continue; }
      seq.push(item());
    }
    as.push(mkSeq(seq));
    return mkChoice(as);
  }
  return alts(0) || EMPTY;
}

function parseEBNF(text) {
  var lines = stripComments(text.replace(/\r/g, ''), 'ebnf').split('\n');
  var rules = {}, ruleOrder = [], warnings = [], chunks = [], cur = null, m;
  lines.forEach(function (ln, li) {
    if ((m = RULE_START.exec(ln))) { cur = { name: (m[1] || m[3]).replace(/^<|>$/g, '').replace(/\s+/g, ' ').trim(), sep: m[2] || m[4], body: ln.slice(m[0].length), line: li + 1 }; chunks.push(cur); }
    else if (cur) cur.body += '\n' + ln;
  });
  var all = [];
  chunks.forEach(function (ch) {
    var parts = splitTopLevel(ch.body);
    all.push({ name: ch.name, sep: ch.sep, body: parts[0], line: ch.line });
    for (var k = 1; k < parts.length; k++) {
      var m2 = RULE_START.exec(parts[k].replace(/^\s+/, ''));
      if (m2) all.push({ name: (m2[1] || m2[3]).replace(/^<|>$/g, '').replace(/\s+/g, ' ').trim(), sep: m2[2] || m2[4], body: parts[k].replace(/^\s+/, '').slice(m2[0].length), line: ch.line });
    }
  });
  var multi = [];
  all.forEach(function (r) { if (/ /.test(r.name) && multi.indexOf(r.name) < 0) multi.push(r.name); });
  multi.sort(function (a, b) { return b.length - a.length; }); // ISO style: names may contain spaces
  all.forEach(function (r) {
    var body = r.body.trim();
    if (r.sep === '=' && /[\w"')\]}]\s*\.$/.test(body)) body = body.replace(/\s*\.$/, ''); // Wirth-style terminator
    var warns = [], ast = parseE(body, function (w) { warns.push(w); }, multi);
    if (!rules[r.name]) { rules[r.name] = []; ruleOrder.push(r.name); }
    rules[r.name].push({ ast: ast, text: body, section: '', sub: '', line: r.line, notes: [] });
    warns.forEach(function (w) { warnings.push({ kind: 'rule', name: r.name, msg: w }); });
  });
  return { rules: rules, ruleOrder: ruleOrder, commands: [], issues: { warnings: warnings }, prefix: null };
}

/* ===== ABNF (RFC 5234) ===== */
var ABNF_CORE = { ALPHA: 1, BIT: 1, CHAR: 1, CR: 1, CRLF: 1, CTL: 1, DIGIT: 1, DQUOTE: 1, HEXDIG: 1, HTAB: 1, LF: 1, LWSP: 1, OCTET: 1, SP: 1, VCHAR: 1, WSP: 1 };

function hexOf(num, base) { var v = parseInt(num, base); return '#x' + (v < 16 ? '0' : '') + v.toString(16).toUpperCase(); }

function tokA(s) {
  var toks = [], i = 0, n = s.length, m;
  function push(t, st, en) { t.sp = st === 0 || /\s/.test(s[st - 1]); t.raw = s.slice(st, en); toks.push(t); }
  while (i < n) {
    var c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if ((m = /^(?:%[si])?"([^"\n]*)"/.exec(s.slice(i)))) { push({ k: 'str', v: m[1] }, i, i + m[0].length); i += m[0].length; continue; }
    if ((m = /^%([xdbXDB])([0-9A-Fa-f]+)(-[0-9A-Fa-f]+|(?:\.[0-9A-Fa-f]+)+)?/.exec(s.slice(i)))) {
      var base = { x: 16, d: 10, b: 2 }[m[1].toLowerCase()], nodeV;
      if (m[3] && m[3][0] === '-') nodeV = { k: 'cls', v: '[' + hexOf(m[2], base) + '-' + hexOf(m[3].slice(1), base) + ']' };
      else nodeV = { k: 'hexs', v: [m[2]].concat(m[3] ? m[3].slice(1).split('.') : []).map(function (x) { return hexOf(x, base); }) };
      push(nodeV, i, i + m[0].length); i += m[0].length; continue;
    }
    if (c === '<' && (m = /^<([^<>\n]*)>/.exec(s.slice(i, i + 200)))) { push({ k: 'prose', v: m[1].trim() }, i, i + m[0].length); i += m[0].length; continue; }
    if ('()[]/*'.indexOf(c) >= 0) { push({ k: c }, i, i + 1); i++; continue; }
    if ((m = /^\d+/.exec(s.slice(i, i + 12)))) { push({ k: 'num', v: m[0] }, i, i + m[0].length); i += m[0].length; continue; }
    if ((m = /^[A-Za-z][A-Za-z0-9\-]*/.exec(s.slice(i, i + 120)))) { push({ k: 'id', v: m[0] }, i, i + m[0].length); i += m[0].length; continue; }
    push({ k: 'sym', v: c }, i, i + 1); i++;
  }
  return toks;
}

function parseA(s, warn) {
  var toks = tokA(s), p = 0;
  warn = warn || function () {};
  function expect(k) { if (toks[p] && toks[p].k === k) p++; else warn('missing ' + k); }
  function element() {
    var t = toks[p], node;
    if (t.k === '(') { p++; var g = alts(1); expect(')'); return g || EMPTY; }
    if (t.k === '[') { p++; var g2 = alts(1); expect(']'); return { t: 'opt', item: g2 || EMPTY }; }
    p++;
    if (t.k === 'str') return { t: 'term', v: t.v };
    if (t.k === 'cls') return { t: 'cls', v: t.v };
    if (t.k === 'hexs') return mkSeq(t.v.map(function (h) { return { t: 'term', v: h, raw: true }; }));
    if (t.k === 'prose') return { t: 'prose', text: t.v || 'prose' };
    if (t.k === 'id') return { t: 'nt', v: t.v };
    return { t: 'term', v: t.v || t.k };
  }
  function item() {
    var t = toks[p], mn = null, mx = null;
    if (t.k === 'num') {
      var nx = toks[p + 1];
      if (nx && nx.k === '*' && !nx.sp) {
        p += 2; mn = +t.v;
        if (toks[p] && toks[p].k === 'num' && !toks[p].sp) { mx = +toks[p].v; p++; } else mx = Infinity;
      } else if (nx && !nx.sp && nx.k !== '/') { p++; mn = mx = +t.v; }
    } else if (t.k === '*') {
      p++; mn = 0;
      if (toks[p] && toks[p].k === 'num' && !toks[p].sp) { mx = +toks[p].v; p++; } else mx = Infinity;
    }
    if (mn !== null && !toks[p]) return { t: 'term', v: t.raw };
    var el = element();
    return mn === null ? el : { t: 'rep', min: mn, max: mx, item: el };
  }
  function alts(depth) {
    var as = [], seq = [];
    while (p < toks.length) {
      var t = toks[p];
      if (t.k === ')' || t.k === ']') {
        if (depth > 0) break;
        warn('unmatched ' + t.k); seq.push({ t: 'term', v: t.k }); p++; continue;
      }
      if (t.k === '/') { as.push(mkSeq(seq)); seq = []; p++; continue; }
      seq.push(item());
    }
    as.push(mkSeq(seq));
    return mkChoice(as);
  }
  return alts(0) || EMPTY;
}

function parseABNF(text) {
  var lines = stripComments(text.replace(/\r/g, ''), 'abnf').split('\n');
  var rules = {}, ruleOrder = [], warnings = [], cur = null, chunks = [], m;
  lines.forEach(function (ln, li) {
    if ((m = /^([A-Za-z][\w\-]*)[ \t]*(=\/?)[ \t]*(.*)$/.exec(ln))) { cur = { name: m[1], inc: m[2] === '=/', body: m[3], line: li + 1 }; chunks.push(cur); }
    else if (cur && /^\s+\S/.test(ln)) cur.body += '\n' + ln;
    else if (/^\S/.test(ln)) cur = null;
  });
  chunks.forEach(function (ch) {
    var body = ch.body.trim(), warns = [], ast = parseA(body, function (w) { warns.push(w); });
    if (ch.inc && rules[ch.name]) {
      var d = rules[ch.name][0];
      d.ast = mkChoice([d.ast, ast]); d.text += ' /\n' + body;
    } else {
      if (!rules[ch.name]) { rules[ch.name] = []; ruleOrder.push(ch.name); }
      rules[ch.name].push({ ast: ast, text: body, section: '', sub: '', line: ch.line, notes: [] });
    }
    warns.forEach(function (w) { warnings.push({ kind: 'rule', name: ch.name, msg: w }); });
  });
  return { rules: rules, ruleOrder: ruleOrder, commands: [], issues: { warnings: warnings }, prefix: null };
}

/* ===== dialect detection and entry point ===== */
function detectDialect(text) {
  if (/%[xdbXDB][0-9A-Fa-f]/.test(text) || /^[A-Za-z][\w-]*[ \t]*=\/[ \t]/m.test(text)) return 'abnf';
  var counts = {}, top = 0;
  text.replace(/\r/g, '').split('\n').forEach(function (l) {
    var m = /^([a-z][\w-]*)(\s|$)/.exec(l);
    if (m && !RULE_START.test(l)) { counts[m[1]] = (counts[m[1]] || 0) + 1; if (counts[m[1]] > top) top = counts[m[1]]; }
  });
  return top >= 3 ? 'informal' : 'ebnf';
}

function parseDoc(text, dialect) {
  var d = !dialect || dialect === 'auto' ? detectDialect(text) : dialect;
  var doc = d === 'informal' ? parseInformal(text) : d === 'abnf' ? parseABNF(text) : parseEBNF(text);
  doc.dialect = d; doc.start = doc.ruleOrder[0] || null;
  doc.builtin = d === 'abnf' ? ABNF_CORE : null;
  analyze(doc, doc.builtin);
  return doc;
}

/* ===== railroad layout ===== */
var GAP = 14, R = 10;
function f(n) { return Math.round(n * 10) / 10; }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function hline(x1, x2, y) { return x2 > x1 ? 'M' + f(x1) + ' ' + f(y) + 'H' + f(x2) : ''; }

function nSkip() { return { w: 0, up: 0, down: 0, path: function () { return ''; }, draw: function () { return ''; } }; }

function nTerm(v) {
  var w = Math.max(26, tw(v) + 22);
  return { w: w, up: 13, down: 13, kind: 'term', v: v,
    path: function () { return ''; },
    draw: function (x, y) {
      return '<g class="rr-term"><rect x="' + f(x) + '" y="' + f(y - 13) + '" width="' + f(w) + '" height="26" rx="13"/>' +
        '<text x="' + f(x + w / 2) + '" y="' + f(y + 4.5) + '" text-anchor="middle">' + esc(v) + '</text></g>';
    } };
}
function nNT(v) {
  var w = Math.max(26, tw(v) + 22);
  return { w: w, up: 13, down: 13, kind: 'nt', v: v,
    path: function () { return ''; },
    draw: function (x, y) {
      return '<g class="rr-nt" data-nt="' + esc(v) + '"><rect x="' + f(x) + '" y="' + f(y - 13) + '" width="' + f(w) + '" height="26" rx="3"/>' +
        '<text x="' + f(x + w / 2) + '" y="' + f(y + 4.5) + '" text-anchor="middle">' + esc(v) + '</text></g>';
    } };
}

function nSeq(items) {
  if (!items.length) return { w: 20, up: 0, down: 0, path: function (x, y) { return hline(x, x + 20, y); }, draw: function () { return ''; } };
  if (items.length === 1) return items[0];
  var w = items.reduce(function (a, c) { return a + c.w; }, 0) + GAP * (items.length - 1);
  return { w: w,
    up: Math.max.apply(null, items.map(function (c) { return c.up; })),
    down: Math.max.apply(null, items.map(function (c) { return c.down; })),
    path: function (x, y) {
      var d = '', cx = x;
      items.forEach(function (c, i) {
        d += c.path(cx, y); cx += c.w;
        if (i < items.length - 1) { d += hline(cx, cx + GAP, y); cx += GAP; }
      });
      return d;
    },
    draw: function (x, y) {
      var s = '', cx = x;
      items.forEach(function (c, i) { s += c.draw(cx, y); cx += c.w + GAP; });
      return s;
    } };
}

function nChoice(items) {
  var iw = Math.max.apply(null, items.map(function (c) { return c.w; })), w = iw + 40, off = [0];
  for (var i = 1; i < items.length; i++) off.push(off[i - 1] + items[i - 1].down + 10 + items[i].up);
  return { w: w, up: items[0].up, down: off[off.length - 1] + items[items.length - 1].down,
    path: function (x, y) {
      var d = '';
      items.forEach(function (c, i) {
        var yy = y + off[i];
        if (i === 0) d += hline(x, x + 20, y) + hline(x + 20 + c.w, x + w, y);
        else {
          d += 'M' + f(x) + ' ' + f(y) + 'a' + R + ' ' + R + ' 0 0 1 ' + R + ' ' + R + 'V' + f(yy - R) + 'a' + R + ' ' + R + ' 0 0 0 ' + R + ' ' + R;
          d += 'M' + f(x + w) + ' ' + f(y) + 'a' + R + ' ' + R + ' 0 0 0 -' + R + ' ' + R + 'V' + f(yy - R) + 'a' + R + ' ' + R + ' 0 0 1 -' + R + ' ' + R;
          d += hline(x + 20 + c.w, x + w - 20, yy);
        }
        d += c.path(x + 20, yy);
      });
      return d;
    },
    draw: function (x, y) {
      var s = '';
      items.forEach(function (c, i) { s += c.draw(x + 20, y + off[i]); });
      return s;
    } };
}

function nLabel(text) {
  var w = tw(text) + 10;
  return { w: w, up: 13, down: 13, path: function (x, y) { return hline(x, x + w, y); },
    draw: function (x, y) { return '<text class="rr-label" x="' + f(x + w / 2) + '" y="' + f(y - 6) + '" text-anchor="middle">' + esc(text) + '</text>'; } };
}
function nClass(v) {
  var w = Math.max(26, tw(v) + 22);
  return { w: w, up: 13, down: 13, path: function () { return ''; },
    draw: function (x, y) {
      return '<g class="rr-class"><rect x="' + f(x) + '" y="' + f(y - 13) + '" width="' + f(w) + '" height="26" rx="3"/>' +
        '<text x="' + f(x + w / 2) + '" y="' + f(y + 4.5) + '" text-anchor="middle">' + esc(v) + '</text></g>';
    } };
}
function nLoop(item, cap) {
  var w = item.w + 40, ret = item.down + 18 + (cap ? 14 : 0);
  return { w: w, up: item.up, down: ret,
    path: function (x, y) {
      var ry = y + ret - (cap ? 14 : 0);
      return hline(x, x + 20, y) + hline(x + 20 + item.w, x + w, y) + item.path(x + 20, y) +
        'M' + f(x + 10) + ' ' + f(y) + 'a' + R + ' ' + R + ' 0 0 0 -' + R + ' ' + R + 'V' + f(ry - R) +
        'a' + R + ' ' + R + ' 0 0 0 ' + R + ' ' + R + 'H' + f(x + w - R) +
        'a' + R + ' ' + R + ' 0 0 0 ' + R + ' -' + R + 'V' + f(y + R) + 'a' + R + ' ' + R + ' 0 0 0 -' + R + ' -' + R;
    },
    draw: function (x, y) {
      return item.draw(x + 20, y) + (cap ? '<text class="rr-label" x="' + f(x + w / 2) + '" y="' + f(y + ret - 4) + '" text-anchor="middle">' + esc(cap) + '</text>' : '');
    } };
}

function nStack(rows) {
  var maxw = Math.max.apply(null, rows.map(function (r) { return r.w; })), W = maxw + 40, ys = [0];
  for (var i = 1; i < rows.length; i++) {
    var mid = ys[i - 1] + Math.max(rows[i - 1].down + 10, 20);
    ys.push(mid + Math.max(20, rows[i].up + 10));
  }
  return { w: W, up: rows[0].up, down: ys[ys.length - 1] + rows[rows.length - 1].down,
    path: function (x, y) {
      var d = hline(x, x + 20, y);
      rows.forEach(function (r, i) {
        var a = y + ys[i];
        d += r.path(x + 20, a);
        if (i < rows.length - 1) {
          var b = y + ys[i + 1], mid = a + Math.max(r.down + 10, 20);
          d += hline(x + 20 + r.w, x + W - R, a);
          d += 'M' + f(x + W - R) + ' ' + f(a) + 'a' + R + ' ' + R + ' 0 0 1 ' + R + ' ' + R + 'V' + f(mid - R) +
            'a' + R + ' ' + R + ' 0 0 1 -' + R + ' ' + R + 'H' + f(x + R) +
            'a' + R + ' ' + R + ' 0 0 0 -' + R + ' ' + R + 'V' + f(b - R) +
            'a' + R + ' ' + R + ' 0 0 0 ' + R + ' ' + R + 'H' + f(x + 20);
        } else d += hline(x + 20 + r.w, x + W, a);
      });
      return d;
    },
    draw: function (x, y) {
      return rows.map(function (r, i) { return r.draw(x + 20, y + ys[i]); }).join('');
    } };
}

function nEnum(words, maxw) {
  var lines = [], line = '', lw = 0, sep = 14;
  words.forEach(function (wd) {
    var ww = tw(wd);
    if (line && lw + sep + ww > maxw) { lines.push(line); line = ''; lw = 0; }
    line += (line ? '   ' : '') + wd; lw += (lw ? sep : 0) + ww;
  });
  if (line) lines.push(line);
  var wmax = Math.max.apply(null, lines.map(tw).concat([tw('one of ' + words.length)])), W = wmax + 28, H = (lines.length + 1) * 17 + 14;
  return { w: W, up: H / 2, down: H / 2, path: function () { return ''; },
    draw: function (x, y) {
      var s = '<g class="rr-enum"><rect x="' + f(x) + '" y="' + f(y - H / 2) + '" width="' + f(W) + '" height="' + f(H) + '" rx="8"/>' +
        '<text class="rr-enum-title" x="' + f(x + 14) + '" y="' + f(y - H / 2 + 20) + '">one of ' + words.length + '</text>';
      lines.forEach(function (l, i) {
        s += '<text x="' + f(x + 14) + '" y="' + f(y - H / 2 + 20 + (i + 1) * 17) + '" xml:space="preserve">' + esc(l) + '</text>';
      });
      return s + '</g>';
    } };
}

function nNote(text, maxw) {
  var words = text.split(' '), lines = [], line = '';
  words.forEach(function (wd) {
    if (line && tw(line + ' ' + wd) > maxw) { lines.push(line); line = wd; } else line = line ? line + ' ' + wd : wd;
  });
  if (line) lines.push(line);
  var wmax = Math.max.apply(null, lines.map(tw).concat([tw('described in words')])), W = wmax + 28, H = (lines.length + 1) * 17 + 14;
  return { w: W, up: H / 2, down: H / 2, path: function () { return ''; },
    draw: function (x, y) {
      var s = '<g class="rr-enum"><rect x="' + f(x) + '" y="' + f(y - H / 2) + '" width="' + f(W) + '" height="' + f(H) + '" rx="8"/>' +
        '<text class="rr-enum-title" x="' + f(x + 14) + '" y="' + f(y - H / 2 + 20) + '">described in words</text>';
      lines.forEach(function (l, i) {
        s += '<text x="' + f(x + 14) + '" y="' + f(y - H / 2 + 20 + (i + 1) * 17) + '">' + esc(l) + '</text>';
      });
      return s + '</g>';
    } };
}

function build(ast, limit) {
  limit = Math.max(limit, 240);
  switch (ast.t) {
    case 'term': return nTerm(ast.v);
    case 'nt': return nNT(ast.v);
    case 'prose': return nNote(ast.text, Math.min(limit - 80, 520));
    case 'cls': return nClass(ast.v);
    case 'except': return nSeq([build(ast.a, limit - 60), nLabel('except'), build(ast.b, limit - 60)]);
    case 'not': return nSeq([nLabel('not'), build(ast.item, limit - 60)]);
    case 'rep': {
      var rmin = ast.min, rmax = ast.max;
      if (rmin === 1 && rmax === 1) return build(ast.item, limit);
      if (rmin === 0 && rmax === 1) return build({ t: 'opt', item: ast.item }, limit);
      if (rmin === 0 && rmax === Infinity) return build({ t: 'star', item: ast.item }, limit);
      if (rmin === 1 && rmax === Infinity) return build({ t: 'plus', item: ast.item }, limit);
      var cap = (rmin === rmax ? rmin : rmin + '\u2013' + (rmax === Infinity ? '\u221e' : rmax)) + '\u00d7';
      var lp = nLoop(build(ast.item, limit - 60), cap);
      return rmin === 0 ? nChoice([nSkip(), lp]) : lp;
    }
    case 'seq': {
      var kids = ast.items.map(function (c) { return build(c, limit); });
      if (!kids.length) return nSeq([]);
      var total = kids.reduce(function (a, c) { return a + c.w; }, 0) + GAP * (kids.length - 1);
      if (total <= limit || kids.length < 2) return nSeq(kids);
      var rows = [], row = [], rw = 0, room = limit - 40;
      kids.forEach(function (c) {
        var add = c.w + (row.length ? GAP : 0);
        if (row.length && rw + add > room) { rows.push(nSeq(row)); row = []; rw = 0; add = c.w; }
        row.push(c); rw += add;
      });
      if (row.length) rows.push(nSeq(row));
      return rows.length > 1 ? nStack(rows) : rows[0];
    }
    case 'choice': {
      var its = ast.items;
      if (its.length >= 12 && its.every(function (c) { return c.t === 'term'; }))
        return nEnum(its.map(function (c) { return c.v; }), Math.min(limit - 80, 640));
      return nChoice(its.map(function (c) { return build(c, limit - 60); }));
    }
    case 'opt': {
      var inner = ast.item;
      if (inner.t === 'seq' && !inner.items.length) return nSeq([]);
      var alts = inner.t === 'choice' && !(inner.items.length >= 12) ? inner.items : [inner];
      return nChoice([nSkip()].concat(alts.map(function (c) { return build(c, limit - 60); })));
    }
    case 'plus': return nLoop(build(ast.item, limit - 60));
    case 'star': return nChoice([nSkip(), nLoop(build(ast.item, limit - 60))]);
  }
  return nSeq([]);
}

function renderSVG(ast, limit) {
  var node = build(ast, limit), pad = 14, lead = 22;
  var W = node.w + 2 * (pad + lead), H = node.up + node.down + 2 * pad, y = pad + node.up, x = pad + lead;
  var d = hline(pad, x, y) + node.path(x, y) + hline(x + node.w, W - pad, y);
  return { w: W, h: H, svg:
    '<svg xmlns="http://www.w3.org/2000/svg" class="rr" viewBox="0 0 ' + f(W) + ' ' + f(H) + '" width="' + f(W) + '" height="' + f(H) + '">' +
    '<path class="rr-line" d="' + d + '"/>' +
    '<circle class="rr-dot" cx="' + (pad + 3) + '" cy="' + f(y) + '" r="3.5"/>' +
    '<path class="rr-end" d="M' + f(W - pad) + ' ' + f(y - 7) + 'v14"/>' +
    node.draw(x, y) + '</svg>' };
}

/* ===== EBNF export (W3C-style, usable with railroad generators) ===== */
function ident(s) { return s.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1'); }
function lit(v) { return v.indexOf('"') >= 0 ? "'" + v.replace(/'/g, '') + "'" : '"' + v.replace(/\\/g, '\\\\') + '"'; }
function toEBNF(n) {
  function grp(c) { return c.t === 'seq' && c.items.length > 1 ? '(' + toEBNF(c) + ')' : toEBNF(c); }
  switch (n.t) {
    case 'term': return n.raw ? n.v : lit(n.v);
    case 'cls': return n.v;
    case 'except': return '(' + toEBNF(n.a) + ' - ' + toEBNF(n.b) + ')';
    case 'not': return '/* not */ ' + toEBNF(n.item);
    case 'rep': {
      var base = grp(n.item), rn = n.min, rx = n.max, rpt = function (b, k) { return k <= 0 ? '' : new Array(k + 1).join(b + ' ').trim(); };
      if (rx === Infinity) return rn === 0 ? base + '*' : rn === 1 ? base + '+' : rpt(base, rn - 1) + ' ' + base + '+';
      if (rn === rx) return rn === 0 ? '""' : rpt(base, rn);
      return (rpt(base, rn) + ' ' + new Array(rx - rn + 1).join(base + '? ')).trim();
    }
    case 'nt': return ident(n.v);
    case 'prose': return '[#x21-#x7E]+';
    case 'seq': return n.items.length ? n.items.map(function (c) { return c.t === 'choice' ? toEBNF(c) : toEBNF(c); }).join(' ') : '""';
    case 'choice': return '(' + n.items.map(toEBNF).join(' | ') + ')';
    case 'opt': return n.item.t === 'seq' && !n.item.items.length ? '""' : grp(n.item) + '?';
    case 'star': return grp(n.item) + '*';
    case 'plus': return grp(n.item) + '+';
  }
  return '""';
}
function docToEBNF(doc) {
  var out = ['/* Converted to W3C EBNF from ' + ({ ebnf: 'EBNF', abnf: 'ABNF', informal: 'informal usage syntax' }[doc.dialect] || 'source') + '. */', ''];
  doc.ruleOrder.forEach(function (name) {
    var seen = {}, alts = [];
    doc.rules[name].forEach(function (d) {
      var e = toEBNF(d.ast), key = e;
      if (!seen[key]) { seen[key] = 1; alts.push(e); }
    });
    out.push(ident(name) + ' ::= ' + (alts.length === 1 ? alts[0] : alts.map(function (a) { return '(' + a + ')'; }).join(' | ')));
  });
  if (doc.commands.length) out.push('', '/* commands */');
  var names = [];
  doc.commands.forEach(function (c) {
    var nm = 'cmd_' + (c.id + 1);
    names.push(nm);
    out.push('/* ' + c.label.replace(/\*\//g, '') + ' */');
    out.push(nm + ' ::= ' + toEBNF(c.ast));
  });
  if (names.length) out.push('', (doc.prefix || 'gam') + '_command ::= ' + names.join(' | '));
  if (doc.issues.undef.length) {
    out.push('', '/* referenced but never defined in the source: stubbed so the grammar compiles */');
    doc.issues.undef.forEach(function (u) { out.push(ident(u.name) + ' ::= [#x21-#x7E]+'); });
  }
  return out.join('\n');
}


/* ===== command explorer: which words can come next? ===== */
var NO_EXPAND = { String: 1, Number: 1, Float: 1, Digit: 1, Character: 1, Hex: 1, Space: 1 };
function isProse(ast) { return ast.t === 'seq' && ast.items.length >= 3 && ast.items.every(function (x) { return x.t === 'term'; }); }

function exploreOne(ast, rules, verbs, full, pre, budget) {
  var out = { next: {}, done: false, alive: false, over: false }, steps = 0, P = pre.toLowerCase();
  function note(text, kind, via) { if (!out.next[text]) out.next[text] = { kind: kind, via: via }; out.alive = true; }
  function m(n, i, stack, k) {
    if (++steps > budget) { out.over = true; return; }
    switch (n.t) {
      case 'term':
        if (i < full.length) { if (full[i].toLowerCase() === n.v.toLowerCase()) k(i + 1); }
        else if (i === full.length && n.v.toLowerCase().indexOf(P) === 0) note(n.v, 'kw', stack[stack.length - 1]);
        return;
      case 'nt': {
        var defs = rules[n.v];
        if (i === full.length) note('<' + n.v + '>', 'val');
        else if (!(i === 1 && verbs[full[i].toLowerCase()])) k(i + 1); // any single word may stand in for a value
        if (defs && stack.length < 3 && stack.indexOf(n.v) < 0 && !NO_EXPAND[n.v]) {
          var ns = stack.concat([n.v]);
          for (var d = 0; d < defs.length; d++) if (!isProse(defs[d].ast) && defs[d].ast.t !== 'prose') m(defs[d].ast, i, ns, k);
        }
        return;
      }
      case 'seq':
        (function go(idx, j) {
          if (idx === n.items.length) return k(j);
          m(n.items[idx], j, stack, function (j2) { go(idx + 1, j2); });
        })(0, i);
        return;
      case 'choice': n.items.forEach(function (c) { m(c, i, stack, k); }); return;
      case 'opt': m(n.item, i, stack, k); k(i); return;
      case 'star': (function loop(j) { k(j); m(n.item, j, stack, function (j2) { if (j2 > j) loop(j2); }); })(i); return;
      case 'plus': m(n.item, i, stack, function (j) { m({ t: 'star', item: n.item }, j, stack, k); }); return;
    }
  }
  m(ast, 0, [], function (j) { if (j === full.length && pre === '') { out.done = true; out.alive = true; } });
  return out;
}

function explore(doc, text) {
  var trail = /\s$/.test(text), parts = text.trim().split(/\s+/).filter(Boolean), pre = '', full = parts;
  if (!trail && parts.length) { pre = parts[parts.length - 1]; full = parts.slice(0, -1); }
  var PF = doc.prefix || 'gam';
  if ((full.length === 0 && pre && PF.indexOf(pre.toLowerCase()) !== 0) || (full.length > 0 && full[0].toLowerCase() !== PF)) full = [PF].concat(full);
  if (!doc._verbs) {
    var vb = {};
    doc.commands.forEach(function (c) {
      var it = c.ast.t === 'seq' ? c.ast.items[1] : null;
      if (!it) return;
      if (it.t === 'term') vb[it.v.toLowerCase()] = 1;
      else if (it.t === 'choice') it.items.forEach(function (x) { if (x.t === 'term') vb[x.v.toLowerCase()] = 1; });
    });
    doc._verbs = vb;
  }
  var counts = {}, matches = [], over = false;
  doc.commands.forEach(function (c) {
    var last = c.ast.t === 'seq' ? c.ast.items[c.ast.items.length - 1] : null;
    if (last && last.t === 'term' && last.v === '...') return; // documentation placeholder, matches anything
    var r = exploreOne(c.ast, doc.rules, doc._verbs, full, pre, 6000);
    if (r.over) over = true;
    if (!r.alive) return;
    matches.push({ id: c.id, done: r.done });
    Object.keys(r.next).forEach(function (t) {
      var e = counts[t] || (counts[t] = { text: t, kind: r.next[t].kind, count: 0 });
      e.count++;
    });
  });
  var next = Object.keys(counts).map(function (t) { return counts[t]; })
    .filter(function (e) { return e.kind === 'val' || /[A-Za-z0-9]/.test(e.text); })
    .sort(function (a, b) { return (a.kind === b.kind ? 0 : a.kind === 'kw' ? -1 : 1) || b.count - a.count || (a.text < b.text ? -1 : 1); });
  return { full: full, pre: pre, next: next, matches: matches, over: over };
}

if (typeof module !== 'undefined') module.exports = { detectDialect: detectDialect, parseDoc: parseDoc, parseExpr: parseExpr, tokenize: tokenize, renderSVG: renderSVG, docToEBNF: docToEBNF, explore: explore, build: build };
