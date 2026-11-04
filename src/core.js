/* ===== GAM BNF core: tokenizer, parser, railroad layout, EBNF export ===== */
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
}

function cleanLine(ln) {
  // drop trailing "# comment" but keep hex colours such as #1c4587
  return ln.replace(/\s+#(?![0-9a-fA-F]{6}(?:\||\s|$)).*$/, '');
}

function cmdLabel(ast, text) {
  var items = ast.t === 'seq' ? ast.items : [ast], out = [];
  for (var i = 0; i < items.length && out.length < 7; i++) {
    var c = items[i];
    if (c.t === 'term') out.push(c.v);
    else if (c.t === 'choice' && c.items.every(function (x) { return x.t === 'term'; })) out.push(c.items.map(function (x) { return x.v; }).join('|'));
    else if (c.t === 'nt' && i > 0 && i < 4) out.push('<' + c.v + '>');
    else break;
  }
  return out.join(' ') || text.slice(0, 40);
}

function parseDoc(text) {
  var lines = text.replace(/\r/g, '').split('\n');
  var rules = {}, ruleOrder = [], commands = [], issues = { warnings: [] };
  var section = '', sub = '', cur = null;

  function flush() {
    if (!cur) return;
    var body = cur.lines.join('\n').trim();
    var warns = [];
    var ast = parseExpr(body, function (w) { warns.push(w); });
    if (cur.kind === 'rule') {
      if (!rules[cur.name]) { rules[cur.name] = []; ruleOrder.push(cur.name); }
      rules[cur.name].push({ ast: ast, text: body, section: cur.section, sub: cur.sub, line: cur.line });
      warns.forEach(function (w) { issues.warnings.push({ kind: 'rule', name: cur.name, msg: w }); });
    } else {
      var id = commands.length;
      commands.push({ id: id, label: cmdLabel(ast, body), text: body, ast: ast, section: cur.section, line: cur.line, warns: warns });
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
      cur = { kind: 'rule', name: m[1].trim(), lines: [cleanLine(m[2])], section: section, sub: sub, line: li + 1 };
      continue;
    }
    if (/^(gam|stam)(\s|$)/.test(ln)) {
      flush();
      cur = { kind: 'cmd', lines: [cleanLine(ln)], section: section, line: li + 1 };
      continue;
    }
    if (/^\s+\S/.test(ln)) {
      if (cur && !/^\s*(See:|Must match|Maximum of)/.test(ln)) cur.lines.push(cleanLine(ln));
      continue;
    }
    flush(); // unindented prose
  }
  flush();

  var refs = {}, dups = [];
  function note(name, where) { (refs[name] = refs[name] || []).push(where); }
  ruleOrder.forEach(function (name) {
    rules[name].forEach(function (d) { walkNT(d.ast, function (v) { note(v, { kind: 'rule', name: name }); }); });
    var uniq = {};
    rules[name].forEach(function (d) { uniq[d.text.replace(/\s+/g, ' ')] = 1; });
    if (rules[name].length > 1) dups.push({ name: name, count: rules[name].length, identical: Object.keys(uniq).length === 1 });
  });
  commands.forEach(function (c) { walkNT(c.ast, function (v) { note(v, { kind: 'cmd', id: c.id }); }); });
  var undef = Object.keys(refs).filter(function (v) { return !rules[v]; })
    .map(function (v) { return { name: v, uses: refs[v] }; })
    .sort(function (a, b) { return b.uses.length - a.uses.length; });
  issues.undef = undef; issues.dups = dups;
  return { rules: rules, ruleOrder: ruleOrder, commands: commands, issues: issues };
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

function nLoop(item) {
  var w = item.w + 40, ret = item.down + 18;
  return { w: w, up: item.up, down: ret,
    path: function (x, y) {
      var ry = y + ret;
      return hline(x, x + 20, y) + hline(x + 20 + item.w, x + w, y) + item.path(x + 20, y) +
        'M' + f(x + 10) + ' ' + f(y) + 'a' + R + ' ' + R + ' 0 0 0 -' + R + ' ' + R + 'V' + f(ry - R) +
        'a' + R + ' ' + R + ' 0 0 0 ' + R + ' ' + R + 'H' + f(x + w - R) +
        'a' + R + ' ' + R + ' 0 0 0 ' + R + ' -' + R + 'V' + f(y + R) + 'a' + R + ' ' + R + ' 0 0 0 -' + R + ' -' + R;
    },
    draw: function (x, y) { return item.draw(x + 20, y); } };
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

function build(ast, limit) {
  limit = Math.max(limit, 240);
  switch (ast.t) {
    case 'term': return nTerm(ast.v);
    case 'nt': return nNT(ast.v);
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
    case 'term': return lit(n.v);
    case 'nt': return ident(n.v);
    case 'seq': return n.items.length ? n.items.map(function (c) { return c.t === 'choice' ? toEBNF(c) : toEBNF(c); }).join(' ') : '""';
    case 'choice': return '(' + n.items.map(toEBNF).join(' | ') + ')';
    case 'opt': return n.item.t === 'seq' && !n.item.items.length ? '""' : grp(n.item) + '?';
    case 'star': return grp(n.item) + '*';
    case 'plus': return grp(n.item) + '+';
  }
  return '""';
}
function docToEBNF(doc) {
  var out = ['/* Cleaned from the GAM syntax document. W3C EBNF. */', ''];
  doc.ruleOrder.forEach(function (name) {
    var seen = {}, alts = [];
    doc.rules[name].forEach(function (d) {
      var e = toEBNF(d.ast), key = e;
      if (!seen[key]) { seen[key] = 1; alts.push(e); }
    });
    out.push(ident(name) + ' ::= ' + (alts.length === 1 ? alts[0] : alts.map(function (a) { return '(' + a + ')'; }).join(' | ')));
  });
  out.push('', '/* commands */');
  var names = [];
  doc.commands.forEach(function (c) {
    var nm = 'cmd_' + (c.id + 1);
    names.push(nm);
    out.push('/* ' + c.label.replace(/\*\//g, '') + ' */');
    out.push(nm + ' ::= ' + toEBNF(c.ast));
  });
  out.push('', 'gam_command ::= ' + (names.join(' | ') || '""'));
  if (doc.issues.undef.length) {
    out.push('', '/* referenced but never defined in the source: stubbed so the grammar compiles */');
    doc.issues.undef.forEach(function (u) { out.push(ident(u.name) + ' ::= [#x21-#x7E]+'); });
  }
  return out.join('\n');
}

if (typeof module !== 'undefined') module.exports = { parseDoc: parseDoc, parseExpr: parseExpr, tokenize: tokenize, renderSVG: renderSVG, docToEBNF: docToEBNF, build: build };
