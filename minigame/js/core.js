// 游戏规则（和网页版 index.html 里的逻辑一致）：词库筛选、自由点亮、星等、推荐、星级与复习、等级与里程碑、连续天数、出题。
// 这里不碰界面，只返回数据；文字用“片段”数组表示：{s:文字, f:"w"英文|"cn"中文|"ipa"音标, b:粗体, c:颜色名}
const RAW = require("./data.js");

const KEY = "wordnet-progress-v1";
const BANKS = { ket:{name:"KET", lv:["A2"], note:"A2 Key"}, pet:{name:"PET", lv:["B1"], note:"B1 Preliminary"},
  kp:{name:"KET+PET", lv:["A2","B1"], note:"A2 + B1"}, kpf:{name:"KET+PET+FCE", lv:["A2","B1","B2"], note:"A2 + B1 + B2"} };
const TYPE_ORDER = ["sound","form","syn","ant","root","coll","topic","hyper"];
const DAY = 864e5;
const INTERVALS = [1, 3, 7, 14, 30];
const HINT_COST = 30, CONS_BONUS = 30, OPEN_STEP = 12, GOAL = 10, GOAL_BONUS = 50, QN = 3;
// 观星者等级：按累计点亮数（所有词库合计）升级
const LV_AT = [0,10,25,45,70,100,140,190,250,320,400,500,620,760,920,1100,1300,1550,1800,2100,2400,2750,3100,3400,3716];
const LV_TITLE = ["见习观星者","寻星人","引星人","星图师","星河旅人","星系领航员","星海守望者"];
const lvOf = n => { let i = 0; while (i + 1 < LV_AT.length && n >= LV_AT[i + 1]) i++; return i + 1; };
const titleOf = lv => LV_TITLE[Math.min(LV_TITLE.length - 1, Math.floor((lv - 1) / 4))];
// 考纲里程碑：KET / PET / FCE 各自点亮 25% / 50% / 75% / 100%
const EXAMS = [{lv:"A2", name:"KET", note:"A2 Key"}, {lv:"B1", name:"PET", note:"B1 Preliminary"}, {lv:"B2", name:"FCE", note:"B2 First"}];
const QUARTERS = [25, 50, 75, 100];
const STREAK_MS = [3, 7, 14, 30, 50, 100, 200, 365];
const GUARD_COST = 100, GUARD_MAX = 2;
const GIANT_LV = INTERVALS.length - 1;
const MAG = {3:"一等星", 2:"二等星", 1:"三等星"};
const SPELL_G = ["spell", "letters"];
const LV_RANK = {A2:0, B1:1, B2:2};

const T = (s, o) => Object.assign({s: String(s)}, o || {});
const W = (s, o) => T(s, Object.assign({f:"w"}, o));

function createCore(store, shiftDays){
  const SHIFT = (shiftDays || 0) * DAY;
  const now = () => Date.now() + SHIFT;
  const readSave = () => { try { const v = store.get(KEY); return v ? JSON.parse(v) : null; } catch(e){ return null; } };
  let BANK = "kp"; { const v = readSave(); if (v && BANKS[v.bank]) BANK = v.bank; }
  const LVS = BANKS[BANK].lv;
  const D = Object.assign({}, RAW, { words: {} });
  for (const w in RAW.words) if (LVS.includes(RAW.words[w].lv)) D.words[w] = RAW.words[w];
  D.edges = RAW.edges.filter(([a, b]) => D.words[a] && D.words[b]);
  D.constellations = RAW.constellations.map(c => Object.assign({}, c, { words: c.words.filter(w => D.words[w]) }));
  const WORDS = Object.keys(D.words), TYPES = D.types, GAL = D.galaxies, CONS = D.constellations;

  // ---------- 图结构 ----------
  const adj = {}; WORDS.forEach(w => adj[w] = []);
  D.edges.forEach(([a,b,t,note], i) => { adj[a].push({w:b,t,note,i}); adj[b].push({w:a,t,note,i}); });
  const nbSet = w => new Set(adj[w].map(e => e.w));
  function twoHop(w){ const s = new Set(); const one = nbSet(w);
    one.forEach(n => adj[n].forEach(e => { if (e.w !== w && !one.has(e.w)) s.add(e.w); })); return [...s]; }
  const gOf = w => D.words[w].g;
  const GW = GAL.map(() => []); WORDS.forEach(w => GW[gOf(w)].push(w));
  const GE = GAL.map(() => []); D.edges.forEach(([a,b], i) => { if (gOf(a) === gOf(b)) GE[gOf(a)].push(i); });
  const GC = GAL.map(() => []); CONS.forEach((c, i) => { if (c.words.length >= 3) GC[c.g].push(i); });
  const ALLC = [].concat(...GC);   // 老机型可能没有 Array.prototype.flat
  const consOf = {}; ALLC.forEach(i => CONS[i].words.forEach(w => consOf[w] = i));
  const NCONS = ALLC.length;
  const STARTS = GAL.map((_, g) => WORDS.filter(w => gOf(w) === g).sort((a, b) => (LV_RANK[D.words[a].lv] - LV_RANK[D.words[b].lv]) || (adj[b].length - adj[a].length) || (a < b ? -1 : 1))[0]);
  const DIFF = {}; WORDS.forEach(w => { const n = adj[w].filter(e => e.t === "sound" || e.t === "form").length;
    DIFF[w] = Math.min(3, LV_RANK[D.words[w].lv] + 1 + (n >= 2 ? 1 : 0)); });
  // 星等：强关系（不算“同主题”）越多越重要。一等星 5 题、二等星 4 题、三等星 3 题，点亮后也更亮
  const IMP = {}; WORDS.forEach(w => IMP[w] = new Set(adj[w].filter(e => e.t !== "topic").map(e => e.w)).size);
  const IMP_AT = (() => { const v = WORDS.map(w => IMP[w]).sort((a, b) => a - b); return [v[Math.floor(v.length * .6)], v[Math.floor(v.length * .88)]]; })();
  const tierOf = w => IMP[w] >= Math.max(IMP_AT[1], 6) ? 3 : IMP[w] >= Math.max(IMP_AT[0], 3) ? 2 : 1;
  const qnOf = w => 2 + tierOf(w);
  const dustFor = (w, stars) => tierOf(w) * 15 + stars * 5;
  const EXAM_N = {}; Object.keys(RAW.words).forEach(w => { const l = RAW.words[w].lv; EXAM_N[l] = (EXAM_N[l] || 0) + 1; });

  // ---------- 状态 ----------
  const fresh = () => ({ v:2, tips:{}, lit:[], answered:0, correct:0, stars:{}, mem:{}, combo:0, best:0, folded:[], dust:30, gal:0, mute:false, daily:{d:"", n:0, done:false}, streak:{d:"", c:0}, luck:{d:"", w:null, got:false}, bank:"kp" });
  let S = fresh();
  const C = {};   // 对外接口
  let cur = 0;
  let litSet = new Set(), readySet = new Set(), openG = [], litArr = [];
  function load(){ const v = readSave(); if (v && Array.isArray(v.lit)) S = Object.assign(S, v);
    S.lit = [...new Set(S.lit.filter(w => RAW.words[w]))]; S.bank = BANK;
    if (S.v !== 2){ S.folded = []; S.v = 2; }
    S.lit.forEach(w => { if (!S.stars[w]) S.stars[w] = 3; if (!S.mem[w]) S.mem[w] = {lv:0, due: now() + DAY}; });
    S.gal = 0;
    if (!S.ms) { S.ms = {}; examPassed().forEach(k => S.ms[k] = ""); }
    if (!S.lvl) S.lvl = lvOf(S.lit.length);
    if (!S.sms) { S.sms = {}; const c = streakNow(); STREAK_MS.forEach(m => { if (m <= c) S.sms[m] = ""; }); }
    if (S.guard === undefined) S.guard = 0;
    recalc(); S.folded = S.folded.filter(i => CONS[i] && consDone(i)); cur = 0; }
  const dayKey = t => { const d = new Date(t); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); };
  const today = () => dayKey(now());
  function daily(){ if (!S.daily || S.daily.d !== today()) S.daily = {d: today(), n: 0, done: false}; return S.daily; }
  let streakHit = null;                           // 这一次刚达到的连续天数里程碑
  function bumpDaily(){ const g = daily(); g.n++; streakHit = null;
    if (!S.streak) S.streak = {d:"", c:0};
    if (S.streak.d !== g.d){ S.streak.c = S.streak.d === dayKey(now() - DAY) ? S.streak.c + 1 : 1; S.streak.d = g.d;
      if (S.streak.c > (S.streak.best || 0)) S.streak.best = S.streak.c;
      if (!S.sms) S.sms = {};
      if (STREAK_MS.includes(S.streak.c) && !(S.streak.c in S.sms)) { S.sms[S.streak.c] = today(); streakHit = S.streak.c; } }
    if (g.n >= GOAL && !g.done){ g.done = true; S.dust += GOAL_BONUS; return true; } return false; }
  const dayDiff = (a, b) => { const [y1, m1, d1] = a.split("-"), [y2, m2, d2] = b.split("-"); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY); };
  // 现在还算数的连续天数：最后一次是今天或昨天才算
  function streakNow(){ const k = S.streak; if (!k || !k.d || !k.c) return 0; return dayDiff(k.d, today()) <= 1 ? k.c : 0; }
  // 打开时检查：漏了几天，守护星够就自动用掉，连续天数接着算
  function guardCheck(){ const k = S.streak; if (!k || !k.d || !k.c) return null;
    const miss = dayDiff(k.d, today()) - 1; if (miss < 1) return null;
    const have = S.guard || 0; if (have < miss) return null;
    S.guard = have - miss; k.d = dayKey(now() - DAY); save(); return miss; }
  function buyGuard(){ if ((S.guard || 0) >= GUARD_MAX || S.dust < GUARD_COST) return false; S.dust -= GUARD_COST; S.guard = (S.guard || 0) + 1; save(); return true; }
  function examLit(){ const c = {}; S.lit.forEach(w => { const l = RAW.words[w] && RAW.words[w].lv; if (l) c[l] = (c[l] || 0) + 1; }); return c; }
  function examPassed(){ const c = examLit(), out = [];
    EXAMS.forEach(e => QUARTERS.forEach(q => { if ((c[e.lv] || 0) >= Math.ceil(EXAM_N[e.lv] * q / 100)) out.push(e.lv + ":" + q); })); return out; }
  const examOf = lv => EXAMS.find(e => e.lv === lv);
  function msText(k){ const [l, q] = k.split(":"), e = examOf(l); return q === "100" ? `${e.name} 词汇全部点亮！` : q === "50" ? `${e.name} 词汇点亮一半了！` : `${e.name} 词汇点亮 ${q}%！`; }
  const mdText = d => { const [, m, dd] = d.split("-"); return `${+m}月${+dd}日`; };
  // 每周回顾：每周第一次打开时，对比上次的快照；返回要展示的数据，或 null
  const weekKey = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return dayKey(d.getTime()); };
  const snap = () => ({k: weekKey(now()), lit: S.lit.length, giant: giantCount(), pol: S.polished || 0, lvl: lvOf(S.lit.length)});
  function weekly(){ const w = S.week, cur = snap();
    if (!w || !S.lit.length) { S.week = cur; save(); return null; }
    if (w.k === cur.k) return null;
    S.week = cur; save();
    const items = [[cur.lit - w.lit, "颗新点亮"], [cur.pol - w.pol, "次擦亮"], [cur.giant - w.giant, "颗新恒星"], [cur.lvl - w.lvl, "级升级"]].filter(([v]) => v > 0);
    return {items, lastWeek: w.k === weekKey(now() - 7 * DAY)}; }
  const hash = str => { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  function lucky(){ if (!S.luck) S.luck = {d:"", w:null, got:false};
    const L = S.luck, t = today();
    if (L.d === t) return L.got || !readySet.has(L.w) ? null : L.w;
    const all = [...readySet].filter(w => tierOf(w) >= 2); if (!all.length) all.push(...readySet);
    if (!all.length) return null;
    all.sort(); S.luck = {d: t, w: all[hash(t) % all.length], got: false}; save(); return S.luck.w; }
  function save(){ try { store.set(KEY, JSON.stringify(S)); } catch(e){} }
  function recalc(){
    litArr = S.lit.filter(w => D.words[w]); litSet = new Set(litArr); const ra = new Set();
    // 自由浏览：任何没点亮的词都可以做题点亮
    WORDS.forEach(w => { if (!litSet.has(w)) ra.add(w); });
    openG = GAL.map(() => true);
    readySet = ra; candKey = "";
  }
  const isLit = w => litSet.has(w);
  const status = w => litSet.has(w) ? "lit" : readySet.has(w) ? "ready" : "locked";
  const isFading = w => isLit(w) && S.mem[w] && now() >= S.mem[w].due;
  const isGiant = w => isLit(w) && S.mem[w] && S.mem[w].lv >= GIANT_LV;
  const giantCount = () => S.lit.filter(w => S.mem[w] && S.mem[w].lv >= GIANT_LV).length;
  const fadingWords = () => litArr.filter(isFading);
  const consDone = i => CONS[i].words.every(isLit);
  const isFolded = i => S.folded.includes(i);
  const gainOf = w => [...new Set(adj[w].filter(e => status(e.w) === "locked").map(e => e.w))];
  const consLeft = w => consOf[w] === undefined ? null : CONS[consOf[w]].words.filter(x => x !== w && !isLit(x)).length;
  function dueText(w){ const m = S.mem[w]; if (!m) return ""; const d = Math.ceil((m.due - now()) / DAY);
    return d <= 0 ? "星光变暗了，答 1 题就能擦亮" : d === 1 ? "明天需要擦亮一次" : `${d} 天后需要擦亮`; }
  // 推荐顺序：能连成星座 → 挨着已点亮的词 → 重要的词 → 难度低
  let candKey = "", candVal = null;
  function candidates(prefer){
    const k = prefer ? null : S.lit.length + "|" + S.lit[S.lit.length - 1];
    if (k && k === candKey) return candVal.slice();
    const pf = prefer || new Set();
    const r = [...readySet].map(w => ({w, g: IMP[w], cl: consLeft(w), nl: adj[w].some(e => litSet.has(e.w))}))
      .sort((a, b) => (pf.has(b.w) - pf.has(a.w)) || ((b.cl === 0) - (a.cl === 0))
        || (b.nl - a.nl) || (b.g - a.g) || (DIFF[a.w] - DIFF[b.w]) || (a.w < b.w ? -1 : 1));
    if (k) { candKey = k; candVal = r; return r.slice(); } return r;
  }
  const rep = w => (consOf[w] !== undefined && isFolded(consOf[w])) ? "c" + consOf[w] : w;
  function fold(i, on){ S.folded = S.folded.filter(x => x !== i); if (on && consDone(i)) S.folded.push(i); save(); }

  // ---------- 出题 ----------
  const shuffle = a => { a = a.slice(); for (let i = a.length-1; i > 0; i--){ const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]] = [a[j],a[i]]; } return a; };
  const pick = a => a[Math.floor(Math.random()*a.length)];
  function fillFrom(target, pools, n, ok){ const out = []; const used = new Set([target]);
    for (const pool of pools) for (const x of shuffle(pool)) { if (out.length >= n) break; if (used.has(x) || !ok(x)) continue; out.push(x); used.add(x); }
    return out; }
  const byLv = {}; WORDS.forEach(w => (byLv[D.words[w].lv] = byLv[D.words[w].lv] || []).push(w));
  const sameLv = w => byLv[D.words[w].lv];
  const cn1 = w => D.words[w].cn.split(/[；;，,]/)[0].replace(/（[^）]*）/g, "").trim();
  const CN_STOP = new Set([..."的地得了着一不是有人子者在和与把被个"]);
  const cnChars = w => new Set([...D.words[w].cn].filter(c => /[一-鿿]/.test(c) && !CN_STOP.has(c)));
  const cnNear = (a, b) => { if (cn1(a) === cn1(b)) return true; const A = cnChars(a); return [...cn1(b)].some(c => A.has(c)); };
  const ipaOf = w => D.words[w].ipa.replace(/[ˈˌ]/g, "");
  const soundNear = (a, b) => ipaOf(a) === ipaOf(b) || ipaOf(a).slice(-2) === ipaOf(b).slice(-2);
  function lev(a, b){ if (Math.abs(a.length - b.length) > 2) return 9; let p = [...Array(b.length + 1).keys()];
    for (let i = 1; i <= a.length; i++){ const q = [i]; for (let j = 1; j <= b.length; j++) q[j] = Math.min(p[j] + 1, q[j-1] + 1, p[j-1] + (a[i-1] === b[j-1] ? 0 : 1)); p = q; } return p[b.length]; }
  const spellNear = (a, b) => lev(a.toLowerCase(), b.toLowerCase()) <= 2 || a.startsWith(b) || b.startsWith(a);
  const MEANING_T = new Set(["syn","ant","hyper"]);
  const alsoFits = (t, w, x) => t === "sound" ? soundNear(w, x) : t === "form" || t === "root" ? spellNear(w, x) : t === "syn" || t === "ant" || t === "hyper" ? cnNear(w, x) || cnNear(x, w) : false;
  const ipaRun = w => T("/" + D.words[w].ipa + "/", {f:"ipa"});

  function qMeaning(w){
    const cn = D.words[w].cn; const seen = new Set([cn]);
    const close = new Set(adj[w].filter(e => e.t === "syn" || e.t === "hyper" || e.t === "root").map(e => e.w));
    const ok = x => !close.has(x) && !seen.has(D.words[x].cn) && !seen.has(cn1(x)) && cn1(x) !== cn1(w) && (seen.add(D.words[x].cn), seen.add(cn1(x)), true);
    const ds = fillFrom(w, [adj[w].filter(e => e.t === "sound" || e.t === "form").map(e => e.w), adj[w].filter(e => e.t !== "topic").map(e => e.w), twoHop(w), sameLv(w)], 3, ok);
    const opts = shuffle([w, ...ds]).map(x => ({key:x, label:D.words[x].cn, en:false}));
    return { gen:"meaning", q:[W(w, {b:1, c:"ready"}), T(" 的中文意思是？")], opts, answer:w,
      explain:[W(w), T(" "), ipaRun(w), T("：" + cn)] };
  }
  function qRelation(w){
    const strong = adj[w].filter(e => e.t !== "topic"), pool = strong.length ? strong : adj[w];
    const t0 = pick([...new Set(pool.map(e => e.t))]), e = pick(pool.filter(x => x.t === t0)); const near = nbSet(w);
    const g = gOf(w), ok = x => !near.has(x) && gOf(x) !== g && !nbSet(x).has(e.w) && !alsoFits(e.t, w, x) && !(MEANING_T.has(e.t) && (cnNear(e.w, x) || cnNear(x, e.w)));
    const ds = fillFrom(w, [twoHop(e.w), twoHop(w), sameLv(w)], 3, ok);
    const opts = shuffle([e.w, ...ds]).map(x => ({key:x, label:x, en:true}));
    return { gen:"relation", q:[T("哪个词和 "), W(w, {b:1, c:"ready"}), T(" " + TYPES[e.t].ask + "？")], opts, answer:e.w,
      explain:[W(e.w, {b:1, c:"good"}), T("（" + TYPES[e.t].name + "）：" + e.note)], showCn:true };
  }
  function qBlank(w){
    const d = D.words[w]; const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:s|es|d|ed|[lpnt]ed|ing)?\\b`, "gi");
    const sent = d.ex.replace(re, "\u0001").split("\u0001").reduce((a, s, k) => (k && a.push(W(" ______ ", {c:"ready"})), s && a.push(W(s)), a), []);
    const conf = adj[w].filter(e => e.t === "sound" || e.t === "form").map(e => e.w);
    const g = gOf(w), banned = nbSet(w);
    const ds = fillFrom(w, [conf, sameLv(w).filter(x => gOf(x) !== g)], 3, x => conf.includes(x) || (!banned.has(x) && gOf(x) !== g && !cnNear(w, x) && !cnNear(x, w) && !d.ex.toLowerCase().includes(x.toLowerCase())));
    const opts = shuffle([w, ...ds]).map(x => ({key:x, label:x, en:true}));
    return { gen:"blank", q:[T("选词填空")], sent, opts, answer:w,
      explain:[W(w, {b:1, c:"good"}), T("："), W(d.ex)], showCn:true };
  }
  function qLink(w){
    const lit = adj[w].filter(e => isLit(e.w)), strongLit = lit.filter(e => e.t !== "topic");
    const tiers = [strongLit, lit, adj[w].filter(e => e.t !== "topic"), adj[w]];
    const optsFor = e => { const fits = t => MEANING_T.has(t) ? !MEANING_T.has(e.t) && alsoFits(t, w, e.w) : alsoFits(t, w, e.w);
      const free = TYPE_ORDER.filter(t => t !== e.t && t !== "topic" && !fits(t));
      return free.length >= 3 ? shuffle(free).slice(0, 3) : e.t !== "topic" && free.length === 2 ? free.concat("topic") : null; };
    let e = null, ds = null;
    for (const tier of tiers){ for (const x of shuffle(tier)){ const d = optsFor(x); if (d){ e = x; ds = d; break; } } if (e) break; }
    if (!e){ e = pick(adj[w]); ds = shuffle(TYPE_ORDER.filter(t => t !== e.t)).slice(0, 3); }
    const opts = shuffle([e.t, ...ds]).map(t => ({key:t, label:TYPES[t].name, en:false}));
    return { gen:"link", q:[W(w, {b:1, c:"ready"}), T(" 和 "), W(e.w, {b:1, c:"ready"}), T(" 是什么关系？")], opts, answer:e.t,
      explain:[T(TYPES[e.t].name + "：" + e.note)] };
  }
  function qReverse(w){
    const cn = D.words[w].cn; const seen = new Set([cn]);
    const close = new Set(adj[w].filter(e => e.t === "syn" || e.t === "hyper" || e.t === "root").map(e => e.w));
    const ok = x => !close.has(x) && !seen.has(D.words[x].cn) && !seen.has(cn1(x)) && cn1(x) !== cn1(w) && (seen.add(D.words[x].cn), seen.add(cn1(x)), true);
    const ds = fillFrom(w, [adj[w].filter(e => e.t === "sound" || e.t === "form").map(e => e.w), twoHop(w), sameLv(w)], 3, ok);
    const opts = shuffle([w, ...ds]).map(x => ({key:x, label:x, en:true}));
    return { gen:"reverse", q:[T("“" + cn + "”用英语怎么说？")], opts, answer:w, explain:[W(w, {b:1, c:"good"}), T(" "), ipaRun(w), T("：" + cn)], showCn:true };
  }
  const canSpell = w => /^[a-z]{4,}$/.test(w);
  function misspell(w){
    const out = new Set(), V = "aeiou", add = x => { if (x !== w && !RAW.words[x] && x.length > 2) out.add(x); };
    for (let i = 1; i < w.length - 1; i++) add(w.slice(0, i) + w[i+1] + w[i] + w.slice(i+2));
    for (let i = 1; i < w.length; i++){ if (w[i] === w[i-1]) add(w.slice(0, i) + w.slice(i+1));
      else if (!V.includes(w[i]) && V.includes(w[i-1])) add(w.slice(0, i) + w[i] + w.slice(i)); }
    for (let i = 1; i < w.length; i++) if (V.includes(w[i])) for (const v of V) if (v !== w[i]) add(w.slice(0, i) + v + w.slice(i+1));
    if (w.includes("ie")) add(w.replace("ie", "ei")); if (w.includes("ei")) add(w.replace("ei", "ie"));
    return shuffle([...out]);
  }
  function qSpell(w){
    const ds = misspell(w).slice(0, 3); if (ds.length < 3) return qMeaning(w);
    const opts = shuffle([w, ...ds]).map(x => ({key:x, label:x, en:true}));
    return { gen:"spell", q:[T("哪个拼写是对的？")], sent:[T(D.words[w].cn)], opts, answer:w,
      explain:[T("正确拼写："), W(w, {b:1, c:"good"}), T(" "), ipaRun(w)] };
  }
  // 补字母：挖掉两个最容易拼错的字母，从几种写法里挑出对的
  function qLetters(w){
    const V = "aeiou", wins = [];
    for (let i = 1; i + 2 <= w.length; i++){ const seg = w.slice(i, i + 2), alts = new Set();
      if (!V.includes(seg[0]) && !V.includes(seg[1]) && seg[0] !== seg[1]) continue;
      alts.add(seg[1] + seg[0]);
      for (let k = 0; k < 2; k++) if (V.includes(seg[k])) for (const v of V) alts.add(seg.slice(0, k) + v + seg.slice(k + 1));
      if (seg[0] === seg[1]) alts.add(seg[0]); else if (!V.includes(seg[1])) alts.add(seg[0] + seg[1] + seg[1]);
      if (V.includes(seg[0]) && V.includes(seg[1])) for (const a of V) for (const b of V) alts.add(a + b);
      const ok = [...alts].filter(a => a !== seg && !/^([aiu])\1$/.test(a) && !RAW.words[w.slice(0, i) + a + w.slice(i + 2)]);
      if (ok.length >= 3) wins.push({i, seg, ok, score: (V.includes(seg[0]) && V.includes(seg[1]) ? 2 : 0) + (seg[0] === seg[1] ? 2 : 0) + (i > 1 ? 1 : 0)}); }
    if (!wins.length) return qSpell(w);
    const best = Math.max(...wins.map(x => x.score)), c = pick(wins.filter(x => x.score === best));
    const near = c.ok.filter(a => a.length === 2 && [...a].filter((ch, k) => ch !== c.seg[k]).length === 1 || a === c.seg[1] + c.seg[0] || a.length !== 2);
    const ds = [...shuffle(near), ...shuffle(c.ok)].filter((a, k, arr) => arr.indexOf(a) === k).slice(0, 3);
    const opts = shuffle([c.seg, ...ds]).map(x => ({key:x, label:x, en:true}));
    return { gen:"letters", q:[T("补上缺的字母")], sent:[W(w.slice(0, c.i), {b:1}), W("__", {b:1, c:"lamp"}), W(w.slice(c.i + 2), {b:1}), T("\n"), T(D.words[w].cn, {f:"cn", size:15, c:"muted"})], opts, answer:c.seg,
      explain:[T("正确拼写："), W(w.slice(0, c.i), {b:1, c:"good"}), W(c.seg, {b:1, c:"lamp"}), W(w.slice(c.i + 2), {b:1, c:"good"}), T(" "), ipaRun(w)] };
  }
  function qIpa(w){
    const ipa = D.words[w].ipa; const seen = new Set([ipa]);
    const ok = x => !seen.has(D.words[x].ipa) && (seen.add(D.words[x].ipa), true);
    const L = w.length, near = sameLv(w).filter(x => Math.abs(x.length - L) <= 1 && x[0] === w[0]);
    const ds = fillFrom(w, [adj[w].filter(e => e.t === "sound" || e.t === "form").map(e => e.w), near, sameLv(w)], 3, ok);
    const opts = shuffle([w, ...ds]).map(x => ({key:x, label:x, en:true}));
    return { gen:"ipa", q:[T("/" + ipa + "/", {f:"ipa", c:"ready"}), T(" 是哪个词？")], opts, answer:w,
      explain:[T("/" + ipa + "/", {f:"ipa"}), T(" 是 "), W(w, {b:1, c:"good"}), T("：" + D.words[w].cn)], showCn:true };
  }
  const GENS = {meaning:qMeaning, reverse:qReverse, relation:qRelation, blank:qBlank, spell:qSpell, letters:qLetters, ipa:qIpa, link:qLink};
  function gensFor(w, mode){ const g = ["meaning","reverse","blank","ipa"];
    if (canSpell(w)) g.push("spell", "letters");
    if (mode === "review") { if (adj[w].some(e => isLit(e.w))) g.push("link"); }
    else if (adj[w].length) g.push("relation");
    return g; }
  // 点亮：一道考意思、一道考拼写（能拼的词），其余随机；题数按星等 3–5 道
  function drawGens(w){ const all = gensFor(w, "light"), first = pick(["meaning","reverse"]);
    const sp = all.some(g => SPELL_G.includes(g)) ? [pick(SPELL_G)] : [];
    const rest = shuffle(all.filter(g => g !== "meaning" && g !== "reverse" && !SPELL_G.includes(g)).concat(first === "meaning" ? ["reverse"] : ["meaning"]));
    return shuffle([first, ...sp, ...rest].slice(0, qnOf(w))); }

  // ---------- 一轮答题 ----------
  function newQuiz(w, mode){
    const gens = mode === "review" ? [pick(gensFor(w, "review"))] : drawGens(w);
    return { w, mode, used: new Set(gens), qs: gens.map(g => GENS[g](w)), i:0, miss:0, picked:null, done:false, wasDue: isFading(w) };
  }
  // 选一个答案；返回 {ok, comboMilestone}
  function answer(z, k){ const q = z.qs[z.i]; if (z.picked !== null) return null; z.picked = k; const ok = q.opts[k].key === q.answer;
    S.answered++; let milestone = false;
    if (ok){ S.correct++; S.combo++; if (S.combo > S.best) S.best = S.combo; milestone = S.combo % 5 === 0; }
    else { S.combo = 0; z.miss++;
      if (z.mode === "review" && z.miss === 1 && S.mem[z.w]) S.mem[z.w].lv = Math.max(0, S.mem[z.w].lv - 1); }
    save(); return {ok, milestone}; }
  function retry(z){ const all = gensFor(z.w, z.mode);
    let pool = all.filter(g => !z.used.has(g)); if (!pool.length) pool = all.filter(g => g !== z.qs[z.i].gen);
    const g = pick(pool); z.used.add(g); z.qs[z.i] = GENS[g](z.w); z.picked = null; }
  function useHint(z){ const q = z.qs[z.i]; if (S.dust < HINT_COST || q.cut) return false; S.dust -= HINT_COST;
    q.cut = shuffle(q.opts.map((o,k) => k).filter(k => q.opts[k].key !== q.answer)).slice(0, 2); save(); return true; }
  function lightUp(z){
    const w = z.w, before = new Set(readySet), openBefore = openG.slice();
    const stars = z.miss === 0 ? 3 : z.miss === 1 ? 2 : 1;
    if (!isLit(w)) S.lit.push(w);
    S.stars[w] = Math.max(stars, S.stars[w] || 0);
    const nl = lvOf(S.lit.length); z.lvUp = nl > (S.lvl || 1) ? nl : null; if (z.lvUp) S.lvl = nl;
    if (!S.ms) S.ms = {}; z.ms = examPassed().filter(k => !(k in S.ms)); z.ms.forEach(k => S.ms[k] = today());
    S.mem[w] = {lv:0, due: now() + INTERVALS[0] * DAY};
    recalc();
    z.done = true; z.stars = stars; z.unlocked = [...readySet].filter(x => !before.has(x));
    z.newGal = GAL.map((_, g) => g).filter(g => openG[g] && !openBefore[g]);
    const ci = consOf[w]; z.newCons = ci !== undefined && consDone(ci) ? ci : null;
    z.lucky = S.luck && S.luck.d === today() && S.luck.w === w && !S.luck.got;
    if (z.lucky) S.luck.got = true;
    z.dust = dustFor(w, stars) * (z.lucky ? 2 : 1) + (z.newCons !== null ? CONS_BONUS : 0); S.dust += z.dust;
    z.goal = bumpDaily(); z.streak = streakHit;
    z.galDone = false;
    save();
  }
  function finishReview(z){
    const w = z.w, m = S.mem[w] || (S.mem[w] = {lv:0, due:now()}), was = m.lv;
    if (z.wasDue){ if (z.miss === 0) m.lv = Math.min(m.lv + 1, INTERVALS.length - 1); m.due = now() + INTERVALS[m.lv] * DAY; S.polished = (S.polished || 0) + 1; }
    z.giant = was < GIANT_LV && m.lv >= GIANT_LV; z.near = !z.giant && m.lv === GIANT_LV - 1;
    z.gain = z.miss === 0 && (S.stars[w] || 3) < 3; if (z.gain) S.stars[w] = (S.stars[w] || 3) + 1;
    z.dust = z.wasDue && z.miss === 0 ? 5 : 0; S.dust += z.dust;
    z.goal = bumpDaily(); z.streak = streakHit;
    save(); z.done = true;
  }
  function reset(){ S = Object.assign(fresh(), {tips: S.tips || {}, mute: S.mute}); recalc(); cur = 0; S.gal = 0; save(); }
  function setBank(k){ S.bank = k; S.gal = 0; save(); }
  function setCur(g){ cur = g; S.gal = g; }

  load();
  // 用属性描述符合并，保证 S、cur 等 getter 始终读到最新值
  return Object.defineProperties(C, Object.getOwnPropertyDescriptors({
    BANKS, BANK, ALLC, TYPE_ORDER, TYPES, GAL, CONS, D, WORDS, adj, nbSet, gOf, GW, GE, GC, consOf, NCONS, STARTS, DIFF,
    HINT_COST, OPEN_STEP, GOAL, GOAL_BONUS, QN, RAW, IMP, tierOf, qnOf, MAG, LV_AT, lvOf, titleOf, EXAMS, EXAM_N, QUARTERS, STREAK_MS, GUARD_COST, GUARD_MAX, GIANT_LV, INTERVALS, LVS,
    get S(){ return S; }, get cur(){ return cur; }, get litArr(){ return litArr; }, get readySet(){ return readySet; }, get openG(){ return openG; },
    now, save, recalc, daily, lucky, isLit, status, isFading, fadingWords, consDone, isFolded, gainOf, consLeft, dueText, candidates, rep, fold, dustFor,
    GENS, gensFor, newQuiz, answer, retry, useHint, lightUp, finishReview, reset, setBank, setCur, today,
    isGiant, giantCount, streakNow, guardCheck, buyGuard, examLit, examPassed, msText, mdText, weekly, cn1
  }));
}

module.exports = { createCore, KEY, BANKS };
