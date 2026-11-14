// 检查案件数据：node detective/check.js
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/cases.js', 'utf8');
const CASES = new Function(src + ';return CASES;')();
const plain = t => t.replace(/[\[{]([^\]|}]+)(\|[^\]}]+)?[\]}]/g, '$1');
let bad = 0;
const err = (c, m) => { bad++; console.log('✗', c.id, m); };
const learned = new Set();
for (const c of CASES) {
  const all = c.docs.map(d => d.text).join(' ');
  const n = plain(all).split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w)).length;
  if (n < 80 || n > 200) err(c, '字数 ' + n);
  const keys = new Set(c.words.map(w => w.k));
  const used = new Set();
  for (const m of all.matchAll(/\[([^\]|]+)(?:\|([^\]]+))?\]/g)) { const k = m[2] || m[1]; used.add(k); if (!keys.has(k)) err(c, '未定义生词 ' + k); }
  for (const k of keys) if (!used.has(k)) err(c, '生词没出现 ' + k);
  for (const m of all.matchAll(/\{([^}|]+)(?:\|([^}]+))?\}/g)) { const k = m[2] || m[1]; if (!learned.has(k)) err(c, '老朋友还没学过 ' + k); }
  if (c.words.length < 5 || c.words.length > 8) err(c, '生词数 ' + c.words.length);
  for (const s of c.steps) {
    if (s.type === 'pick') for (const a of [].concat(s.ans)) if (!plain(all).includes(a)) err(c, '找不到句子 ' + a);
    if (s.type === 'choice' && !(s.a >= 0 && s.a < s.opts.length)) err(c, '答案下标');
  }
  c.words.forEach(w => learned.add(w.k));
  console.log(c.id.padEnd(11), c.lv, n + ' 词', c.words.length + ' 生词');
}
if (bad) { console.log(bad + ' 个问题'); process.exit(1); } else console.log('全部通过');
