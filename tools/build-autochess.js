// 《词宝小队》词池构建：读 words/*.txt 取级别、音标、中文、例句，
// 加上本文件里手工标注的词性、主题、词根家族、反义对，写进 autochess/index.html 的 DATA 区。
// 用法：node tools/build-autochess.js
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");

// ---------- 读主词库 ----------
const lib = {};
for (const f of fs.readdirSync(path.join(ROOT, "words")).filter(f => /^\d+.*\.txt$/.test(f))){
  for (const ln of fs.readFileSync(path.join(ROOT, "words", f), "utf8").split(/\r?\n/)){
    if (!ln.trim() || /^(#|\/\/)/.test(ln)) continue;
    const [w, lv, ipa, cn, ex] = ln.split("|").map(s => (s || "").trim());
    if (w && !lib[w]) lib[w] = { lv, ipa, cn, ex };
  }
}

// ---------- 主题（每个词只属于一个主题）----------
// 行格式：单词 词性 [级别|中文|例句]（后三项只给主词库里没有的词）
const THEMES = {
  travel: { name: "旅行", icon: "🧳", words: `
ticket n
luggage n
passport n
airport n
hotel n
map n
journey n
trip n
transport n
travel v
arrive v
leave v
visit v
visitor n|A2|游客；访客|A visitor from London came to our class.
pack v
delay n
abroad adv
early adv
late adv` },
  food: { name: "美食", icon: "🍰", words: `
apple n
bread n
cheese n
soup n
breakfast n
cooker n
cook v
eat v
drink v
taste v
delicious adj
hungry adj
sweet adj
fresh adj
hot adj
cold adj` },
  school: { name: "学校", icon: "🏫", words: `
teacher n
student n
lesson n
homework n
library n
exam n
pencil n
report n
teach v
learn v
study v
read v
reader n|A2|读者|She is a fast reader and loves comics.
write v
clever adj
quietly adv
loudly adv
carefully adv` },
  nature: { name: "自然", icon: "🌳", words: `
sun n
sunshine n
rain n
rainbow n
snow n
river n
mountain n
forest n
grow v
sunny adj
rainy adj
windy adj
cloudy adj
wet adj
dry adj
outside adv` },
  sport: { name: "运动", icon: "⚽", words: `
football n
team n
player n
match n
playground n
play v
run v
swim v
swimmer n|A2|游泳的人|My brother is a very good swimmer.
jump v
win v
lose v
fast adj
slow adj
strong adj|A2|强壮的|You need strong legs to climb this hill.
weak adj|A2|虚弱的；弱的|I felt weak after I was ill.
quickly adv
slowly adv` },
  home: { name: "家", icon: "🏠", words: `
house n
bedroom n
door n
window n
sofa n
clean v
wash v
open v
close v
tidy adj
messy adj
dirty adj
comfortable adj
upstairs adv
downstairs adv
together adv` },
  feel: { name: "心情", icon: "😊", words: `
friend n
friendship n
happiness n
smile v
laugh v
cry v
help v
helper n|A2|帮手|Tom is a good helper in the kitchen.
happy adj
unhappy adj
sad adj
friendly adj
unfriendly adj
kind adj
brave adj
afraid adj
helpful adj
careful adj
careless adj
happily adv|A2|开心地|The children played happily in the garden.
sadly adv|B1|难过地|She looked sadly at the broken toy.` },
  shop: { name: "购物", icon: "🛍️", words: `
shop n
money n
price n
present n
customer n
buy v
sell v
pay v
borrow v
lend v
import v|B1|进口|The shop imports tea from China.
export v|B1|出口|Brazil exports a lot of coffee.
cheap adj
expensive adj
useful adj
useless adj` },
};

// ---------- 词根家族（一家人）----------
const FAMILIES = {
  port:   { note: "port = 搬、运", words: "passport airport transport report import export" },
  help:   { note: "help = 帮助", words: "help helper helpful" },
  happy:  { note: "happy = 开心", words: "happy unhappy happiness happily" },
  care:   { note: "care = 小心、在意", words: "careful careless carefully" },
  play:   { note: "play = 玩", words: "play player playground" },
  friend: { note: "friend = 朋友", words: "friend friendly unfriendly friendship" },
  sun:    { note: "sun = 太阳", words: "sun sunny sunshine" },
  rain:   { note: "rain = 雨", words: "rain rainy rainbow" },
  use:    { note: "use = 用", words: "useful useless" },
  er:     { note: "-er = 做某事的人", words: "teacher reader swimmer player helper visitor" },
  ly:     { note: "-ly = ……地", words: "quickly slowly quietly loudly happily sadly carefully" },
};
// “-er”“-ly”是后缀家族；一个词可以属于多个家族
// ---------- 反义对（对对碰）----------
const ANT = `hot-cold fast-slow quickly-slowly win-lose buy-sell borrow-lend arrive-leave open-close happy-sad
strong-weak cheap-expensive wet-dry careful-careless useful-useless upstairs-downstairs early-late tidy-messy
friendly-unfriendly laugh-cry import-export happily-sadly quietly-loudly clean-dirty teach-learn`;

// ---------- 组装 ----------
const out = [], idx = {}, errs = [];
for (const [tid, t] of Object.entries(THEMES)){
  for (const ln of t.words.trim().split("\n")){
    const [head, lv2, cn2, ex2] = ln.split("|");
    const [w, pos] = head.trim().split(/\s+/);
    if (idx[w] !== undefined){ errs.push("重复：" + w); continue; }
    const L = lib[w] || {};
    const e = { w, pos, th: tid, lv: L.lv || lv2, cn: L.cn || cn2, ex: L.ex || ex2, fam: [], ant: null };
    if (!e.lv || !e.cn || !e.ex) errs.push("缺资料：" + w);
    if (!new RegExp(`\\b${w}\\b`, "i").test(e.ex || "")) errs.push(`例句没有原词：${w}：${e.ex}`);
    if (!["n","v","adj","adv"].includes(pos)) errs.push("词性不对：" + ln);
    idx[w] = out.length; out.push(e);
  }
}
for (const [fid, f] of Object.entries(FAMILIES)){
  const ws = f.words.split(/\s+/);
  for (const w of ws){ if (idx[w] === undefined) errs.push(`家族 ${fid} 的词不在主题里：${w}`); else out[idx[w]].fam.push(fid); }
  if (ws.length < 2) delete FAMILIES[fid];
}
for (const p of ANT.trim().split(/\s+/)){
  const [a, b] = p.split("-");
  if (idx[a] === undefined || idx[b] === undefined){ errs.push("反义对缺词：" + p); continue; }
  out[idx[a]].ant = b; out[idx[b]].ant = a;
}
for (const e of out) e.fam = e.fam.filter(f => FAMILIES[f]);
if (errs.length){ console.error(errs.join("\n")); process.exit(1); }

const themes = Object.fromEntries(Object.entries(THEMES).map(([k, t]) => [k, { name: t.name, icon: t.icon }]));
const fams = Object.fromEntries(Object.entries(FAMILIES).map(([k, f]) => [k, { note: f.note }]));
const data = `const DATA = ${JSON.stringify({ themes, fams, words: out })};`;
const file = path.join(ROOT, "autochess", "index.html");
const html = fs.readFileSync(file, "utf8");
const re = /\/\*DATA\*\/[\s\S]*?\/\*END DATA\*\//;
if (!re.test(html)){ console.error("index.html 里找不到 /*DATA*/ … /*END DATA*/"); process.exit(1); }
fs.writeFileSync(file, html.replace(re, () => `/*DATA*/${data}/*END DATA*/`));
const by = k => out.reduce((m, e) => (m[e[k]] = (m[e[k]] || 0) + 1, m), {});
console.log(`写入 ${out.length} 个词；词性`, by("pos"), "级别", by("lv"));
