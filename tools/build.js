// 词库构建脚本：读 words/*.txt，生成 data.js（单词、连线、星座、星系、布局坐标）。
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
  hyper: { name: "上下位", ask: "是“一种……”的上下位关系" }
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
    if (!["A2","B1"].includes(lv)) errors.push(`${where} 级别应为 A2/B1：${w}`);
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
const PRE = [["un","不、相反"],["dis","不、相反"],["re","再、重新"],["im","不"],["in","不"],["ir","不"],["il","不"],["mis","错误地"],["over","过度"],["under","不足"]];
function stems(base){ const s = [base]; if (base.endsWith("e")) s.push(base.slice(0,-1)); if (base.endsWith("y")) s.push(base.slice(0,-1) + "i");
  if (/[^aeiou][aeiou][bdgmnprt]$/.test(base)) s.push(base + base.slice(-1)); return s; }
for (const b of order){ if (b.length < 3) continue;
  for (const [suf, mean] of SUF) for (const st of stems(b)){ const d = st + suf; if (d !== b && words[d]) add(b, d, "root", `${b} + -${suf}（${mean}）= ${d}（${first(words[d].cn)}）。`); }
  for (const [pre, mean] of PRE){ const d = pre + b; if (words[d]) add(b, d, "root", `${pre}-（${mean}）+ ${b} = ${d}（${first(words[d].cn)}）。`); } }
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
for (const [a, b] of cands){ if ((formCnt[a]||0) >= 3 || (formCnt[b]||0) >= 3) continue;
  if (add(a, b, "form", formNote(a, b))){ formCnt[a] = (formCnt[a]||0) + 1; formCnt[b] = (formCnt[b]||0) + 1; } }
// 5) 同主题：同一小话题里，给连线少于 2 条的词补上主题连线（按顺序连成链）
for (const g of galaxies) for (const s of g.subs){ const ws = s.words;
  for (let i = 0; i < ws.length; i++){ const w = ws[i]; if (deg(w) >= 2 && i) continue;
    const nb = ws[(i + 1) % ws.length]; if (ws.length > 1) add(w, nb, "topic", `${w} 和 ${nb} 都属于“${s.name}”这个话题。`); } }

// 6) 保证每个星系内部连通：从起点出发能一路点亮整个星系
for (const g of galaxies){
  const set = new Set(g.words), par = {}; g.words.forEach(w => par[w] = w);
  const find = w => par[w] === w ? w : (par[w] = find(par[w]));
  const join = (a, b) => { par[find(a)] = find(b); };
  edges.forEach(([a,b]) => { if (set.has(a) && set.has(b)) join(a, b); });
  // 先在同一小话题里，把相邻的两个不同分块连起来
  for (const s of g.subs){ const ws = s.words;
    for (let i = 1; i < ws.length; i++){ const a = ws[i-1], b = ws[i];
      if (find(a) !== find(b) && add(a, b, "topic", `${a} 和 ${b} 都属于“${s.name}”这个话题。`)) join(a, b); } }
  // 再把各小话题串起来：每个小话题里连线最少的词，连到上一个小话题
  for (let k = 1; k < g.subs.length; k++){ const A = g.subs[k-1], B = g.subs[k];
    if (!A.words.length || !B.words.length) continue;
    const a = A.words.slice().sort((x, y) => deg(x) - deg(y))[0], b = B.words.slice().sort((x, y) => deg(x) - deg(y))[0];
    if (find(a) !== find(b) && add(a, b, "topic", `${a}（${A.name}）和 ${b}（${B.name}）都属于“${g.name}”。`)) join(a, b); }
  const roots = new Set(g.words.map(find)); if (roots.size > 1) warns.push(`${g.name} 仍有 ${roots.size} 个分块`);
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
  W.forEach(w => pos[w] = [Math.round(P[w].x), Math.round(P[w].y)]);
}

// ---------- 检查 ----------
const lonely = order.filter(w => !adj[w].length);
lonely.forEach(w => errors.push(`${words[w].where} 孤立的词（没有任何连线）：${w}`));
const lvCnt = {A2:0, B1:0}; order.forEach(w => lvCnt[words[w].lv]++);

// ---------- 输出 ----------
const outWords = {}; order.forEach(w => { const d = words[w]; outWords[w] = { ipa:d.ipa, cn:d.cn, ex:d.ex, lv:d.lv, g:d.gal, p:pos[w] }; });
const data = {
  starts: galaxies.map(g => { const ws = g.words.filter(w => words[w].lv === "A2"); return (ws.length ? ws : g.words).slice().sort((a,b) => adj[b].length - adj[a].length)[0]; }),
  types: TYPES,
  galaxies: galaxies.map(g => ({ name: g.name, id: g.id, n: g.words.length })),
  words: outWords,
  constellations: constellations.map(c => ({ name:c.name, g:c.gal, words:c.words, note:c.note })),
  edges
};
const banner = `// 本文件由 tools/build.js 根据 words/*.txt 自动生成，请改源文件后重新运行 node tools/build.js。\n`;
fs.writeFileSync(path.join(ROOT, "data.js"), banner + "window.WORDNET = " + JSON.stringify(data) + ";\n");
const tc = {}; edges.forEach(e => tc[e[2]] = (tc[e[2]]||0) + 1);
console.log(`单词 ${order.length}（A2 ${lvCnt.A2} · B1 ${lvCnt.B1}）  连线 ${edges.length} ${JSON.stringify(tc)}  星座 ${constellations.length}  星系 ${galaxies.length}`);
console.log(`在星座里的词 ${Object.keys(consOf).filter(w => consOf[w] >= 0).length}`);
if (warns.length) console.log(`提醒 ${warns.length} 条：\n  ` + warns.slice(0, 40).join("\n  "));
if (errors.length){ console.log(`错误 ${errors.length} 条：\n  ` + errors.slice(0, 60).join("\n  ")); process.exitCode = 1; }
