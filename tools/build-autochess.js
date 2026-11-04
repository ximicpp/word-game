// 《词宝小队》词池构建：node tools/build-autochess.js
// 读 words/*.txt（级别、中文、例句、反义/词根关系）+ words/links.txt（反义对）+ autochess/pos.txt（词性），
// 自动找出词根家族（help → helper / helpful …），写进 autochess/index.html 的 /*DATA*/ 区。
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");

// ---------- 主题 = 词库里的星系（去掉“小词大用”这类虚词）----------
const ICON = { people: "👨‍👩‍👧", body: "💪", clothes: "👕", home: "🏠", food: "🍰", school: "🏫", work: "💼", sport: "⚽",
  shopping: "🛍️", travel: "🧳", town: "🏙️", nature: "🌳", time: "⏰", media: "📱", culture: "🎨", actions: "🏃", describe: "🌈", mind: "💡" };
const SKIP_THEME = new Set(["words"]);

// ---------- 读主词库 ----------
const lib = {}, themes = {};
for (const f of fs.readdirSync(path.join(ROOT, "words")).filter(f => /^\d+.*\.txt$/.test(f)).sort()){
  let th = null;
  for (const ln of fs.readFileSync(path.join(ROOT, "words", f), "utf8").split(/\r?\n/)){
    if (ln.startsWith("# ")){ const [name, id] = ln.slice(2).split("|").map(s => s.trim()); th = id; themes[id] = themes[id] || { name: name.replace(/与.*$/, m => m), icon: ICON[id] || "⭐" }; continue; }
    if (!ln.trim() || /^(#|\/\/)/.test(ln)) continue;
    const [w, lv, , cn, ex, rel = ""] = ln.split("|").map(s => (s || "").trim());
    if (w && !lib[w]) lib[w] = { w, lv, cn, ex, rel, th };
  }
}

// ---------- 词性：pos.txt 自动推断，下面的手工表优先 ----------
const POS = {};
for (const ln of fs.readFileSync(path.join(ROOT, "autochess", "pos.txt"), "utf8").split(/\r?\n/)){
  if (!ln.trim() || ln.startsWith("//")) continue;
  const [w, p] = ln.trim().split(/\s+/); POS[w] = p;
}
const FIX_POS = `ticket n luggage n passport n airport n hotel n map n journey n trip n transport n travel v arrive v leave v visit v visitor n pack v delay n abroad adv early adv late adv
apple n bread n cheese n soup n breakfast n cooker n cook v eat v drink v taste v delicious adj hungry adj sweet adj fresh adj hot adj cold adj
teacher n student n lesson n homework n library n exam n pencil n report n teach v learn v study v read v reader n write v clever adj quietly adv loudly adv carefully adv
sun n sunshine n rain n rainbow n snow n river n mountain n forest n grow v sunny adj rainy adj windy adj cloudy adj wet adj dry adj outside adv
football n team n player n match n playground n play v run v swim v swimmer n jump v win v lose v fast adj slow adj strong adj weak adj quickly adv slowly adv
house n bedroom n door n window n sofa n clean v wash v open v close v tidy adj messy adj dirty adj comfortable adj upstairs adv downstairs adv together adv
friend n friendship n happiness n smile v laugh v cry v help v helper n happy adj unhappy adj sad adj friendly adj unfriendly adj kind adj brave adj afraid adj helpful adj careful adj careless adj happily adv sadly adv
shop n money n price n present n customer n buy v sell v pay v borrow v lend v import v export v cheap adj expensive adj useful adj useless adj order v watch v`.split(/\s+/);
for (let k = 0; k < FIX_POS.length; k += 2) POS[FIX_POS[k]] = FIX_POS[k + 1];

// 主词库里没有、但小游戏要用的词
const EXTRA = {
  visitor: { lv: "A2", cn: "游客；访客", ex: "A visitor from London came to our class.", th: "travel" },
  reader: { lv: "A2", cn: "读者", ex: "She is a fast reader and loves comics.", th: "school" },
  swimmer: { lv: "A2", cn: "游泳的人", ex: "My brother is a very good swimmer.", th: "sport" },
  helper: { lv: "A2", cn: "帮手", ex: "Tom is a good helper in the kitchen.", th: "people" },
  happily: { lv: "A2", cn: "开心地", ex: "The children played happily in the garden.", th: "describe" },
  sadly: { lv: "B1", cn: "难过地", ex: "She looked sadly at the broken toy.", th: "describe" },
  import: { lv: "B1", cn: "进口", ex: "The shop imports tea from China.", th: "shopping" },
  export: { lv: "B1", cn: "出口", ex: "Brazil exports a lot of coffee.", th: "shopping" },
  strong: { lv: "A2", cn: "强壮的", ex: "You need strong legs to climb this hill.", th: "body" },
  weak: { lv: "A2", cn: "虚弱的；弱的", ex: "I felt weak after I was ill.", th: "body" },
};
for (const [w, e] of Object.entries(EXTRA)) if (!lib[w]) lib[w] = { w, rel: "", ...e };

// ---------- 选词 ----------
const out = [], idx = {}, errs = [];
for (const e of Object.values(lib)){
  if (!e.th || SKIP_THEME.has(e.th) || !POS[e.w] || !/^[a-z]+$/.test(e.w)) continue;
  if (!["A2", "B1", "B2"].includes(e.lv)) continue;
  if (!new RegExp(`\\b${e.w}\\b`, "i").test(e.ex)) { errs.push("例句没有原词：" + e.w); continue; }
  idx[e.w] = out.length;
  out.push({ w: e.w, pos: POS[e.w], th: e.th, lv: e.lv, cn: e.cn, ex: e.ex, fam: [], ant: [] });
}

// ---------- 反义对 ----------
const addAnt = (a, b) => { if (idx[a] === undefined || idx[b] === undefined || a === b) return; const A = out[idx[a]], B = out[idx[b]]; if (!A.ant.includes(b)) A.ant.push(b); if (!B.ant.includes(a)) B.ant.push(a); };
for (const e of Object.values(lib)) for (const r of e.rel.split(";")){ const [k, v] = r.split(":"); if (k === "ant" && v) v.split(",").forEach(x => addAnt(e.w, x.trim())); }
const links = fs.readFileSync(path.join(ROOT, "words", "links.txt"), "utf8").split(/\r?\n/);
const antLine = links[links.findIndex(l => l.trim() === "## ant") + 1] || "";
antLine.split(";").forEach(p => { const [a, b] = p.trim().split(/\s+/); if (a && b) addAnt(a, b); });
`hot-cold fast-slow quickly-slowly win-lose buy-sell borrow-lend arrive-leave open-close happy-sad strong-weak cheap-expensive wet-dry
careful-careless useful-useless upstairs-downstairs early-late tidy-messy friendly-unfriendly laugh-cry import-export happily-sadly
quietly-loudly clean-dirty`.split(/\s+/).forEach(p => addAnt(...p.split("-")));
// un- 开头的反义（unhappy ↔ happy）
for (const e of out) if (e.w.startsWith("un") && idx[e.w.slice(2)] !== undefined) addAnt(e.w, e.w.slice(2));

// ---------- 词根家族：base + 后缀 / un- + base ----------
const fams = {};
// 拼写碰巧像、意思无关的组合
const STOP = new Set(`leg-legal cap-capable wear-weary mug-muggy tide-tidy bus-busy busy-business subject-subjective form-formal port-portion port-porter
note-notion come-comment lie-liable tin-tiny scar-scary read-ready complex-complexion comply-compliment practice-practical`.split(/\s+/));
const join = (base, w) => { if (STOP.has(base + "-" + w) || base === w || idx[base] === undefined || idx[w] === undefined || base.length < 3) return false; (fams[base] = fams[base] || new Set([base])).add(w); return true; };
const first = cn => cn.split(/[；;，,]/)[0].replace(/[（(].*?[)）]/g, "");
const SUF = [
  ["er", c => /[者人员家手师器机]/.test(c)], ["or", c => /[者人员家]/.test(c)], ["ist", c => /[家者]/.test(c)], ["ian", c => /[家者员]/.test(c)],
  ["ful", () => true], ["less", () => true], ["ness", () => true], ["ment", () => true], ["able", () => true], ["ion", () => true], ["ation", () => true],
  ["ly", c => /[地的]/.test(c)], ["y", c => /的/.test(c)], ["ous", c => /的/.test(c)], ["al", c => /的/.test(c)], ["ive", c => /的/.test(c)], ["ship", () => true], ["hood", () => true],
];
for (const e of out){
  const w = e.w, c = first(e.cn);
  for (const [s, ok] of SUF){
    if (!w.endsWith(s) || !ok(c)) continue;
    const stem = w.slice(0, -s.length);
    const cands = [stem, stem + "e", stem.replace(/i$/, "y"), stem.length > 3 && stem.at(-1) === stem.at(-2) ? stem.slice(0, -1) : null, stem.replace(/at$/, "ate")].filter(Boolean);
    for (const b of cands) if (join(b, w)) break;
  }
  if (w.startsWith("un") && /[不没无]/.test(c)) join(w.slice(2), w);
  if (w.startsWith("dis") && /[不没无]/.test(c)) join(w.slice(3), w);
  if (w.startsWith("re") && /[再重新]/.test(c)) join(w.slice(2), w);
}
// 词库里标了 root: 的
for (const e of Object.values(lib)) for (const r of e.rel.split(";")){ const [k, v] = r.split(":"); if (k === "root" && v) join(v.trim(), e.w); }
// 合并：一个词出现在多个家族时都保留
const famOut = {};
for (const [base, set] of Object.entries(fams)){
  if (set.size < 2) continue;
  famOut[base] = { note: `${base}（${first(out[idx[base]].cn)}）一家` };
  for (const w of set) out[idx[w]].fam.push(base);
}
famOut.port = { note: "port = 搬、运" };
if (fams.port) { for (const w of fams.port) out[idx[w]].fam = out[idx[w]].fam.filter(f => f !== "port"); }
for (const w of "passport airport transport report import export porter".split(" ")) if (idx[w] !== undefined && !out[idx[w]].fam.includes("port")) out[idx[w]].fam.push("port");

if (errs.length) console.error(errs.slice(0, 20).join("\n"));
const usedThemes = Object.fromEntries(Object.entries(themes).filter(([k]) => out.some(e => e.th === k)));
const data = `const DATA = ${JSON.stringify({ themes: usedThemes, fams: famOut, words: out })};`;
const file = path.join(ROOT, "autochess", "index.html");
const html = fs.readFileSync(file, "utf8");
const re = /\/\*DATA\*\/[\s\S]*?\/\*END DATA\*\//;
if (!re.test(html)){ console.error("index.html 里找不到 /*DATA*/ … /*END DATA*/"); process.exit(1); }
fs.writeFileSync(file, html.replace(re, () => `/*DATA*/${data}/*END DATA*/`));
const by = k => out.reduce((m, e) => (m[e[k]] = (m[e[k]] || 0) + 1, m), {});
console.log(`写入 ${out.length} 个词，${Object.keys(famOut).length} 个家族，${out.filter(e => e.ant.length).length} 个词有反义词；词性`, by("pos"), "级别", by("lv"), "主题", Object.keys(usedThemes).length);
console.log("家族样例：", Object.keys(famOut).slice(0, 40).map(b => b + ":" + out.filter(e => e.fam.includes(b)).map(e => e.w).join("/")).join("  "));
