// 词库构建脚本：读 words/*.txt，生成 data.js（单词、连线、星座、主题、整张星空的布局坐标）。
// 用法：node tools/build.js
// 源文件格式见 words/README.md：每行 单词|级别|音标|中文|例句|关系
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "words");

const TYPES = {
  sound: { name: "读音", ask: "读音相同或相近" },
  form:  { name: "字形", ask: "拼写相近、容易看错" },
  syn:   { name: "近义", ask: "意思相近" },
  ant:   { name: "反义", ask: "意思相反" },
  root:  { name: "同词根", ask: "来自同一个词根（是一家人）" },
  coll:  { name: "搭配", ask: "常常搭配在一起用" },
  topic: { name: "同主题", ask: "属于同一个小话题" },
  hyper: { name: "上下位", ask: "是“一种……”或“一部分”的关系" }
};
const STRONG = ["sound","form","ant","syn","root","coll","hyper"];

// ---------- 读源文件 ----------
const words = {}, order = [], galaxies = [], errors = [], warns = [];
const files = fs.readdirSync(SRC).filter(f => /^\d+.*\.txt$/.test(f)).sort();
for (const f of files){
  const lines = fs.readFileSync(path.join(SRC, f), "utf8").split(/\r?\n/);
  let gal = null, sub = null;
  lines.forEach((ln, no) => {
    const where = `${f}:${no+1}`;
    if (!ln.trim() || ln.startsWith("//")) return;
    if (ln.startsWith("# ")){ const [name, id] = ln.slice(2).split("|").map(s => s.trim()); gal = galaxies.find(g => g.id === id); if (!gal){ gal = {name, id, words:[], subs:[]}; galaxies.push(gal); } sub = null; return; }
    if (ln.startsWith("## ")){ const nm = ln.slice(3).trim(); sub = gal.subs.find(x => x.name === nm); if (!sub){ sub = {name: nm, words:[]}; gal.subs.push(sub); } return; }
    const p = ln.split("|");
    if (p.length < 5){ errors.push(`${where} 字段不足：${ln}`); return; }
    const [w, lv, ipa, cn, ex, rel=""] = p.map(s => s.trim());
    if (!/^[A-Za-z][A-Za-z' -]*$/.test(w)){ errors.push(`${where} 单词格式不对：${w}`); return; }
    if (words[w]){ errors.push(`${where} 重复：${w}（已在 ${words[w].where}）`); return; }
    if (!["A2","B1","B2"].includes(lv)) errors.push(`${where} 级别应为 A2/B1/B2：${w}`);
    const re = new RegExp(`\\b${w.replace(/[-']/g, m => "\\" + m)}\\b`, "i");
    if (!re.test(ex)) errors.push(`${where} 例句没有原词 ${w}：${ex}`);
    if (!sub){ sub = {name: gal.name, words:[]}; gal.subs.push(sub); }
    words[w] = { w, lv, ipa, cn, ex, rel, gal: galaxies.indexOf(gal), sub: sub.name, where };
    order.push(w); gal.words.push(w); sub.words.push(w);
  });
}

// ---------- 连线 ----------
const edges = [], seen = new Map();
const first = cn => cn.split(/[；;，,]/)[0].replace(/（[^）]*）/g, "").trim();
function add(a, b, t, note){
  if (a === b || !words[a] || !words[b]) return false;
  const k = [a,b].sort().join("|");
  if (seen.has(k)) return false;
  seen.set(k, t); edges.push([a, b, t, note]); return true;
}
const deg = w => edges.filter(e => e[0] === w || e[1] === w).length;

// 1) 源文件里手写的关系
const FUNC = new Set("a an the of to in on at for with and or but my your his her its our their be is are am was were do does did have has had it this that these those some any one".split(" "));
for (const w of order){
  const d = words[w];
  for (const part of d.rel.split(";").map(s => s.trim()).filter(Boolean)){
    const m = part.match(/^(\w+):(.*)$/); if (!m){ errors.push(`${d.where} 关系格式不对：${part}`); continue; }
    const [, t, rest] = m;
    if (t === "coll"){
      for (const phrase of rest.split(",").map(s => s.trim()).filter(Boolean)){
        if (!new RegExp(`\\b${w}`, "i").test(phrase)) warns.push(`${d.where} 搭配里没有 ${w}：${phrase}`);
        const others = phrase.toLowerCase().split(/[^a-z'-]+/).filter(x => x && x !== w && !FUNC.has(x) && words[x]);
        if (!others.length){ warns.push(`${d.where} 搭配找不到词库里的另一个词：${phrase}`); continue; }
        others.slice(0, 1).forEach(o => add(w, o, "coll", `常见搭配：${phrase}。`));
      }
      continue;
    }
    if (!TYPES[t]){ errors.push(`${d.where} 未知关系 ${t}`); continue; }
    for (const o of rest.split(",").map(s => s.trim()).filter(Boolean)){
      if (!words[o]){ warns.push(`${d.where} ${t} 指向词库外的词：${o}`); continue; }
      const A = words[w], B = words[o];
      const note = t === "syn" ? `${w}（${first(A.cn)}）和 ${o}（${first(B.cn)}）意思相近。`
        : t === "ant" ? `${w} ${first(A.cn)} ↔ ${o} ${first(B.cn)}。`
        : t === "hyper" ? `${w}（${first(A.cn)}）是一种 ${o}（${first(B.cn)}）。`
        : t === "sound" ? `${w} /${A.ipa}/ 和 ${o} /${B.ipa}/ 读音很像。`
        : t === "form" ? `${w} 和 ${o} 拼写很像，容易看错。`
        : t === "root" ? `${w} 和 ${o} 来自同一个词根。`
        : `${w} 和 ${o} 有关。`;
      add(w, o, t, note);
    }
  }
}
// 2) 同音：音标完全相同
const byIpa = {};
order.forEach(w => { const k = words[w].ipa.replace(/[ˈˌ]/g, ""); (byIpa[k] = byIpa[k] || []).push(w); });
Object.entries(byIpa).forEach(([k, ws]) => { for (let i = 0; i < ws.length; i++) for (let j = i+1; j < ws.length; j++)
  add(ws[i], ws[j], "sound", `${ws[i]} 和 ${ws[j]} 读音相同，都读 /${words[ws[i]].ipa}/。`); });
// 3) 同词根：后缀、前缀
const SUF = [["er","做……的人/东西"],["or","做……的人"],["ful","充满……的"],["less","没有……的"],["ly","……地"],["ness","名词后缀"],["ment","名词后缀"],["tion","名词后缀"],["ion","名词后缀"],["ation","名词后缀"],["able","能被……的"],["ible","能被……的"],["al","形容词后缀"],["y","形容词后缀"],["ous","形容词后缀"],["ive","形容词后缀"],["ing","名词/形容词"],["ed","形容词"],["ist","……的人"],["ity","名词后缀"],["ence","名词后缀"],["ance","名词后缀"],["ent","形容词后缀"],["ant","形容词后缀"],["ise","动词后缀"],["ize","动词后缀"],["en","动词后缀"],["ish","形容词后缀"],["hood","名词后缀"],["ship","名词后缀"],["th","名词后缀"]];
const SUF2 = [["ic","形容词后缀"],["ical","形容词后缀"],["ure","名词后缀"],["ary","名词/形容词后缀"],["ery","名词后缀"],["ee","被……的人"],["ian","……的人"],["ism","名词后缀"],["ify","动词后缀"],["ward","向……"],["wards","向……"],["some","形容词后缀"],["age","名词后缀"],["ant","……的人"],["est","最……"],["ier","更……"],["iest","最……"]];
const PRE = [["un","不、相反"],["dis","不、相反"],["re","再、重新"],["im","不"],["in","不"],["ir","不"],["il","不"],["mis","错误地"],["over","过度"],["under","不足"]];
const PRE2 = [["non","非"],["pre","预先"],["inter","相互"],["anti","反对"],["sub","下、次"],["super","超级"],["co","共同"],["de","去除"],["ex","前任、向外"],["out","超过、向外"],["up","向上"],["bi","两个"],["multi","多"],["tele","远"],["trans","跨越"],["self","自己"],["en","使"],["be","使"]];
const CNSTOP = new Set([..."的地得了着一不是有人子者在和与把被个"]);
const NOAFFIX = new Set("truant important secretary devote remember story bitter petal letter butter liver final seal seed seize factor tooth relay comment income overcome legal policy porter reporter portion caption muggy former sandal tailor retail party invoice liable evening invest feed ponder tidy organise intuition install kitten rubbish reliable overcast".split(" "));
const cnShare = (a, b) => { if (NOAFFIX.has(b)) return false; const A = new Set([...words[a].cn].filter(c => /[\u4e00-\u9fff]/.test(c) && !CNSTOP.has(c))); return [...words[b].cn].some(c => A.has(c)); };
// 词缀只是拼写碰巧对上（man/many、ear/early）不算：要么中文释义有相同的字，要么派生词的读音里包含原词的读音
const ipaBare = w => words[w].ipa.replace(/[ˈˌ]/g, "");
const affixOk = (b, d) => !NOAFFIX.has(d) && (cnShare(b, d) || ipaBare(d).includes(ipaBare(b)));
function stems(base){ const s = [base]; if (base.endsWith("e")) s.push(base.slice(0,-1)); if (base.endsWith("y")) s.push(base.slice(0,-1) + "i");
  if (/[^aeiou][aeiou][bdgmnprt]$/.test(base)) s.push(base + base.slice(-1)); return s; }
for (const b of order){ if (b.length < 3) continue;
  for (const [suf, mean] of SUF) for (const st of stems(b)){ const d = st + suf; if (d !== b && words[d] && affixOk(b, d)) add(b, d, "root", `${b} + -${suf}（${mean}）= ${d}（${first(words[d].cn)}）。`); }
  for (const [pre, mean] of PRE){ const d = pre + b; if (words[d] && affixOk(b, d)) add(b, d, "root", `${pre}-（${mean}）+ ${b} = ${d}（${first(words[d].cn)}）。`); }
  // 新加的词缀容易碰上巧合（man/manage），要求中文释义里有相同的字
  for (const [suf, mean] of SUF2) for (const st of stems(b)){ const d = st + suf; if (d !== b && words[d] && cnShare(b, d)) add(b, d, "root", `${b} + -${suf}（${mean}）= ${d}（${first(words[d].cn)}）。`); }
  for (const [pre, mean] of PRE2){ const d = pre + b; if (words[d] && cnShare(b, d)) add(b, d, "root", `${pre}-（${mean}）+ ${b} = ${d}（${first(words[d].cn)}）。`); } }
// 4) 字形：编辑距离 1、字母换位、同字母异序（长度 ≥ 4），每个词最多 3 条
function formNote(a, b){
  if (a.length === b.length){
    const diff = [...a].map((c,i) => c !== b[i] ? i : -1).filter(i => i >= 0);
    if (diff.length === 1) return `只差一个字母：${a} 的 ${a[diff[0]]} 换成 ${b[diff[0]]} 就是 ${b}。`;
    if (diff.length === 2 && diff[1] === diff[0]+1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]) return `字母一样，只是 ${a.slice(diff[0],diff[0]+2)} 换了顺序：${a} 和 ${b}。`;
    return `${a} 和 ${b} 的字母完全一样，只是顺序不同。`;
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  for (let i = 0; i < l.length; i++) if (l.slice(0,i) + l.slice(i+1) === s) return `${l} 比 ${s} 多一个 ${l[i]}，别看错。`;
  return `${a} 和 ${b} 拼写很像。`;
}
function close(a, b){
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length){ const diff = [...a].map((c,i) => c !== b[i] ? i : -1).filter(i => i >= 0);
    if (diff.length === 1) return true;
    if (diff.length === 2 && diff[1] === diff[0]+1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]) return true;
    return a.length >= 5 && [...a].sort().join("") === [...b].sort().join(""); }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  for (let i = 0; i < l.length; i++) if (l.slice(0,i) + l.slice(i+1) === s) return true; return false;
}
const formCnt = {};
const cands = [];
for (let i = 0; i < order.length; i++) for (let j = i+1; j < order.length; j++){ const a = order[i], b = order[j];
  if (Math.min(a.length, b.length) < 4) continue;
  if (seen.has([a,b].sort().join("|"))) continue;
  if (b.startsWith(a) || a.startsWith(b)) continue;      // 加后缀的已经算作同词根
  if (close(a, b)) cands.push([a, b]); }
cands.sort((x, y) => (words[x[0]].gal === words[x[1]].gal ? 0 : 1) - (words[y[0]].gal === words[y[1]].gal ? 0 : 1));
for (const [a, b] of cands){ if ((formCnt[a]||0) >= 4 || (formCnt[b]||0) >= 4) continue;
  if (add(a, b, "form", formNote(a, b))){ formCnt[a] = (formCnt[a]||0) + 1; formCnt[b] = (formCnt[b]||0) + 1; } }
// 4b) 同义：第一个中文释义完全相同的词（每组最多 6 个）
const byCn = {};
order.forEach(w => { const k = first(words[w].cn); if (k.length >= 2) (byCn[k] = byCn[k] || []).push(w); });
Object.entries(byCn).forEach(([k, ws]) => { if (ws.length < 2 || ws.length > 6) return;
  for (let i = 0; i < ws.length; i++) for (let j = i+1; j < ws.length; j++)
    add(ws[i], ws[j], "syn", `${ws[i]} 和 ${ws[j]} 都有“${k}”的意思。`); });
// 4c) 合成词、短语：football = foot + ball；break the ice 里有 break、ice
const isWord = x => words[x] && !FUNC.has(x) && x.length >= 3 && !x.includes(" ");
for (const w of order){
  if (/^[a-z]{6,}$/.test(w)) for (let i = 3; i <= w.length - 3; i++){ const a = w.slice(0, i), b = w.slice(i);
    const ip = x => words[x].ipa.replace(/[ˈˌ]/g, "");
    if (isWord(a) && isWord(b) && ip(w).includes(ip(a)) && ip(w).includes(ip(b))){ add(w, a, "root", `${w} = ${a} + ${b}（合成词）。`); add(w, b, "root", `${w} = ${a} + ${b}（合成词）。`); break; } }
  if (/[ -]/.test(w)) w.toLowerCase().split(/[ -]+/).filter(isWord).slice(0, 2).forEach(o => add(w, o, "coll", `短语 ${w} 里用到了 ${o}。`));
}
// 4d) 例句里的搭配：例句中紧挨着本词的实词（跳过冠词、物主代词等），每个词最多 3 条，常用词最多被连 8 次
const GENERIC = new Set("i you he she we they me him us them not no yes so too very really there here what when where who why how which if than then just also all every each can could will would shall should may might must lot lots much many more most get got go went come came say said tell told whose which whom someone something anyone anything everyone everything nobody nothing".split(" "));
const lemma = t => { if (words[t]) return t;
  for (const [s, r] of [["ies","y"],["ied","y"],["es",""],["s",""],["ed",""],["ed","e"],["d",""],["ing",""],["ing","e"]])
    if (t.endsWith(s)){ let b = t.slice(0, -s.length) + r; if (words[b]) return b; if (r === "" && /(.)\1$/.test(b) && words[b.slice(0, -1)]) return b.slice(0, -1); }
  return null; };
const SKIP = new Set("a an the my your his her its our their this that these those some any".split(" "));
const collIn = {}, collOut = {};
for (const w of order){ if (w.includes(" ") || GENERIC.has(w) || FUNC.has(w)) continue;
  const toks = words[w].ex.toLowerCase().replace(/[^a-z' -]/g, " ").split(/\s+/).filter(Boolean);
  const at = toks.findIndex(t => t === w || lemma(t) === w); if (at < 0) continue;
  const near = [];
  for (const dir of [1, -1]){ let k = at + dir; const skipped = [];
    while (k >= 0 && k < toks.length && SKIP.has(toks[k])){ skipped.push(toks[k]); k += dir; }
    if (k < 0 || k >= toks.length || skipped.length > 1) continue;
    const o = lemma(toks[k]); if (!o || o === w || FUNC.has(o) || GENERIC.has(o) || o.length < 3) continue;
    const lo = Math.min(at, k), hi = Math.max(at, k);
    near.push([o, toks.slice(lo, hi + 1).join(" ")]); }
  for (const [o, ph] of near){ if ((collOut[w]||0) >= 3 || (collIn[o]||0) >= 12) continue;
    if (add(w, o, "coll", `例句搭配：“${ph}”——${words[w].ex}`)){ collOut[w] = (collOut[w]||0) + 1; collIn[o] = (collIn[o]||0) + 1; } }
}
// 4f) 手写的额外关系表 words/links.txt：反义、近义、上下位、搭配
{ let sec = null; const LS = new Set("a an the of to your my his her our their in on at for by with".split(" ")); let used = 0, skipped = 0;
  const lines = fs.readdirSync(SRC).filter(f => /^links.*\.txt$/.test(f)).sort().flatMap(f => fs.readFileSync(path.join(SRC, f), "utf8").split(/\r?\n/));
  for (const ln of lines){
    if (!ln.trim() || ln.startsWith("//")) continue;
    if (ln.startsWith("## ")){ sec = ln.slice(3).trim(); continue; }
    for (const item of ln.split(";").map(x => x.trim()).filter(Boolean)){
      if (sec === "coll"){
        if (words[item] || words[item.toLowerCase()]){ skipped++; continue; }
        const toks = item.split(/\s+/).filter(t => !LS.has(t.toLowerCase()));
        const ws = toks.map(t => words[t] ? t : lemma(t.toLowerCase())).filter(x => x && x.length >= 2);
        if (ws.length < 2 || ws[0] === ws[ws.length-1]){ skipped++; continue; }
        if (add(ws[0], ws[ws.length-1], "coll", `常见搭配：${item}。`)) used++; else skipped++;
        continue; }
      const [a, b] = item.split(/\s+/);
      if (!words[a] || !words[b]){ skipped++; continue; }
      const A = words[a], B = words[b];
      const note = sec === "syn" ? `${a}（${first(A.cn)}）和 ${b}（${first(B.cn)}）意思相近。`
        : sec === "ant" ? `${a} ${first(A.cn)} ↔ ${b} ${first(B.cn)}。`
        : sec === "part" ? `${a}（${first(A.cn)}）是 ${b}（${first(B.cn)}）的一部分。`
        : `${a}（${first(A.cn)}）是一种 ${b}（${first(B.cn)}）。`;
      if (add(a, b, sec === "part" ? "hyper" : sec, note)) used++; else skipped++; } }
  console.log(`关系表：用上 ${used} 条，跳过 ${skipped} 条（词库外或已有）`); }
// 4e) 押韵：一到两个音节的词，从最后一个元音起读音相同（每个词最多 2 条，同星系优先）
const VOW = /(eɪ|aɪ|ɔɪ|əʊ|aʊ|ɪə|eə|ʊə|iː|uː|ɑː|ɔː|ɜː|[iɪeæʌɒʊuəɑɔ])/g;
const rhymeKey = ipa => { const s = ipa.replace(/[ˌ.()]/g, "").replace(/\s.*$/, ""); const m = [...s.matchAll(VOW)];
  if (!m.length || m.length > 2) return null; const last = m[m.length - 1]; if (last[0] === "ə" && m.length > 1) return null;
  if (m.length === 2){ const st = s.indexOf("ˈ"); if (st <= m[0].index || st > last.index) return null; }
  return s.slice(last.index).replace(/ˈ/g, ""); };
const byRhyme = {};
order.forEach(w => { if (!/^[a-z]{3,}$/.test(w)) return; const k = rhymeKey(words[w].ipa); if (k && k.length >= 2) (byRhyme[k] = byRhyme[k] || []).push(w); });
const rhCnt = {}; const rc = [];
Object.entries(byRhyme).forEach(([k, ws]) => { for (let i = 0; i < ws.length; i++) for (let j = i+1; j < ws.length; j++){ const a = ws[i], b = ws[j];
  if (a.endsWith(b) || b.endsWith(a)) continue; rc.push([a, b, k, (words[a].gal === words[b].gal ? 0 : 2) + (words[a].lv === words[b].lv ? 0 : 1) + ((a.length * 31 + b.charCodeAt(0) * 7 + b.length) % 97) / 100]); } });
rc.sort((x, y) => x[3] - y[3]);
for (const [a, b, k] of rc){ if ((rhCnt[a]||0) >= 3 || (rhCnt[b]||0) >= 3) continue;
  if (add(a, b, "sound", `${a} /${words[a].ipa}/ 和 ${b} /${words[b].ipa}/ 押韵，都以 /${k}/ 结尾。`)){ rhCnt[a] = (rhCnt[a]||0) + 1; rhCnt[b] = (rhCnt[b]||0) + 1; } }
// 5) 同主题：同一小话题里，给连线少于 2 条的词补上主题连线（按顺序连成链）
for (const g of galaxies) for (const s of g.subs){ const ws = s.words;
  for (let i = 0; i < ws.length; i++){ const w = ws[i]; if (deg(w) >= 4 && i) continue;
    const nb = ws[(i + 1) % ws.length]; if (ws.length > 1) add(w, nb, "topic", `${w} 和 ${nb} 都属于“${s.name}”这个话题。`); } }

// 5b) 星系内加密：每种词库组合下，每个词在自己星系里至少 MIN_IN 条连线
//   先用例句里一起出现的同星系实词（例句里有的就是真实的语境），再在同一小话题里补“同主题”连线
const MIN_IN = 4, FILL_CAP = 8;
const BANKS_D = [["A2","B1","B2"], ["A2","B1"], ["A2"], ["B1"]];
const inDeg = (w, lvs) => { let n = 0; for (const [a, b] of edges){ const o = a === w ? b : b === w ? a : null;
  if (o && words[o].gal === words[w].gal && lvs.includes(words[o].lv)) n++; } return n; };
const exToks = {}; order.forEach(w => { exToks[w] = [...new Set(words[w].ex.toLowerCase().replace(/[^a-z' -]/g, " ").split(/\s+/).map(t => words[t] ? t : lemma(t)).filter(o => o && o !== w && !FUNC.has(o) && !GENERIC.has(o) && !SKIP.has(o) && o.length >= 3))]; });
let dense = {ex: 0, topic: 0};
for (const lvs of BANKS_D){
  const inLv = w => lvs.includes(words[w].lv);
  const dg = {}; order.filter(inLv).forEach(w => dg[w] = inDeg(w, lvs));
  const link = (a, b, t, note) => { if (!add(a, b, t, note)) return false; dg[a]++; dg[b]++; return true; };
  // 例句共现：w 的例句里出现了同星系的 x，或 x 的例句里出现了 w
  for (const w of order){ if (!inLv(w) || dg[w] >= MIN_IN) continue;
    const cands = order.length && exToks[w].filter(x => inLv(x) && words[x].gal === words[w].gal && dg[x] < FILL_CAP).map(x => [x, w])
      .concat(order.filter(x => inLv(x) && x !== w && words[x].gal === words[w].gal && dg[x] < FILL_CAP && exToks[x].includes(w)).map(x => [x, x]));
    for (const [x, src] of cands){ if (dg[w] >= MIN_IN) break;
      if (link(w, x, "topic", `例句里一起出现：${words[src].ex}`)) dense.ex++; } }
  // 同小话题：按话题里的顺序，向两边找连线最少、还没连上的词
  for (const g of galaxies) for (const sub of g.subs){ const ws = sub.words.filter(inLv);
    for (let i = 0; i < ws.length; i++){ const w = ws[i];
      for (let d = 1; d < ws.length && dg[w] < MIN_IN; d++){
        for (const j of [i + d, i - d]){ if (dg[w] >= MIN_IN) break; if (j < 0 || j >= ws.length) continue; const x = ws[j];
          if (dg[x] >= FILL_CAP) continue;
          if (link(w, x, "topic", `${w} 和 ${x} 都属于“${sub.name}”这个话题。`)) dense.topic++; } } } }
}
console.log(`星系内加密：例句共现 ${dense.ex} 条，同小话题 ${dense.topic} 条`);

// 6) 保证每个星系内部连通：每种词库组合（KET、PET、KET+PET、KET+PET+FCE）都能从起点一路点亮整个星系
const BANKS = [["A2"], ["B1"], ["A2","B1"], ["A2","B1","B2"]];
for (const lvs of BANKS) for (const g of galaxies){
  const inLv = w => lvs.includes(words[w].lv);
  const gw = g.words.filter(inLv); if (gw.length < 2) continue;
  const set = new Set(gw), par = {}; gw.forEach(w => par[w] = w);
  const find = w => par[w] === w ? w : (par[w] = find(par[w]));
  const join = (a, b) => { par[find(a)] = find(b); };
  edges.forEach(([a,b]) => { if (set.has(a) && set.has(b)) join(a, b); });
  const subs = g.subs.map(s => ({name: s.name, words: s.words.filter(inLv)})).filter(s => s.words.length);
  for (const s of subs){ const ws = s.words;
    for (let i = 1; i < ws.length; i++){ const a = ws[i-1], b = ws[i];
      if (find(a) !== find(b) && add(a, b, "topic", `${a} 和 ${b} 都属于“${s.name}”这个话题。`)) join(a, b); } }
  for (let k = 1; k < subs.length; k++){ const A = subs[k-1], B = subs[k];
    const a = A.words.slice().sort((x, y) => deg(x) - deg(y))[0], b = B.words.slice().sort((x, y) => deg(x) - deg(y))[0];
    if (find(a) !== find(b) && add(a, b, "topic", `${a}（${A.name}）和 ${b}（${B.name}）都属于“${g.name}”。`)) join(a, b); }
  // 小话题名字一样的分块可能仍分开（比如两个文件各写了一段），最后按分块逐个接到最大的块上
  const roots = () => [...new Set(gw.map(find))];
  let rs = roots();
  while (rs.length > 1){ const big = gw.filter(w => find(w) === rs[0]), other = gw.filter(w => find(w) === rs[1]);
    const a = big.slice().sort((x, y) => deg(x) - deg(y))[0], b = other.slice().sort((x, y) => deg(x) - deg(y))[0];
    if (!add(a, b, "topic", `${a} 和 ${b} 都属于“${g.name}”。`)) { warns.push(`${g.name} ${lvs.join("+")} 无法连通`); break; }
    join(a, b); rs = roots(); }
}

// ---------- 星座：每个星系里，按强关系把词分成 3–6 个的连通小组 ----------
const adj = {}; order.forEach(w => adj[w] = []);
edges.forEach(([a,b,t]) => { adj[a].push({w:b,t}); adj[b].push({w:a,t}); });
const constellations = [];
const consOf = {};
for (const [gi, g] of galaxies.entries()){
  const pool = new Set(g.words);
  const inner = w => adj[w].filter(e => pool.has(e.w) && consOf[e.w] === undefined);
  // 从连线最多的词开始长出一个小组
  const seeds = [...g.words].sort((a, b) => inner(b).length - inner(a).length);
  for (const s of seeds){ if (consOf[s] !== undefined || !inner(s).length) continue;
    const grp = [s]; consOf[s] = -1;
    while (grp.length < 5){
      let best = null, score = -1;
      for (const m of grp) for (const e of inner(m)){ const sc = (STRONG.includes(e.t) ? 2 : 1) + adj[e.w].filter(x => grp.includes(x.w)).length;
        if (sc > score){ score = sc; best = e.w; } }
      if (!best) break; grp.push(best); consOf[best] = -1; }
    if (grp.length < 3){ grp.forEach(w => delete consOf[w]); continue; }
    const id = constellations.length; grp.forEach(w => consOf[w] = id);
    const hub = grp[0];
    const nm = first(words[hub].cn).replace(/的$/, "").slice(0, 4);
    const inEdges = edges.filter(([a,b]) => grp.includes(a) && grp.includes(b));
    const kinds = [...new Set(inEdges.map(e => TYPES[e[2]].name))];
    constellations.push({ name: `${nm}座`, gal: gi, words: grp, note: `${grp.join("、")}：${kinds.join("、")}关系连在一起。` });
  }
  // 剩下的单个词并入相邻的小组（不超过 6 个）
  for (const w of g.words){ if (consOf[w] !== undefined && consOf[w] >= 0) continue; delete consOf[w];
    const e = adj[w].find(e => pool.has(e.w) && consOf[e.w] >= 0 && constellations[consOf[e.w]].words.length < 6);
    if (e){ const c = constellations[consOf[e.w]]; c.words.push(w); consOf[w] = consOf[e.w]; } }
}
// 同名星座加序号
const nameCnt = {}; constellations.forEach(c => { nameCnt[c.name] = (nameCnt[c.name]||0) + 1; });
const nameIdx = {}; constellations.forEach(c => { if (nameCnt[c.name] > 1){ nameIdx[c.name] = (nameIdx[c.name]||0) + 1; c.name = c.name.replace(/座$/, "") + "·" + "一二三四五六七八九十"[nameIdx[c.name]-1] + "座"; } });

// ---------- 布局：每个星系单独做力导向，坐标写进数据 ----------
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pos = {};
for (const g of galaxies){
  const W = g.words, set = new Set(W), N = W.length, R = 40 * Math.sqrt(N);
  const P = {}; W.forEach((w,i) => { const a = i / N * Math.PI * 2; P[w] = {x: Math.cos(a)*R*(.5+rnd()*.5), y: Math.sin(a)*R*(.5+rnd()*.5), vx:0, vy:0}; });
  const E = edges.filter(([a,b]) => set.has(a) && set.has(b));
  // 同一星座的词额外拉近
  const C = []; W.forEach(w => { const c = consOf[w]; if (c !== undefined) C.push(w); });
  const IT = 600;
  for (let it = 0; it < IT; it++){ const k = 1 - it / IT;
    for (let i = 0; i < N; i++) for (let j = i+1; j < N; j++){ const a = P[W[i]], b = P[W[j]]; let dx = a.x-b.x, dy = a.y-b.y; let d2 = dx*dx+dy*dy || .01;
      if (d2 > 90000) continue; const f = 5200 / d2; const d = Math.sqrt(d2); dx/=d; dy/=d; a.vx += dx*f; a.vy += dy*f; b.vx -= dx*f; b.vy -= dy*f; }
    E.forEach(([u,v]) => { const a = P[u], b = P[v]; const dx = b.x-a.x, dy = b.y-a.y; const d = Math.hypot(dx,dy)||.01;
      const same = consOf[u] !== undefined && consOf[u] === consOf[v]; const f = (d - (same ? 70 : 110)) * (same ? 0.08 : 0.03);
      a.vx += dx/d*f; a.vy += dy/d*f; b.vx -= dx/d*f; b.vy -= dy/d*f; });
    W.forEach(w => { const p = P[w]; p.vx -= p.x*0.006; p.vy -= p.y*0.006;
      p.x += Math.max(-20,Math.min(20,p.vx))*k; p.y += Math.max(-20,Math.min(20,p.vy))*k; p.vx *= .5; p.vy *= .5; });
  }
  W.forEach(w => pos[w] = [P[w].x, P[w].y]);
}
// 一整张星空：先把各主题按网格摆开，再用全部连线（包括跨主题的）整体做一次力导向，让有关系的主题靠近
{ const COLS = 5, CW = 1000, CH = 950, ALLW = order, N = ALLW.length, idx = {}; ALLW.forEach((w, i) => idx[w] = i);
  const X = new Float64Array(N), Y = new Float64Array(N), VX = new Float64Array(N), VY = new Float64Array(N);
  ALLW.forEach((w, i) => { const g = words[w].gal; X[i] = pos[w][0] * .85 + (g % COLS) * CW; Y[i] = pos[w][1] * .85 + Math.floor(g / COLS) * CH; });
  const E = edges.map(([a, b, t]) => [idx[a], idx[b], words[a].gal === words[b].gal ? (consOf[a] !== undefined && consOf[a] === consOf[b] ? 2 : t === "topic" ? 0 : 1) : 3]);
  const IT = 260, CELL = 140;
  for (let it = 0; it < IT; it++){ const k = 1 - it / IT; const grid = new Map();
    for (let i = 0; i < N; i++){ const key = Math.floor(X[i] / CELL) + "," + Math.floor(Y[i] / CELL); let c = grid.get(key); if (!c) grid.set(key, c = []); c.push(i); }
    for (let i = 0; i < N; i++){ const cx = Math.floor(X[i] / CELL), cy = Math.floor(Y[i] / CELL);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++){ const c = grid.get((cx + ox) + "," + (cy + oy)); if (!c) continue;
        for (const j of c){ if (j <= i) continue; let dx = X[i] - X[j], dy = Y[i] - Y[j]; let d2 = dx*dx + dy*dy || .01; if (d2 > CELL * CELL) continue;
          const f = 4200 / d2, d = Math.sqrt(d2); dx /= d; dy /= d; VX[i] += dx*f; VY[i] += dy*f; VX[j] -= dx*f; VY[j] -= dy*f; } } }
    for (const [u, v, kind] of E){ const dx = X[v] - X[u], dy = Y[v] - Y[u], d = Math.hypot(dx, dy) || .01;
      const [L, s] = kind === 2 ? [70, .08] : kind === 1 ? [110, .03] : kind === 0 ? [120, .015] : [160, .004];
      const f = (d - L) * s; VX[u] += dx/d*f; VY[u] += dy/d*f; VX[v] -= dx/d*f; VY[v] -= dy/d*f; }
    let mx = 0, my = 0; for (let i = 0; i < N; i++){ mx += X[i]; my += Y[i]; } mx /= N; my /= N;
    for (let i = 0; i < N; i++){ VX[i] -= (X[i] - mx) * .0006; VY[i] -= (Y[i] - my) * .0006;
      X[i] += Math.max(-18, Math.min(18, VX[i])) * k; Y[i] += Math.max(-18, Math.min(18, VY[i])) * k; VX[i] *= .5; VY[i] *= .5; } }
  let mx = 0, my = 0; for (let i = 0; i < N; i++){ mx += X[i]; my += Y[i]; } mx /= N; my /= N;
  ALLW.forEach((w, i) => pos[w] = [Math.round(X[i] - mx), Math.round(Y[i] - my)]); }

// ---------- 检查 ----------
const lonely = order.filter(w => !adj[w].length);
lonely.forEach(w => errors.push(`${words[w].where} 孤立的词（没有任何连线）：${w}`));
const lvCnt = {A2:0, B1:0, B2:0}; order.forEach(w => lvCnt[words[w].lv]++);

// ---------- 输出 ----------
// 小话题（片区）：推荐“一片一片学”、学完一片变金、选中时亮出所在区域
const subList = []; galaxies.forEach((g, gi) => g.subs.forEach(s => { s.id = subList.length; subList.push({ name: s.name, g: gi }); }));
const subOf = {}; galaxies.forEach(g => g.subs.forEach(s => s.words.forEach(w => subOf[w] = s.id)));
const outWords = {}; order.forEach(w => { const d = words[w]; outWords[w] = { ipa:d.ipa, cn:d.cn, ex:d.ex, lv:d.lv, g:d.gal, s:subOf[w], p:pos[w] }; });
const data = {
  starts: galaxies.map(g => { const ws = g.words.filter(w => words[w].lv === "A2"); return (ws.length ? ws : g.words).slice().sort((a,b) => adj[b].length - adj[a].length)[0]; }),
  types: TYPES,
  galaxies: galaxies.map(g => ({ name: g.name, id: g.id, n: g.words.length })),
  subs: subList,
  words: outWords,
  constellations: constellations.map(c => ({ name:c.name, g:c.gal, words:c.words, note:c.note })),
  edges
};
const banner = `// 本文件由 tools/build.js 根据 words/*.txt 自动生成，请改源文件后重新运行 node tools/build.js。\n`;
fs.writeFileSync(path.join(ROOT, "data.js"), banner + "window.WORDNET = " + JSON.stringify(data) + ";\n");
require("./build-minigame.js");   // 同步生成微信小游戏的词库
const tc = {}; edges.forEach(e => tc[e[2]] = (tc[e[2]]||0) + 1);
console.log(`单词 ${order.length}（A2 ${lvCnt.A2} · B1 ${lvCnt.B1} · B2 ${lvCnt.B2}）  连线 ${edges.length} ${JSON.stringify(tc)}  星座 ${constellations.length}  星系 ${galaxies.length}`);
console.log(`在星座里的词 ${Object.keys(consOf).filter(w => consOf[w] >= 0).length}`);
if (warns.length) console.log(`提醒 ${warns.length} 条：\n  ` + warns.slice(0, 40).join("\n  "));
if (errors.length){ console.log(`错误 ${errors.length} 条：\n  ` + errors.slice(0, 60).join("\n  ")); process.exitCode = 1; }
