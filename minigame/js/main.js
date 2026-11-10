// 单词星系 · 微信小游戏版：全部界面画在一块 Canvas 上。
// 上方是星图（可拖动、双指缩放、点星），下方是可滚动的面板（推荐、单词、答题、结果）。
const P = require("./platform.js");
const U = require("./ui.js");
const { createCore } = require("./core.js");
const { COL } = U;

const VERSION = "1.18.2", APP_NAME = "单词星系背单词";
const ctx = P.ctx, W = P.W, H = P.H, dpr = P.dpr;
const PAD = 16, AUTO_MS = 800, CHAIN_MS = 1300, LD = Math.min(dpr, 2);   // LD：星图离屏层的清晰度，最高 2 倍，省内存
U.setFamilies(P.families || {});

// ---------- 规则核心（换词库时重建） ----------
let core, D, GAL, CONS, GW, GE, GC, consOf, adj, TYPES, POS, BBall, CP, ALLC;
function boot(){
  core = createCore(P.store, P.shiftDays); reveal = null;
  ({ D, GAL, CONS, GW, GE, GC, consOf, adj, TYPES } = core);
  POS = {}; core.WORDS.forEach(w => POS[w] = {x: D.words[w].p[0], y: D.words[w].p[1]});
  { const xs = core.WORDS.map(w => POS[w].x), ys = core.WORDS.map(w => POS[w].y), x0 = Math.min(...xs), y0 = Math.min(...ys);
    BBall = {x: x0 - 120, y: y0 - 160, w: Math.max(...xs) - x0 + 240, h: Math.max(...ys) - y0 + 260}; }
  ALLC = core.ALLC;
  CP = CONS.map(c => c.words.length ? { x: c.words.reduce((s,w) => s + POS[w].x, 0) / c.words.length, y: c.words.reduce((s,w) => s + POS[w].y, 0) / c.words.length,
    top: Math.min(...c.words.map(w => POS[w].y)) } : {x:0, y:0, top:0});
  quiz = null; selected = null; selCons = null; tipQ.length = 0; tipCache = null; heatKey = ""; ign = null; page = null;
  const g = core.guardCheck(); weekCard = core.weekly();
  build(); refresh(); renderPanel(true);
  if (core.S.lit.length) core.backup();
  if (g) toast(`守护星帮你保住了连续天数（用掉 ${g} 颗）`);
  // 新玩家先看到开场封面，一个按钮直接开始第一颗星
  cover = !core.S.lit.length && !(core.S.tips && core.S.tips.first);
  if (core.fadingWords().length) tip("fade");
}
let weekCard = null, page = null, cover = false;
function startFirst(){ cover = false; if (!S().tips) S().tips = {}; S().tips.first = 1; core.save(); sfx("ok"); const c = core.candidates()[0]; if (c) startQuiz(c.w, "light"); }
const S = () => core.S;
const posOf = id => /^c\d+$/.test(id) ? CP[+id.slice(1)] : POS[id];

// ---------- 版面 ----------
const L = {};
function computeLayout(){
  const top = Math.max(P.safe.top || 0, 6);
  let r1y = top + 6, r1h = 32, r1right = W - PAD;
  if (P.menu){ r1y = P.menu.top; r1h = P.menu.height; r1right = P.menu.left - 10; }
  L.head = {h: r1y + r1h + 8, r1y, r1h, r1right};
  // 星图铺满顶栏以下的整个屏幕；面板是压在上面的抽屉，有三档高度：露一条 / 一半 / 大部分
  const rest = H - L.head.h;
  L.map = {x: 0, y: L.head.h, w: W, h: rest};
  SN = [Math.round(Math.max(206, rest * .3)), Math.round(rest * .5), Math.round(rest * .7)];
  if (!sheetH) sheetH = SN[sheetK];
  L.panel = {x: 0, y: H - sheetH, w: W, h: sheetH, padB: Math.max(16, H - (P.safe.bottom || H) + 12)};
}
let SN = [200, 360, 520], sheetK = 0, sheetH = 0;
const SHEET_TOP = 22;   // 抽屉顶部的把手区
// 看得见的星图：顶栏以下、抽屉（目标高度）以上
const visH = () => Math.max(120, H - sheetTarget() - L.map.y);
// 答题时抽屉按题目内容的高度拉起，不留大片空白
function sheetTarget(){ return sheetK === 2 && quiz && !quiz.done ? Math.min(SN[2], Math.max(SN[1], Math.round(PB.h + SHEET_TOP + L.panel.padB + 8))) : SN[sheetK]; }
function setSheet(k){ sheetK = Math.max(0, Math.min(2, k)); }
function sheetTick(){ const tg = sheetTarget(); if (touch.sheet) return false; if (Math.abs(tg - sheetH) < .5){ sheetH = tg; L.panel.y = H - sheetH; L.panel.h = sheetH; return false; }
  sheetH += (tg - sheetH) * .25; L.panel.y = H - sheetH; L.panel.h = sheetH; clampScroll(); return true; }

// ---------- 视野（和网页版 SVG viewBox 一样的算法） ----------
let vb = {x:0, y:0, w:1000, h:1000}, BB = vb, glideA = null;
const sc = () => Math.max(vb.w / L.map.w, vb.h / L.map.h);
function view(){ const s = sc(); return {s, ox: vb.x + (vb.w - L.map.w * s) / 2, oy: vb.y + (vb.h - L.map.h * s) / 2}; }
const toWorld = (sx, sy) => { const v = view(); return {x: v.ox + (sx - L.map.x) * v.s, y: v.oy + (sy - L.map.y) * v.s}; };
function glide(to, dur){ glideA = {from: {...vb}, to, t0: Date.now(), dur: dur || 350}; }
const go = (to, anim, dur) => { if (anim) glide(to, dur); else { glideA = null; vb = to; } };
// 把一块世界区域放进“看得见的星图”中间（星图比可见区域高，下面压着抽屉）
function fitBox(cx, cy, w, h, anim, dur){ const vh = visH(), asp = vh / L.map.w;
  if (h / w < asp) h = w * asp; else w = h / asp;
  const s = w / L.map.w; go({x: cx - w / 2, y: cy - vh * s / 2, w, h: L.map.h * s}, anim, dur); }
function fit(anim, dur){ fitBox(BB.x + BB.w / 2, BB.y + BB.h / 2, BB.w, BB.h, anim, dur); }
// 打开时：放大到“下一颗”附近，能看清周围十几个词的名字；整片星空用“全览”按钮看
function fitActive(anim){ const c = core.candidates()[0], w = c ? c.w : core.litArr[core.litArr.length - 1];
  if (!w) return fit(anim);
  fitBox(POS[w].x, POS[w].y, HOME_W, HOME_W, anim); }
const HOME_W = 300;
function fitWords(ws, mn, anim){
  const xs = ws.map(w => POS[w].x), ys = ws.map(w => POS[w].y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  fitBox(cx, cy, Math.max(Math.max(...xs) - Math.min(...xs) + 160, mn), Math.max(Math.max(...ys) - Math.min(...ys) + 160, mn * visH() / L.map.w), anim); }
function zoom(f, sx, sy, anim){ const v = view();
  const px = sx === undefined ? v.ox + L.map.w / 2 * v.s : v.ox + (sx - L.map.x) * v.s, py = sy === undefined ? v.oy + visH() / 2 * v.s : v.oy + (sy - L.map.y) * v.s;
  const nw = Math.min(BB.w * 2.5, Math.max(BB.w / 8, vb.w * f)), k = nw / vb.w;
  go({x: px - (px - vb.x) * k, y: py - (py - vb.y) * k, w: nw, h: vb.h * k}, anim); }
function focusOn(p){ fitBox(p.x, p.y, 380, 380, true); }
// 选中词：对准它和最近的几个相关词
const near8 = w => [...core.nbSet(w)].filter(x => core.rep(x) === x).sort((a, b) => Math.hypot(POS[a].x - POS[w].x, POS[a].y - POS[w].y) - Math.hypot(POS[b].x - POS[w].x, POS[b].y - POS[w].y)).slice(0, NB_MAX);
const NB_MAX = 8;
function focusWord(w){ const ns = [w, ...near8(w).filter(x => Math.hypot(POS[x].x - POS[w].x, POS[x].y - POS[w].y) < 300)];
  fitWords(ns, 300, true); }

// ---------- 状态 ----------
let selected = null, selCons = null, quiz = null, autoT = null, autoStart = 0, tapAny = null;
// 连着点亮：点亮后不停在结果页，星星燃起的同时接下一个词；擦亮：一轮 5 颗，一题接一题
let chainT = null, run = null;
function clearChain(){ clearTimeout(chainT); chainT = null; if (quiz && quiz.chain) quiz.chain = null; }
const PRAISE = ["太棒了！", "真厉害！", "闪闪发光！", "继续保持！", "好记性！"];
const praise = () => PRAISE[Math.floor(Math.random() * PRAISE.length)];
const busy = () => quiz && !quiz.done;
const V = { rec: new Set(), luck: null, near: null, selId: null, bundles: [], nb: new Set(), nbl: new Set(), warm: new Set(), litE: {}, half: [], hl: [], consE: [] };
function build(){ core.setCur(0); BB = BBall; computeLayout(); fitActive(false); }
function bundles(){
  const m = new Map(); if (!core.S.folded.length) return [];
  D.edges.forEach((_, i) => { const [a,b] = D.edges[i]; const ra = core.rep(a), rb = core.rep(b);
    if ((ra === a && rb === b) || ra === rb) return;
    const key = [ra, rb].sort().join("|");
    if (!m.has(key)) m.set(key, {ra, rb, list:[]}); m.get(key).list.push(i); });
  return [...m.values()];
}
// 状态变化后重新计算星图要用的东西（相当于网页版的 paint）
function refresh(){
  V.rec = new Set(core.candidates().slice(0, 3).map(c => c.w)); V.luck = core.lucky();
  // 选中词：手机上只连最近的 8 个相关词（全部列在面板里），名字也只标这几个
  const nbS = selected ? new Set(near8(selected)) : null;
  V.nb = nbS || new Set(); V.near = nbS;
  V.nbl = nbS || new Set();
  V.selId = selected || (selCons !== null ? "c" + selCons : null);
  V.bundles = bundles().map(bd => { const ts = new Set(bd.list.map(i => D.edges[i][2]));
    return {pa: posOf(bd.ra), pb: posOf(bd.rb), n: bd.list.length, color: ts.size === 1 ? COL[[...ts][0]] : "#d9dfec",
      lit: bd.list.every(i => core.isLit(D.edges[i][0]) && core.isLit(D.edges[i][1])), hl: !!V.selId && (bd.ra === V.selId || bd.rb === V.selId)}; });
  // 挨着已点亮的词（强关系）：没点亮的星带一点暖色
  V.warm = new Set(); core.litArr.forEach(w => adj[w].forEach(e => { if (e.t !== "topic" && !core.isLit(e.w)) V.warm.add(e.w); }));
  // 连线分组：亮线按类型，选中词的连线单独画，一端点亮的光
  // 平时只画骨架：每颗点亮的星只连到离它最近的一个已点亮的相关词（强关系优先）；选中的词显示全部连线
  V.litE = {}; V.half = []; V.hl = []; const best = {};
  D.edges.forEach(([a, b, t], i) => { if (core.rep(a) !== a || core.rep(b) !== b) return; const la = core.isLit(a), lb = core.isLit(b), isHl = !!selected && (a === selected && nbS.has(b) || b === selected && nbS.has(a));
    if (isHl) { V.hl.push([i, la && lb]); if (!(la && lb)) return; }
    if (la && lb){ const d = Math.hypot(POS[a].x - POS[b].x, POS[a].y - POS[b].y) * (t === "topic" ? 1.6 : 1);
      [a, b].forEach(w => { if (!best[w] || d < best[w][0]) best[w] = [d, i]; }); } });
  new Set(Object.values(best).map(x => x[1])).forEach(i => { const [a, b, t] = D.edges[i]; if (selected && (a === selected || b === selected)) return; (V.litE[t] = V.litE[t] || []).push(i); });
  V.consE = []; ALLC.forEach(ci => { if (!core.consDone(ci) || core.isFolded(ci)) return; const set = new Set(CONS[ci].words);
    CONS[ci].words.forEach(a => adj[a].forEach(e => { if (set.has(e.w) && a < e.w) V.consE.push([a, e.w]); })); });
  mapVer++; heatSoon();
}

// ---------- 热力场底图 ----------
// 每颗点亮的星是一个热源（星等、星级越高越热，变暗待擦亮的只剩余温，恒星更热），叠加成温度场画在星空最底层
const HEAT_CELL = 8, HEAT_STOP = [[0,[40,30,90,0]],[.12,[52,38,120,.22]],[.3,[120,52,140,.32]],[.5,[214,96,84,.4]],[.72,[255,170,80,.46]],[1,[255,212,150,.52]]];
const HEAT_LUT = []; for (let i = 0; i < 256; i++){ const h = i / 255; let c = HEAT_STOP[HEAT_STOP.length - 1][1];
  for (let k = 1; k < HEAT_STOP.length; k++){ const [t1, c1] = HEAT_STOP[k], [t0, c0] = HEAT_STOP[k - 1]; if (h <= t1){ const f = (h - t0) / (t1 - t0); c = c0.map((v, j) => v + (c1[j] - v) * f); break; } }
  HEAT_LUT.push(c); }
let heatKey = "", heat = null, heatPrev = null, heatT0 = 0, heatTimer = null;
function heatSoon(){ clearTimeout(heatTimer); heatTimer = setTimeout(drawHeat, 30); }
function drawHeat(){
  if (ign) { heatTimer = setTimeout(drawHeat, 400); return; }
  const src = core.litArr, S0 = S();
  const key = core.BANK + "|" + src.map(w => w + (S0.stars[w] || 3) + (core.isFading(w) ? "f" : "") + (core.isGiant(w) ? "g" : "")).join(",");
  if (key === heatKey) return; heatKey = key;
  const B = BBall, Wd2 = Math.ceil(B.w / HEAT_CELL), Hd = Math.ceil(B.h / HEAT_CELL), f = new Float32Array(Wd2 * Hd);
  src.forEach(w => { const T = core.tierOf(w), sg = (24 + T * 9) / HEAT_CELL, R = Math.ceil(sg * 3), inv = 1 / (2 * sg * sg);
    const a = (.55 + T * .2) * [0, .6, .8, 1][S0.stars[w] || 3] * (core.isFading(w) ? .35 : 1) * (core.isGiant(w) ? 1.35 : 1);
    const cx = (POS[w].x - B.x) / HEAT_CELL, cy = (POS[w].y - B.y) / HEAT_CELL;
    for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(Hd - 1, Math.ceil(cy + R)); y++){ const dy = y - cy, o = y * Wd2;
      for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(Wd2 - 1, Math.ceil(cx + R)); x++){ const dx = x - cx; f[o + x] += a * Math.exp(-(dx * dx + dy * dy) * inv); } } });
  const c = P.offscreen(Wd2, Hd), x2 = c.getContext("2d"), im = x2.createImageData(Wd2, Hd), d = im.data;
  for (let i = 0; i < f.length; i++){ if (f[i] < .02) continue; const h = 1 - Math.exp(-f[i] * .75);
    const band = h * 7 % 1, line = h > .1 && band < .07 ? .07 : 0, col = HEAT_LUT[Math.min(255, Math.round(h * 255))];
    d[i*4] = col[0]; d[i*4+1] = col[1]; d[i*4+2] = col[2]; d[i*4+3] = Math.round(Math.min(1, col[3] + line) * 255); }
  x2.putImageData(im, 0, 0);
  // 学完的一片（小话题全部点亮）：背后亮起一层金色光晕
  const gw = [].concat(...core.SW.filter((_, i) => core.subDone(i)));
  if (gw.length){ const g = new Float32Array(Wd2 * Hd), sg = 34 / HEAT_CELL, R = Math.ceil(sg * 2.6), inv = 1 / (2 * sg * sg);
    gw.forEach(w => { const cx = (POS[w].x - B.x) / HEAT_CELL, cy = (POS[w].y - B.y) / HEAT_CELL;
      for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(Hd - 1, Math.ceil(cy + R)); y++){ const dy = y - cy, o = y * Wd2;
        for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(Wd2 - 1, Math.ceil(cx + R)); x++){ const dx = x - cx; g[o + x] += Math.exp(-(dx * dx + dy * dy) * inv); } } });
    const gi = x2.createImageData(Wd2, Hd), gd = gi.data;
    for (let i = 0; i < g.length; i++){ if (g[i] < .03) continue; const h = 1 - Math.exp(-g[i] * .9); gd[i*4] = 255; gd[i*4+1] = 205 + 30 * h; gd[i*4+2] = 110 + 60 * h; gd[i*4+3] = Math.round(Math.min(.42, h * .45) * 255); }
    const c2 = P.offscreen(Wd2, Hd); c2.getContext("2d").putImageData(gi, 0, 0); goldF = {c: c2, x: B.x, y: B.y, w: Wd2 * HEAT_CELL, h: Hd * HEAT_CELL}; }
  else goldF = null;
  heatPrev = heat; heat = {c, x: B.x, y: B.y, w: Wd2 * HEAT_CELL, h: Hd * HEAT_CELL}; heatT0 = Date.now(); }
let goldF = null;

// ---------- 选择与导航 ----------
function select(w){ pick = null; if (reveal) endReveal(); if (!busy()){ clearChain(); run = null; } if (busy()) { if (w) toast("先完成这一轮答题"); return; }
  const back = !w && (quiz || selected || selCons !== null);
  if (w && core.rep(w) !== w) { S().folded = S().folded.filter(i => i !== consOf[w]); }
  quiz = null; page = null; selected = w; selCons = null; core.save(); refresh(); renderPanel(true);
  if (w) focusWord(w); else if (back) fitActive(true); }
function selectCons(i){ pick = null; if (!busy()){ clearChain(); run = null; } if (busy()) { toast("先完成这一轮答题"); return; }
  quiz = null; page = null; selected = null; selCons = i; refresh(); renderPanel(true); focusOn(CP[i]); }
function showLevel(){ if (busy()) { toast("先完成这一轮答题"); return; } clearChain(); run = null; quiz = null; page = "level"; selected = null; selCons = null; refresh(); renderPanel(true); }

function startQuiz(w, mode){ pick = null; reveal = null; clearChain();
  selected = w; selCons = null; page = null;
  quiz = core.newQuiz(w, mode);
  if (S().lit.length && S().dust >= core.HINT_COST) tip("hint");
  refresh(); renderPanel(true); focusWord(w); }
function answer(k){ const z = quiz; const r = core.answer(z, k); if (!r) return;
  sfx(r.ok ? "ok" : "bad"); if (r.ok) P.vibrate();
  if (r.milestone){ const big = S().combo % 10 === 0; meteor(big ? 8 : 3); toast(`连击 ×${S().combo}！`); if (big){ sfx("cons"); P.vibrate(); } }
  refresh(); renderPanel(false); if (!r.ok) scrollTo = maxScroll(); }   // 答错时让解析和“再答一次”露出来
function nextQ(){ clearTimeout(autoT); tapAny = null; const z = quiz; if (!z || z.done || z.picked === null) return;
  if (z.i < z.qs.length - 1){ z.i++; z.picked = null; renderPanel(true); } else if (z.mode === "review") finishReview(); else lightUp(); }
function lightUp(){
  const z = quiz, w = z.w; core.lightUp(z); const saveFail = !core.saveOk();
  // 点亮动画：镜头对准新星和已点亮的邻居 → 星星燃起、冲击波、星点四散 → 光沿连线流向已点亮的邻居
  const nbs = [...new Set(adj[w].filter(e => core.isLit(e.w) && core.rep(e.w) === e.w).map(e => e.w))]
    .sort((x, y) => Math.hypot(POS[x].x - POS[w].x, POS[x].y - POS[w].y) - Math.hypot(POS[y].x - POS[w].x, POS[y].y - POS[w].y)).slice(0, 8);
  const near = nbs.filter(x => Math.hypot(POS[x].x - POS[w].x, POS[x].y - POS[w].y) < 260);
  setSheet(1); fitWords([w, ...near], 300, true);
  ign = {w, t0: Date.now(), nbs, T: core.tierOf(w), done: {}};
  ign.end = IGN_D0 + IGN_GAP + Math.max(0, nbs.length - 1) * IGN_STEP + IGN_BEAM + 200;
  refresh(); P.vibrate();
  if (z.goal || z.lvUp || z.ms.length || z.streak) meteor(8);
  sfx(z.newCons !== null || z.lvUp || z.ms.length || z.streak ? "cons" : "light");
  if (z.newCons !== null) meteor(5); else if (z.stars === 3) meteor(1);
  tip("stars"); if (z.newCons !== null) tip("cons"); if (z.goal) tip("fav");
  if (core.litArr.length === core.WORDS.length) toast("整片单词星系都点亮了！");
  else if (z.ms.length) toast(core.msText(z.ms[z.ms.length - 1]));
  else if (z.streak) toast(`连续 ${z.streak} 天！`);
  else if (z.lvUp) toast(`升到 Lv.${z.lvUp} · ${core.titleOf(z.lvUp)}！`);
  else if (z.goal) toast(`今日目标完成！星尘 +${core.GOAL_BONUS}`);
  else if (z.newCons !== null) toast(`连成了${CONS[z.newCons].name}！`);
  else if (z.subDone !== null) toast(`「${core.SUBS[z.subDone].name}」这一片全部点亮！`);
  if (z.subDone !== null){ meteor(5); sfx("cons"); }
  if (saveFail) toast("进度没有保存成功，请检查手机存储空间");
  // 没有大事（星座、升级、里程碑、今日目标）就直接接下一个词
  // 今日目标、升级、考纲里程碑：点亮动画放完后拉远看整片星空
  z.reveal = !!(z.goal || z.lvUp || z.ms.length);
  // 接下一颗时，前几名推荐里有和刚点亮的词直接相连的，就顺着这条线走
  const big = z.newCons !== null || z.subDone !== null || z.lvUp || z.ms.length || z.streak || z.goal || core.litArr.length === core.WORDS.length, cs1 = big ? [] : core.candidates(),
    nx = cs1.slice(0, 8).find(c => adj[w].some(e => e.w === c.w && e.t !== "topic")) || cs1.slice(0, 8).find(c => adj[w].some(e => e.w === c.w)) || cs1[0];
  if (nx){ z.chain = nx.w; z.chainT0 = Date.now(); chainT = setTimeout(goChain, CHAIN_MS); }
  renderPanel(true);
}
function goChain(){ const z = quiz; if (!z || !z.chain) return; const w = z.chain; clearChain(); startQuiz(w, "light"); }
const IGN_D0 = 250, IGN_GAP = 300, IGN_STEP = 70, IGN_BEAM = 350;   // 点亮动画约 1.5 秒
let ign = null;
function ignTick(t){ if (!ign) return; const e = t - ign.t0;
  if (!ign.boom && e > IGN_D0 + 120){ ign.boom = true; const T = ign.T, n = 8 + T * 4, p = POS[ign.w];
    for (let k = 0; k < n; k++){ const a = k / n * Math.PI * 2 + Math.random() * .4, r = 24 + T * 8 + Math.random() * 26;
      sparks.push({x: p.x, y: p.y, dx: Math.cos(a) * r, dy: Math.sin(a) * r, r: 1.4 + Math.random() * 1.8, t0: t}); } }
  ign.nbs.forEach((x, k) => { const t0 = IGN_D0 + IGN_GAP + k * IGN_STEP;
    if (e > t0 && !ign.done["s" + k]) { ign.done["s" + k] = 1; if (k % 2 === 0) sfx("tick", k); }
    if (e > t0 + IGN_BEAM && !ign.done[x]) { ign.done[x] = 1; pops[x] = t; } });
  if (e > ign.end){ const z = quiz, w = ign.w; ign = null;
    if (z && z.w === w && z.newCons !== null && !core.isFolded(z.newCons)) core.fold(z.newCons, true);
    if (z && z.w === w && ign === null && ignTextFor(z)) fxText = {w, s: ignTextFor(z), t0: t};
    if (z && z.w === w && z.reveal){ z.reveal = false; startReveal(z); }
    refresh(); } }
// ---------- 阶段目标完成：拉远看整片星空 ----------
let reveal = null;
const REVEAL_MS = 4200;
function startReveal(z){ const lines = [];
  if (z.ms.length){ const k = z.ms[z.ms.length - 1], l = k.split(":")[0], e = core.EXAMS.find(x => x.lv === l), n = core.examLit()[l] || 0;
    lines.push(core.msText(k), `${e.name} 已点亮 ${n} / ${core.EXAM_N[l]} · ${Math.floor(n / core.EXAM_N[l] * 100)}%`); }
  else if (z.lvUp){ const LA = core.LV_AT, n = S().lit.length; lines.push(`升到 Lv.${z.lvUp} · ${core.titleOf(z.lvUp)}`, z.lvUp < LA.length ? `一共点亮 ${n} 颗 · 再点亮 ${LA[z.lvUp] - n} 颗升到 Lv.${z.lvUp + 1}` : `一共点亮 ${n} 颗`); }
  else { const g = core.daily(); lines.push("今天的目标完成了！", `今天点亮 ${g.n} 颗 · 一共 ${S().lit.length} 颗`); }
  const t0 = Date.now(), ws = (core.daily().ws || []).filter(w => core.isLit(w) && core.rep(w) === w);
  fxText = null; reveal = {t0, lines, w: z.w, back: {...(glideA ? glideA.to : vb)}}; setSheet(0); fit(true, 1200);
  ws.forEach((x, k) => { pops[x] = t0 + 1100 + k * Math.min(160, 1400 / ws.length); });
  sfx("cons"); }
function endReveal(){ if (!reveal) return; const r = reveal; reveal = null; if (quiz && quiz.done && quiz.w === r.w){ setSheet(1); glide(r.back, 600); } }
function drawReveal(t){ if (!reveal) return; const e = t - reveal.t0; if (e > REVEAL_MS){ endReveal(); return; }
  const c = ctx, a = Math.min(1, Math.max(0, (e - 700) / 400)) * Math.min(1, (REVEAL_MS - e) / 400); if (a <= 0) return;
  const w = Math.min(W - 32, 360), h = 64, x = (W - w) / 2, y = L.map.y + 14;
  c.save(); c.globalAlpha = a; c.shadowColor = "rgba(255,201,92,.45)"; c.shadowBlur = 24; U.box(c, x, y, w, h, 14, "rgba(20,30,52,.92)", "rgba(255,201,92,.6)"); c.restore();
  c.save(); c.globalAlpha = a; U.text(c, reveal.lines[0], W / 2, y + 22, "cn", 17, "lamp", {align: "center", b: 1}); U.text(c, reveal.lines[1], W / 2, y + 46, "cn", 13, "ink", {align: "center"});
  U.text(c, "点一下继续", W / 2, y + h + 14, "cn", 11, "muted", {align: "center"}); c.restore(); }
const ignTextFor = z => { const n = new Set(adj[z.w].filter(e => core.isLit(e.w)).map(e => e.w)).size; return n ? `+${n} 条星光` : ""; };
let fxText = null;
function finishReview(){
  const z = quiz; core.finishReview(z);
  if (z.pair) pop(z.pair);
  if (run && run.ws[run.i] === z.w){ run.res.push({w: z.w, miss: z.miss, giant: z.giant, gain: z.gain, dust: z.dust, pair: z.pair});
    if (z.streak){ toast(`连续 ${z.streak} 天！`); meteor(8); }
    run.i++; while (run.i < run.ws.length && !core.isFading(run.ws[run.i])) run.i++;   // 被关系题顺带擦亮的就跳过
    if (run.i < run.ws.length){ pop(z.w); sfx("tick", 4); refresh(); startQuiz(run.ws[run.i], "review"); return; }
    z.runDone = run; run = null; refresh(); pop(z.w); sfx("cons"); meteor(3); P.vibrate(); toast(praise()); renderPanel(true); return; }
  if (z.goal){ toast(`今日目标完成！星尘 +${core.GOAL_BONUS}`); meteor(8); }
  if (z.streak){ toast(`连续 ${z.streak} 天！`); meteor(8); }
  refresh(); pop(z.w); sfx(z.giant || z.streak ? "cons" : "light"); if (z.giant) meteor(5); else if (z.miss === 0) meteor(1); renderPanel(true);
}
function quitQuiz(){ run = null; clearChain(); quiz = null; clearTimeout(autoT); tapAny = null; refresh(); renderPanel(true); }
function polish(){ const f = core.dueToday(); if (!f.length){ toast("今天的擦亮已经做完了"); return; } if (busy()) { toast("先完成这一轮答题"); return; }
  run = {ws: f.slice(0, core.REVIEW_RUN), i: 0, res: []}; startQuiz(run.ws[0], "review"); }
function askBank(){ if (busy()) { toast("先完成这一轮答题"); return; }
  const lit = new Set(S().lit), keys = Object.keys(core.BANKS);
  const items = keys.map(k => { const b = core.BANKS[k], ws = Object.keys(core.RAW.words).filter(w => b.lv.includes(core.RAW.words[w].lv)), n = ws.filter(w => lit.has(w)).length;
    return `${k === core.BANK ? "✓ " : ""}${b.name} · ${ws.length} 词${n ? ` · 已亮 ${n}` : ""}`; });
  P.actionSheet(items, i => { const k = keys[i]; if (!k || k === core.BANK) return; core.setBank(k); boot(); toast(`已换成 ${core.BANKS[k].name} 词库`); }); }
function buyGuard(){ if (core.buyGuard()) { toast("换到 1 颗守护星"); sfx("ok"); renderPanel(false); } }
function askReset(){
  P.confirm("重新开始？", `会清除已点亮的 ${S().lit.length} 个词和答题记录，不能恢复。`, "清除并重来", () => {
    core.reset(); quiz = null; selected = null; selCons = null; page = null; build(); refresh(); renderPanel(true); }); }

// ---------- 面板内容：先排版成一列块，再逐帧绘制 ----------
let PB = {items: [], h: 0}, pScroll = 0, pVel = 0, scrollTo = null;
const fold = {cons: false, info: false};
const cw = () => W - PAD * 2;
const T = (s, o) => Object.assign({s: String(s)}, o || {});
const Wd = (s, o) => T(s, Object.assign({f: "w"}, o));
function add(h, draw){ PB.items.push({y: PB.h, h, draw}); PB.h += h; }
function gap(h){ PB.h += h; }
function txt(runs, o){ o = o || {}; const Lr = U.layout(ctx, runs, o.w || cw(), o);
  add(Lr.h, (c, x, y) => U.drawLayout(c, Lr, o.align === "center" ? x + cw() / 2 : x, y, o.align)); return Lr; }
function eyebrow(s, right){ add(18, (c, x, y) => { U.text(c, s, x, y + 9, "mono", 11, "muted");
  if (right) right(c, x, y); }); }
function bigWord(w, o){ o = o || {}; const size = o.size || 32; const Lr = U.layout(ctx, [Wd(w, {b: 1, c: o.c || "ink"})], cw(), {size, lh: Math.round(size * 1.18)});
  add(Lr.h, (c, x, y) => { if (o.glow){ c.save(); c.shadowColor = "rgba(255,201,92,.6)"; c.shadowBlur = 24; } U.drawLayout(c, Lr, x, y); if (o.glow) c.restore(); }); }
const ipaRuns = w => [T("/" + D.words[w].ipa + "/", {f: "ipa", c: "muted"})];
function btn(label, kind, fn, o){ o = o || {}; const h = o.h || 46;
  add(h, (c, x, y) => drawBtn(c, x, y, o.w || cw(), h, label, kind, fn, o)); }
// 并排两个按钮
function btns2(list){ add(46, (c, x, y) => { const w = (cw() - 10) / 2; list.forEach(([label, kind, fn], k) => drawBtn(c, x + k * (w + 10), y, w, 46, label, kind, fn, {})); }); }
function drawBtn(c, x, y, w, h, label, kind, fn, o){ {
    const st = { cta: ["lamp", null, "dark"], alt: [null, "rule", "ink"], danger: ["bad", null, "dark"], ghost: [null, "rule", "muted"], dash: [null, "rgba(255,201,92,.5)", "lamp"] }[kind];
    if (kind === "cta" && !o.noGlow){ c.save(); c.shadowColor = "rgba(255,201,92,.35)"; c.shadowBlur = 18; U.box(c, x, y, w, h, 10, st[0]); c.restore(); }
    else U.box(c, x, y, w, h, kind === "ghost" || kind === "dash" ? 8 : 10, st[0], st[1], 1, null);
    pressFx(c, x, y, w, h, 10);
    U.text(c, label, x + (o.left ? 14 : w / 2), y + h / 2, "cn", o.size || (kind === "cta" ? 16 : 14), st[2], {b: kind === "cta", align: o.left ? "left" : "center"});
    hit(x, y, w, h, fn, o.prio); } }
// 一行若干个小按钮，自动换行
function chips(list){ // list: [{runs, border, color, fn}]
  const rows = []; let x = 0, row = [];
  list.forEach(it => { const Lr = U.layout(ctx, it.runs, 9999, {size: 14}); it.L = Lr; it.w = Lr.w + 20;
    if (x + it.w > cw() && row.length){ rows.push(row); row = []; x = 0; } it.x = x; row.push(it); x += it.w + 6; });
  if (row.length) rows.push(row);
  rows.forEach(r => add(36, (c, x0, y) => r.forEach(it => { U.box(c, x0 + it.x, y, it.w, 30, 8, "sky2", it.border || "rule");
    pressFx(c, x0 + it.x, y, it.w, 30, 8); U.drawLayout(c, it.L, x0 + it.x + 10, y + 15 - it.L.h / 2); if (it.fn) hit(x0 + it.x, y, it.w, 30, it.fn); }))); }
const magRuns = w => { const t = core.tierOf(w); return [T(core.MAG[t] + " ", {c: "lamp"}), T("★".repeat(t), {c: "lamp", size: 11}), T("☆".repeat(3 - t), {c: "dim", size: 11}), T(` · ${core.qnOf(w)} 题`, {c: "muted"})]; };
const starRuns = n => [T("★".repeat(n), {c: "lamp", size: 17}), T("★".repeat(3 - n), {c: "dim", size: 17})];
function metaRuns(w){ const cl = core.consLeft(w), r = [];
  if (w === V.luck) r.push(T("✦ 幸运星 星尘翻倍   ", {c: "lamp"}));
  r.push(...magRuns(w), T("   "));
  if (cl === 0) r.push(T("点亮就连成" + CONS[consOf[w]].name + "   ", {c: "lamp"})); else if (cl !== null) r.push(T(CONS[consOf[w]].name + "还差 " + cl + "   ", {c: "muted"}));
  r.push(T(`星尘 +${core.dustFor(w, 1)}~${core.dustFor(w, 3)}`, {c: "muted"}));
  return r; }
function meta(w){ gap(8); txt(metaRuns(w), {size: 13, lh: 20}); }
// 所在片区和进度：「甜点零食」这一片 9 / 15 + 进度条
function subLine(w, lead){ const si = D.words[w].s; if (si === undefined) return; const n = core.subLit(si), N = core.SW[si].length, nm = core.SUBS[si].name;
  add(30, (c, x, y) => { const s0 = (lead || "") + `「${nm}」这一片`; U.text(c, s0, x, y + 10, "cn", 13, "muted");
    U.text(c, `${n} / ${N}`, x + U.measure(c, s0 + "  ", "cn", 13), y + 10, "mono", 13, n === N ? "lamp" : "ink", {b: 1});
    U.box(c, x, y + 22, cw(), 4, 2, "rule"); if (n) U.box(c, x, y + 22, Math.max(4, cw() * n / N), 4, 2, "lamp"); }); }
// 小标签（不能点）：推荐理由
function tags(list){ if (!list.length) return; const rows = []; let x = 0, row = [];
  list.forEach(it => { const w = U.measure(ctx, it.s, "cn", 12) + 16; if (x + w > cw() && row.length){ rows.push(row); row = []; x = 0; } row.push({...it, x, w}); x += w + 6; });
  if (row.length) rows.push(row);
  rows.forEach(r => add(28, (c, x0, y) => r.forEach(it => { U.box(c, x0 + it.x, y, it.w, 22, 11, null, it.gold ? "rgba(255,201,92,.6)" : "rule");
    U.text(c, it.s, x0 + it.x + it.w / 2, y + 11, "cn", 12, it.gold ? "lamp" : "muted", {align: "center"}); }))); }
function whyBlock(w){ const y = core.whyOf(w), last = S().lit[S().lit.length - 1]; gap(10); subLine(w, last && D.words[last].s === D.words[w].s ? "还在" : ""); tags(y.chips.map((s0, k) => ({s: s0, gold: k === 0 && s0.startsWith("核心词")}))); }
function cands(list){
  list.forEach(({w, cl}) => { add(44, (c, x, y) => { const ww = cw(), h = 38;
    U.box(c, x, y, ww, h, 8, "sky2", "rgba(159,216,255,.4)"); pressFx(c, x, y, ww, h, 8);
    U.text(c, w, x + 10, y + h / 2, "w", 15, "ink", {b: 1}); const nw = U.measure(c, w, "w", 15, 1);
    const right = cl === 0 ? "连成星座" : "", t = core.tierOf(w);
    U.text(c, "★".repeat(t), x + ww - 10 - (right ? 64 : 0), y + h / 2, "cn", 11, "lamp", {align: "right"});
    if (right) U.text(c, right, x + ww - 10, y + h / 2, "cn", 12, "lamp", {align: "right"});
    const cn = core.cn1(w), room = ww - nw - 40 - 40 - (right ? 64 : 0);
    if (room > 30) U.text(c, fitStr(c, cn, room, 12), x + 20 + nw, y + h / 2, "cn", 12, "muted");
    hit(x, y, ww, h, () => startQuiz(w, "light")); }); }); }
function fitStr(c, s0, w, size){ if (U.measure(c, s0, "cn", size) <= w) return s0; let s1 = s0; while (s1.length > 1 && U.measure(c, s1 + "…", "cn", size) > w) s1 = s1.slice(0, -1); return s1 + "…"; }
function consRow(i){ const c0 = CONS[i], n = c0.words.filter(core.isLit).length, done = n === c0.words.length;
  add(40, (c, x, y) => { const ww = cw(), h = 34; U.box(c, x, y, ww, h, 8, "sky2", done ? "rgba(255,201,92,.5)" : "rule"); pressFx(c, x, y, ww, h, 8);
    U.text(c, c0.name, x + 10, y + h / 2, "cn", 14, done ? "lamp" : "ink"); U.text(c, `${n} / ${c0.words.length}`, x + ww - 10, y + h / 2, "mono", 12, done ? "lamp" : "muted", {align: "right"});
    hit(x, y, ww, h, () => selectCons(i)); }); }
function foldHead(label, key){ add(40, (c, x, y) => { c.fillStyle = COL.rule; c.fillRect(x, y + 6, cw(), 1);
  U.text(c, label, x, y + 24, "cn", 13, "muted"); U.text(c, fold[key] ? "收起" : "展开", x + cw(), y + 24, "cn", 12, "muted", {align: "right"});
  hit(x, y, cw(), 40, () => { fold[key] = !fold[key]; renderPanel(false); }); }); }
function badge(title, body){ gap(14); const Lt = U.layout(ctx, [T(title, {b: 1, c: "lamp", size: 17})], cw() - 28, {size: 17});
  const Lb = U.layout(ctx, body, cw() - 28, {size: 14, lh: 21});
  add(Lt.h + Lb.h + 30, (c, x, y) => { U.box(c, x, y, cw(), Lt.h + Lb.h + 26, 10, "rgba(255,201,92,.18)", "rgba(255,201,92,.5)");
    U.drawLayout(c, Lt, x + 14, y + 12); U.drawLayout(c, Lb, x + 14, y + 16 + Lt.h); }); }
function exBlock(s){ gap(10); const Lr = U.layout(ctx, [Wd(s, {c: "#cfd6e6"})], cw() - 12, {size: 15, lh: 22});
  add(Lr.h, (c, x, y) => { c.fillStyle = COL.rule; c.fillRect(x, y, 2, Lr.h); U.drawLayout(c, Lr, x + 12, y); }); }
function back(){ gap(14); btn("‹ 返回", "ghost", () => select(null), {w: 76, h: 32, size: 13}); }

function renderPanel(top){
  clearTimeout(autoT); tapAny = null;
  computeLayout();
  PB = {items: [], h: 0};
  if (quiz) quiz.done ? (quiz.mode === "review" ? pReviewDone() : pResult()) : pQuiz();
  else if (page === "level") pLevel();
  else if (selCons !== null) pCons();
  else if (!selected) pHome();
  else pWord();
  // 换页时抽屉自动到合适的高度：首页露一条，看词和结果一半，答题和等级页拉高
  if (top){ pScroll = 0; pVel = 0; scrollTo = null; setSheet(quiz ? (quiz.done ? 1 : 2) : page === "level" ? 2 : (selected || selCons !== null) ? 1 : 0); }
  clampScroll();
}
const maxScroll = () => Math.max(0, PB.h + SHEET_TOP + L.panel.padB - L.panel.h);
function clampScroll(){ pScroll = Math.max(0, Math.min(pScroll, maxScroll())); }

function pHome(){
  const fades = core.dueToday(), cs0 = core.candidates(), lit = core.litArr.length, RN = n => Math.min(core.REVIEW_RUN, n);
  if (weekCard){ const wc = weekCard, n = S().lit.length, lv = core.lvOf(n), top = lv >= core.LV_AT.length;
    badge("新的一周", [T(wc.items.length ? `${wc.lastWeek ? "上周" : "上次以来"}你收获了：` : "新的一周，从这里继续。"),
      ...wc.items.map(([v, t]) => [T("\n"), T(String(v), {c: "lamp", b: 1, f: "mono"}), T(" " + t)]).flat(), T("\n"),
      T(top ? "已经满级了，去把更多星变成恒星吧。" : `这周再点亮 ${core.LV_AT[lv] - n} 颗，就能升到 Lv.${lv + 1}。`, {c: "muted"})]);
    gap(8); btn("开始这一周", "alt", () => { weekCard = null; renderPanel(false); }, {h: 36, size: 13}); gap(18); }
  if (lit === core.WORDS.length){ bigWord("全部点亮！", {c: "lamp", glow: 1, size: 38}); gap(8); }
  const lw = V.luck;
  // 抽屉收起时只露这一块：下一颗词 + 按钮
  if (core.dayDone() && lit){ add(44, (c, x, y) => { U.box(c, x, y, cw(), 40, 10, "rgba(255,201,92,.14)", "rgba(255,201,92,.5)");
    U.text(c, "✓ 今天的目标完成了，可以休息啦", x + 14, y + 20, "cn", 14, "lamp", {b: 1}); }); gap(8); }
  if (!cs0.length && fades.length) btn(`擦亮 ${RN(fades.length)} 颗 · 今天还剩 ${fades.length} 颗`, "cta", polish);
  if (cs0.length){ const w = cs0[0].w;
    eyebrow("下一颗");
    gap(2); txt([Wd(w, {b: 1, size: 28}), T("  /" + D.words[w].ipa + "/", {f: "ipa", c: "muted", size: 15})], {size: 28, lh: 36});
    txt([T(core.cn1(w) + "   ", {c: "ink"}), ...magRuns(w)], {size: 14, lh: 22}); gap(10);
    if (fades.length) btns2([[`擦亮 ${RN(fades.length)} 颗`, "cta", polish], [`点亮 · ${core.qnOf(w)} 题`, "alt", () => startQuiz(w, "light")]]);
    else btn(`做题点亮 · ${core.qnOf(w)} 题`, "cta", () => startQuiz(w, "light"));
    whyBlock(w);
    gap(10); txt([...(fades.length ? [T(`今天还剩 ${fades.length} 颗要擦亮   `, {c: "lamp"})] : []), ...metaRuns(w).slice(magRuns(w).length + (w === V.luck ? 2 : 1))], {size: 13, lh: 20});
    if (lit < 3){ gap(10); txt([T("在星系里随便逛：点任何一颗星都能看到意思、例句和相关的词。想学会哪个，就做题把它点亮。往上拉这块面板可以看到更多。", {c: "muted"})], {size: 14, lh: 21}); }
    if (lw && lw !== w){ gap(12); btn("", "dash", () => startQuiz(lw, "light"), {h: 40}); const it = PB.items[PB.items.length - 1], d0 = it.draw;
      it.draw = (c, x, y) => { d0(c, x, y); U.text(c, "✦ 今天的幸运星", x + 12, y + 20, "cn", 14, "lamp"); U.text(c, lw, x + 12 + U.measure(c, "✦ 今天的幸运星 ", "cn", 14), y + 20, "w", 16, "lamp", {b: 1});
        U.text(c, "星尘翻倍", x + cw() - 12, y + 20, "cn", 12, "muted", {align: "right"}); }; }
    if (cs0.length > 1){ gap(22); eyebrow("也可以选"); gap(8); cands(cs0.slice(1, 7)); } }
  const lc = ALLC.filter(i => CONS[i].words.some(core.isLit)), frac = i => CONS[i].words.filter(core.isLit).length / CONS[i].words.length;
  const cs = lc.sort((a, b) => frac(b) - frac(a)).slice(0, 30), done = ALLC.filter(core.consDone).length;
  gap(14); foldHead(`星座 ${done} / ${ALLC.length}`, "cons");
  if (fold.cons){ if (cs.length) cs.forEach(consRow); else txt([T("点亮几颗星以后，这里会列出正在连的星座。", {c: "muted"})], {size: 13, lh: 20}); }
  foldHead("说明与记录", "info");
  if (fold.info){
    txt([T(`拖动或双指缩放地图，所有单词都在这一整张星空里。越亮越大的星越重要，题目也越多。点亮的词过几天会变暗，答 1 题就能擦亮。点亮的星会发热，学得越多，星空越暖。`)], {size: 13, lh: 20, c: "muted"});
    gap(8); txt([].concat(...core.TYPE_ORDER.map(t => [T("▬ ", {c: t}), T(TYPES[t].name + "   ", {c: "muted"})])), {size: 12, lh: 20});
    gap(8); txt([T(`正确率 ${S().answered ? Math.round(S().correct / S().answered * 100) + "%" : "—"} · 最高连击 ${S().best} · 星座 ${done} / ${core.NCONS}`)], {size: 13, lh: 20, c: "muted"});
    gap(8); txt([T(`${APP_NAME} v${VERSION} · 当前词库 ${core.BANKS[core.BANK].name}，共 ${core.WORDS.length} 词。词表按剑桥 A2 Key（KET）、B1 Preliminary（PET）和 B2 First（FCE）的范围整理；例句为原创。`)], {size: 13, lh: 20, c: "muted"});
    gap(12); soundBtn(); gap(10); btn("重新开始", "ghost", askReset, {w: 90, h: 32, size: 13});
  }
}
const ST_NAME = {lit: "已学会", ready: "未学会", locked: "未解锁"};
function relList(w){
  const es = adj[w].slice().sort((a, b) => core.TYPE_ORDER.indexOf(a.t) - core.TYPE_ORDER.indexOf(b.t) || (core.isLit(b.w) - core.isLit(a.w)) || (a.w < b.w ? -1 : 1));
  if (!es.length) return;
  gap(22); eyebrow(`相关单词 · ${es.length}`); gap(6);
  es.forEach(e => { const st = core.status(e.w);
    const Lr = U.layout(ctx, [T(TYPES[e.t].name + "  ", {c: e.t}), Wd(e.w, {c: st === "lit" ? "lamp" : "ink", b: 1}), T("  " + core.cn1(e.w), {c: "ink"}), T("  " + ST_NAME[st], {c: st === "lit" ? "lamp" : "muted", size: 11}), T("\n"), T(e.note, {c: "muted"})], cw() - 12, {size: 13, lh: 20});
    add(Lr.h + 10, (c, x, y) => { c.fillStyle = COL[e.t]; c.globalAlpha = .7; c.fillRect(x, y + 2, 2, Lr.h - 4); c.globalAlpha = 1;
      U.drawLayout(c, Lr, x + 10, y); hit(x, y - 2, cw(), Lr.h + 6, () => select(e.w)); }); }); }
function pWord(){
  const w = selected, d = D.words[w], s = core.status(w);
  bigWord(w); txt(ipaRuns(w), {size: 17});
  gap(8); txt([T(d.cn)], {size: 18, lh: 26}); gap(6); subLine(w); exBlock(d.ex);
  if (s !== "lit"){ meta(w); gap(16); btn(`做题点亮 · ${core.qnOf(w)} 题`, "cta", () => startQuiz(w, "light")); }
  else {
    gap(10); txt([...starRuns(S().stars[w] || 3), ...(core.isGiant(w) ? [T("  恒星", {c: "cream", b: 1, size: 13})] : []), T("   " + core.dueText(w), {c: "muted", size: 13})], {size: 13, lh: 24});
    if (core.isFading(w)){ gap(14); btn("擦亮它 · 1 题", "cta", () => startQuiz(w, "review")); }
    else if ((S().stars[w] || 3) < 3){ gap(14); btn("再答 1 题，多拿一颗星", "alt", () => startQuiz(w, "review")); }
  }
  relList(w);
  const ci = consOf[w];
  if (ci !== undefined){ gap(18); consRow(ci); }
  back();
}
function soundBtn(){ btn(S().mute ? "音效：关" : "音效：开", "ghost", () => { S().mute = !S().mute; core.save(); if (!S().mute) sfx("ok"); renderPanel(false); }, {w: 100, h: 32, size: 13}); }
function pLevel(){
  const n = S().lit.length, lv = core.lvOf(n), LA = core.LV_AT, top = lv >= LA.length, ex = core.examLit(), ms = S().ms || {}, sms = S().sms || {};
  const bar = (k) => add(10, (c, x, y) => { U.box(c, x, y + 2, cw(), 6, 3, "rule"); U.box(c, x, y + 2, Math.max(6, cw() * Math.min(1, k)), 6, 3, "lamp"); });
  add(40, (c, x, y) => { const lt = `Lv.${lv}`, bw = U.measure(c, lt, "mono", 15, 1) + 18; U.box(c, x, y + 4, bw, 30, 8, "lamp");
    U.text(c, lt, x + bw / 2, y + 19, "mono", 15, "dark", {align: "center", b: 1}); U.text(c, core.titleOf(lv), x + bw + 12, y + 19, "cn", 20, "ink", {b: 1}); });
  gap(6); bar(top ? 1 : (n - LA[lv - 1]) / (LA[lv] - LA[lv - 1]));
  gap(8); txt([T(top ? "已经满级了！" : `再点亮 `), ...(top ? [] : [T(String(LA[lv] - n), {c: "lamp", b: 1}), T(` 颗升到 Lv.${lv + 1}${core.titleOf(lv + 1) !== core.titleOf(lv) ? " · " + core.titleOf(lv + 1) : ""}。`)]),
    T(`一共点亮了 ${n} 个词，其中 `), T(String(core.giantCount()), {c: "lamp", b: 1}), T(" 颗恒星，它们之间连成了 "), T(String(linkCount()), {c: "lamp", b: 1}), T(" 条线。")], {size: 14, lh: 21});
  core.EXAMS.filter(e => core.LVS.includes(e.lv) || ex[e.lv]).forEach(e => { const k = ex[e.lv] || 0, t = core.EXAM_N[e.lv];
    gap(16); add(22, (c, x, y) => { U.text(c, e.name, x, y + 10, "w", 15, "ink", {b: 1}); U.text(c, e.note, x + U.measure(c, e.name + " ", "w", 15, 1), y + 10, "w", 12, "muted");
      U.text(c, `${k} / ${t} · ${Math.floor(k / t * 100)}%`, x + cw(), y + 10, "mono", 12, "muted", {align: "right"}); });
    bar(k / t);
    gap(4); txt(core.QUARTERS.map(q => { const key = e.lv + ":" + q, on = key in ms; return T(`${on ? "★" : "☆"} ${q}%${ms[key] ? " · " + core.mdText(ms[key]) : ""}    `, {c: on ? "lamp" : "muted"}); }), {size: 12, lh: 18}); });
  gap(14); txt([T("每日目标  "), T(`今天已点亮 ${core.daily().n} 颗`, {c: "muted", size: 12})], {size: 14, lh: 22}); gap(4);
  chips(core.GOALS.map(n => ({runs: [T(`${n} 颗`, {c: core.goalOf() === n ? "lamp" : "ink", b: core.goalOf() === n})], border: core.goalOf() === n ? "rgba(255,201,92,.7)" : "rule",
    fn: () => { core.setGoal(n); renderPanel(false); }})));
  txt([T(`擦亮每轮 ${core.REVIEW_RUN} 颗，每天最多提醒 ${core.REVIEW_CAP} 颗，多的明天再来。`, {c: "muted"})], {size: 12, lh: 18});
  gap(10); txt([T("星尘 "), T(String(S().dust), {c: "lamp", b: 1, f: "mono"}), T("   可以换提示卡和守护星", {c: "muted", size: 12})], {size: 14, lh: 22});
  gap(18); const sn = core.streakNow(), g = S().guard || 0;
  txt([T("连续 "), T(String(sn), {c: "lamp", b: 1, size: 18}), T(" 天", {}), T(`  · 最长 ${Math.max(S().streak && S().streak.best || 0, sn)} 天`, {c: "muted", size: 12})], {size: 14, lh: 24});
  gap(2); txt(core.STREAK_MS.slice(0, 6).map(m => T(`${m in sms ? "★" : "☆"} ${m}天   `, {c: m in sms ? "lamp" : "muted"})), {size: 12, lh: 18});
  gap(10); txt([T("守护星 "), T("◆".repeat(g), {c: "lamp"}), T("◇".repeat(core.GUARD_MAX - g), {c: "dim"})], {size: 14, lh: 22});
  gap(6); if (g >= core.GUARD_MAX) btn("已经存满", "ghost", () => {}, {h: 34, size: 13});
  else btn(`${core.GUARD_COST} 星尘换 1 颗守护星`, S().dust >= core.GUARD_COST ? "alt" : "ghost", () => { if (S().dust < core.GUARD_COST) toast(`星尘不够，需要 ${core.GUARD_COST}`); else buyGuard(); }, {h: 34, size: 13});
  gap(8); txt([T(`每天点亮或擦亮 1 颗星就算连续。守护星最多存 ${core.GUARD_MAX} 颗，哪天没来会自动用掉 1 颗，连续天数不会断。`, {c: "muted"})], {size: 12, lh: 18});
  gap(12); txt([T(`星座 ${ALLC.filter(core.consDone).length} / ${core.NCONS} · 正确率 ${S().answered ? Math.round(S().correct / S().answered * 100) + "%" : "—"} · 最高连击 ${S().best}`, {c: "muted"})], {size: 12, lh: 18});
  gap(14); txt([T("词库  "), T(core.BANKS[core.BANK].name, {c: "lamp", b: 1, f: "mono"}), T(`  共 ${core.WORDS.length} 词`, {c: "muted", size: 12})], {size: 14, lh: 22});
  gap(6); btn("换词库", "ghost", askBank, {w: 90, h: 34, size: 13});
  gap(12); if (n) { btn("把我的星空发给爸妈或同学", "alt", () => P.shareNow(shareInfo), {h: 40, size: 14}); gap(12); }
  soundBtn();
  gap(14); btn("‹ 返回", "ghost", () => { page = null; renderPanel(true); }, {w: 76, h: 32, size: 13});
}
function pCons(){
  const i = selCons, c0 = CONS[i], done = core.consDone(i), f = core.isFolded(i), n = c0.words.filter(core.isLit).length;
  eyebrow(`星座 · ${n} / ${c0.words.length}`); gap(4);
  txt([T(c0.name, {b: 1})], {size: 30, lh: 38});
  gap(8); txt([T(done ? c0.note : "把这些词全部点亮，就能连成这个星座。", {c: done ? "#cfd6e6" : "muted"})], {size: 14, lh: 21});
  gap(16); chips(c0.words.map(w => { const st = core.status(w);
    return {runs: [Wd(w, {c: st === "lit" ? "lamp" : "ink"}), ...(core.isLit(w) ? [T(" " + "★".repeat(S().stars[w] || 3), {c: "lamp", size: 11})] : [])],
      border: st === "lit" ? "rgba(255,201,92,.55)" : st === "ready" ? "rgba(159,216,255,.4)" : "rule", fn: () => select(w)}; }));
  if (done){ gap(10); btn(f ? "展开星座" : "收起成一颗大星", "alt", () => { core.fold(i, !f); refresh(); renderPanel(false); }); }
  back();
}
function pQuiz(){
  const z = quiz, w = z.w, q = z.qs[z.i], N = z.qs.length;
  const right = z.picked !== null && q.opts[z.picked].key === q.answer;
  add(30, (c, x, y) => {
    const head = z.mode === "review" ? (run ? `擦亮 ${run.i + 1} / ${run.ws.length}` : `擦亮 ${w}`) : `挑战 ${w}`;
    U.text(c, head, x, y + 14, "mono", 12, "muted");
    if (S().combo >= 2) U.text(c, `连击 ×${S().combo}`, x + U.measure(c, head, "mono", 12) + 10, y + 14, "mono", 12, "lamp");
    const pw = 22, px = x + cw() - 40 - N * (pw + 6);
    for (let k = 0; k < N; k++){ const cl = k < z.i ? "good" : k === z.i ? (z.picked === null ? "ready" : right ? "good" : "bad") : "rule";
      U.box(c, px + k * (pw + 6), y + 11, pw, 6, 3, cl); }
    U.text(c, "✕", x + cw() - 8, y + 14, "cn", 16, "muted", {align: "right"});
    hit(x + cw() - 40, y - 6, 48, 42, quitQuiz, true); });
  if (q.conf && z.conf && z.picked === null){ gap(8); const Lw = U.layout(ctx, [T("容易混：上次你把 ", {c: "#ffb38a"}), Wd(w, {b: 1, c: "#ffd2b8"}), T(" 选成了 ", {c: "#ffb38a"}), Wd(z.conf, {b: 1, c: "#ffd2b8"})], cw() - 24, {size: 13, lh: 20});
    add(Lw.h + 14, (c, x, y) => { U.box(c, x, y, cw(), Lw.h + 12, 10, "rgba(255,140,90,.12)", "rgba(255,140,90,.5)"); U.drawLayout(c, Lw, x + 12, y + 6); }); }
  gap(10); txt(q.q, {size: 18, lh: 27});
  if (q.sent){ gap(4); txt(q.sent, {size: 19, lh: 28, f: q.gen === "spell" ? "cn" : "w"}); }
  gap(12);
  q.opts.forEach((o, k) => {
    const cut = q.cut && q.cut.includes(k) && z.picked === null;
    const lw = cw() - 28, Lr = U.layout(ctx, [T(o.label, {f: o.en ? "w" : "cn", strike: cut})], lw - (z.picked !== null && q.showCn ? 90 : 0), {size: o.en ? 18 : 16, lh: 24});
    const cn = z.picked !== null && q.showCn && D.words[o.key] ? D.words[o.key].cn : "";
    const Lc = cn ? U.layout(ctx, [T(cn, {c: "muted"})], 110, {size: 13, lh: 18}) : null;
    const h = Math.max(H < 700 ? 44 : 50, Lr.h + (H < 700 ? 18 : 24), Lc ? Lc.h + 16 : 0);
    add(h + 8, (c, x, y) => {
      let fill = "sky2", stroke = "rule";
      if (z.picked !== null){ if (o.key === q.answer){ fill = "rgba(127,224,163,.12)"; stroke = "good"; } else if (k === z.picked){ fill = "rgba(255,125,143,.12)"; stroke = "bad"; } }
      c.save(); if (cut) c.globalAlpha = .28;
      U.box(c, x, y, cw(), h, 10, fill, stroke, z.picked !== null && (o.key === q.answer || k === z.picked) ? 1.5 : 1);
      if (z.picked === null && !cut) pressFx(c, x, y, cw(), h, 10);
      U.drawLayout(c, Lr, x + 14, y + h / 2 - Lr.h / 2);
      if (Lc) U.drawLayout(c, Lc, x + cw() - 14, y + h / 2 - Lc.h / 2, "right");
      c.restore();
      if (z.picked === null && !cut) hit(x, y, cw(), h, () => answer(k)); });
  });
  if (z.picked !== null && right && !z.why){
    // 答对：只闪一下，0.8 秒后自动下一题；解析折起来，想看再点
    gap(6); add(40, (c, x, y) => { U.box(c, x, y, cw(), 40, 10, "rgba(127,224,163,.12)", "rgba(127,224,163,.45)");
      U.text(c, "答对了！", x + 14, y + 20, "cn", 15, "good", {b: 1});
      U.text(c, "为什么 ›", x + cw() - 14, y + 20, "cn", 13, "muted", {align: "right"});
      hit(x + cw() - 100, y - 4, 100, 48, () => { clearTimeout(autoT); tapAny = null; z.why = true; renderPanel(false); }, true); });
    gap(8); add(4, (c, x, y) => { U.box(c, x, y, cw(), 3, 2, "rule"); const k = Math.min(1, (Date.now() - autoStart) / AUTO_MS); U.box(c, x, y, cw() * k, 3, 2, "good"); });
    autoStart = Date.now(); autoT = setTimeout(nextQ, AUTO_MS); tapAny = nextQ;
  } else if (z.picked !== null){
    gap(6); const Lr = U.layout(ctx, [T(right ? "答对了。" : "答错了。", {b: 1, c: right ? "good" : "bad"}), T(" "), ...q.explain], cw() - 28, {size: 14, lh: 21});
    add(Lr.h + 24, (c, x, y) => { U.box(c, x, y, cw(), Lr.h + 24, 10, "sky2"); U.drawLayout(c, Lr, x + 14, y + 12); });
    if (right){ gap(12); btn(z.i < z.qs.length - 1 ? "下一题 ›" : "完成 ›", "cta", nextQ); }
    else { gap(14); btn("再答一次", "cta", () => { core.retry(quiz); renderPanel(true); }); }
  } else {
    if (!q.cut && S().dust >= core.HINT_COST){ gap(6); btn(`提示卡：去掉两个错误选项 · 星尘 ${core.HINT_COST}`, "dash", () => { if (core.useHint(quiz)) { refresh(); renderPanel(false); } }, {h: 34, size: 13, left: 1}); }
    if (z.miss){ gap(10); txt([T(`答错 ${z.miss} 次，这颗星会暗一些。`)], {size: 13, c: "muted"}); }
  }
}
function streakBadge(n){ const nx = core.STREAK_MS.find(m => m > n);
  badge(n >= 365 ? "连续一整年！" : `连续 ${n} 天！`, [T(`你已经连续 ${n} 天来点亮星星了。每天哪怕只点亮或擦亮 1 颗，连续天数就不会断。`),
    T("\n"), T((nx ? `下一个里程碑：${nx} 天。` : "") + ((S().guard || 0) < core.GUARD_MAX ? `点顶栏的等级，可以用 ${core.GUARD_COST} 星尘换守护星。` : ""), {c: "muted", size: 12})]); }
function stageBadges(z){
  if (z.streak) streakBadge(z.streak);
  if (z.ms.length){ const k = z.ms[z.ms.length - 1], l = k.split(":")[0], n = core.examLit()[l] || 0, e = core.EXAMS.find(x => x.lv === l);
    badge(core.msText(k), [T(`${e.note} 的 ${core.EXAM_N[l]} 个词里，你已经点亮了 ${n} 个。`), T("\n"), T(`${core.mdText(core.today())}达成 · 点顶栏的等级可以看到所有里程碑。`, {c: "muted", size: 12})]); }
  if (z.lvUp){ const LA = core.LV_AT, a = LA[z.lvUp - 2], b = LA[z.lvUp - 1], ws = S().lit.slice(a, b);
    const avg = ws.length ? (ws.reduce((s0, w) => s0 + (S().stars[w] || 3), 0) / ws.length).toFixed(1) : "—", nt = core.titleOf(z.lvUp) !== core.titleOf(z.lvUp - 1);
    badge(`升到 Lv.${z.lvUp} · ${core.titleOf(z.lvUp)}${nt ? "（新称号）" : ""}`, [T(`这一级点亮了 ${ws.length} 个词，平均 ${avg} 颗星。`), T("\n"),
      Wd(ws.slice(-12).join(" · ") + (ws.length > 12 ? " …" : ""), {c: "#cfd6e6", size: 13}),
      ...(z.lvUp < LA.length ? [T("\n"), T(`再点亮 ${LA[z.lvUp] - S().lit.length} 颗升到 Lv.${z.lvUp + 1}。`, {c: "muted", size: 12})] : [])]); } }
// 连着点亮时的简短结果：星数、星尘，下面一条进度，马上接下一个词
function pChain(){ const z = quiz, w = z.w;
  eyebrow(z.lucky ? "点亮成功 · ✦ 幸运星翻倍" : "点亮成功"); bigWord(w, {c: "lamp", glow: 1, size: 34});
  txt([...starRuns(z.stars), T("   " + core.cn1(w) + "   ", {c: "ink", size: 14}), T("星尘 +" + z.dust, {c: "lamp", f: "mono", size: 12})], {size: 13, lh: 26});
  gap(12); add(48, (c, x, y) => { const k = Math.min(1, (Date.now() - z.chainT0) / CHAIN_MS);
    U.box(c, x, y, cw(), 48, 10, "sky2", "rgba(255,201,92,.45)"); U.box(c, x, y + 45, cw() * k, 3, 2, "lamp");
    U.text(c, "下一颗", x + 14, y + 24, "cn", 13, "muted"); U.text(c, z.chain, x + 14 + U.measure(c, "下一颗 ", "cn", 13), y + 24, "w", 17, "ink", {b: 1});
    U.text(c, "›", x + cw() - 16, y + 24, "cn", 20, "lamp", {align: "right"}); });
  // 写出下一颗和刚点亮的词（或别的已点亮的词）是什么关系
  { let a = w, e = relOf(w, z.chain); if (!e){ const e2 = adj[z.chain].find(x => x.t !== "topic" && core.isLit(x.w)) || adj[z.chain].find(x => core.isLit(x.w)); if (e2){ a = e2.w; e = e2; } }
    if (e){ gap(8); txt([T("顺着线学  ", {c: "muted"}), T("▬ ", {c: e.t}), Wd(a, {b: 1}), T(" 和 "), Wd(z.chain, {b: 1}), T(" " + REL_SAY[e.t], {c: e.t})], {size: 14, lh: 22}); } }
  gap(8); subLine(z.chain, D.words[z.chain].s === D.words[w].s ? "还在" : "下一片：");
  gap(6); btn("停一下", "ghost", () => { clearChain(); renderPanel(false); }, {w: 90, h: 32, size: 13, prio: true});
  tapAny = goChain; }
const REL_SAY = {sound: "读音很像", form: "长得很像", syn: "意思相近", ant: "意思相反", root: "是同一个词根", coll: "常搭配在一起", topic: "是同一个话题", hyper: "是一类"};
const relOf = (a, b) => adj[a].find(e => e.w === b && e.t !== "topic") || adj[a].find(e => e.w === b);
const linkCount = () => { let n = 0; D.edges.forEach(([a, b]) => { if (core.isLit(a) && core.isLit(b)) n++; }); return n; };
function pResult(){
  const z = quiz, w = z.w, c0 = z.newCons !== null ? CONS[z.newCons] : null, cs0 = core.candidates(new Set(z.unlocked));
  if (z.chain) return pChain();
  eyebrow("点亮成功"); bigWord(w, {c: "lamp", glow: 1, size: 40});
  txt([...starRuns(z.stars), T("   星尘 +" + z.dust, {c: "lamp", f: "mono", size: 12})], {size: 13, lh: 26});
  txt(ipaRuns(w), {size: 17}); gap(6); txt([T(D.words[w].cn)], {size: 18, lh: 26}); exBlock(D.words[w].ex);
  stageBadges(z);
  if (z.lucky) badge("✦ 幸运星", [T("今天的幸运星，星尘翻倍。")]);
  if (c0) badge("新星座：" + c0.name, [T(c0.note), T("\n"), T("已收起成一颗大星，点它可以展开。", {c: "muted"})]);
  if (z.subDone !== null){ const nm = core.SUBS[z.subDone].name, N = core.SW[z.subDone].length; badge(`「${nm}」这一片学完了`, [T(`${N} 个词全部点亮，这片星空亮起了金色光晕。`)]); }
  if (z.goal) goalBadge();
  if (z.goal || z.lvUp || z.ms.length || z.streak) shareBtn();
  if (z.goal && core.dueToday().length){ gap(16); btn(`擦亮 ${Math.min(core.REVIEW_RUN, core.dueToday().length)} 颗 · 今天还剩 ${core.dueToday().length} 颗`, "cta", polish); }
  else if (cs0.length){ const t = cs0[0]; gap(16);
    btn(`继续：${t.w} · ${core.qnOf(t.w)} 题`, z.goal ? "alt" : "cta", () => startQuiz(t.w, "light")); whyBlock(t.w);
    if (cs0.length > 1){ gap(20); eyebrow("也可以选"); gap(8); cands(cs0.slice(1, 5)); } }
  else { gap(16); btn("回到星图", "alt", () => { quiz = null; select(null); }); }
}
// 今日目标完成：告诉孩子今天可以收尾了
function goalBadge(){ const g = core.daily(), left = core.dueToday().length;
  badge("今天的目标完成了！", [T(`新点亮 ${g.n} 颗${g.p ? `，擦亮 ${g.p} 颗` : ""}，星尘 +${core.GOAL_BONUS}。`), T("\n"),
    T(left ? `再擦亮 ${left} 颗，今天就全部完成。` : "今天可以休息啦，明天再来。想多学也可以继续点亮。", {c: "muted", size: 13})]); }
// 一轮擦亮（5 颗）的小结
function pRunDone(){ const z = quiz, R = z.runDone, okN = R.res.filter(r => !r.miss).length, gi = R.res.filter(r => r.giant).length, dust = R.res.reduce((a, r) => a + r.dust, 0), left = core.dueToday().length;
  eyebrow("擦亮完成"); txt([T(`${R.res.length} 颗都亮了`, {b: 1, c: "lamp"})], {size: 30, lh: 40});
  txt([T(`${okN} 颗一次答对`), ...(gi ? [T(` · 新恒星 ${gi} 颗`, {c: "cream", b: 1})] : []), ...(dust ? [T(`   星尘 +${dust}`, {c: "lamp", f: "mono", size: 12})] : [])], {size: 14, lh: 24});
  gap(10); chips(R.res.map(r => ({runs: [Wd(r.w, {c: r.giant ? "cream" : "lamp"}), T(r.miss ? "" : " ✓", {c: "good", size: 12})], border: r.giant ? "rgba(214,232,255,.6)" : "rgba(255,201,92,.45)", fn: () => select(r.w)})));
  { const own = new Set(R.res.map(r => r.w)), ps = [...new Set(R.res.filter(r => r.pair && !own.has(r.pair)).map(r => r.pair))]; if (ps.length){ gap(4); txt([T("答对关系题，顺带擦亮了 ", {c: "muted"}), ...ps.map((x, k) => [T(k ? "、" : ""), Wd(x, {c: "lamp", b: 1})]).flat()], {size: 13, lh: 20}); } }
  if (z.streak) streakBadge(z.streak);
  gap(14);
  if (left) btn(`再擦亮 ${Math.min(core.REVIEW_RUN, left)} 颗 · 今天还剩 ${left} 颗`, "cta", polish);
  else if (core.dayDone()) { goalBadge(); shareBtn(); gap(12); btn("回到星图", "alt", () => { quiz = null; select(null); }); }
  else { const c = core.candidates(); if (c.length) btn(`继续点亮：${c[0].w} · ${core.qnOf(c[0].w)} 题`, "cta", () => startQuiz(c[0].w, "light")); else btn("回到星图", "alt", () => { quiz = null; select(null); }); } }
function pReviewDone(){
  if (quiz.runDone) return pRunDone();
  const z = quiz, w = z.w, d = Math.round((S().mem[w].due - core.now()) / 864e5), f = core.dueToday();
  eyebrow("擦亮成功"); bigWord(w, {c: "lamp", glow: 1, size: 40});
  txt([...starRuns(S().stars[w] || 3), ...(z.dust ? [T("   星尘 +" + z.dust, {c: "lamp", f: "mono", size: 12})] : [])], {size: 13, lh: 26});
  txt([T(D.words[w].cn)], {size: 18, lh: 26});
  const note = (z.gain ? "一次答对，多了一颗星！" : "") + (z.wasDue ? `下次 ${d} 天后再来看看它。` : "") + (z.near ? "再擦亮一次就成为恒星。" : "");
  if (note){ gap(6); txt([T(note)], {size: 13, c: "muted"}); }
  if (z.streak) streakBadge(z.streak);
  if (z.giant) badge(`新恒星：${w}`, [T(`它已经通过 ${core.GIANT_LV} 轮复习，算是真正记住了。现在一共有 ${core.giantCount()} 颗恒星。`), T("\n"), T(`恒星 ${core.INTERVALS[core.GIANT_LV]} 天才需要擦亮一次；答错会退回普通星。`, {c: "muted", size: 12})]);
  gap(16);
  if (core.dueToday().length) btn(`擦亮 ${Math.min(core.REVIEW_RUN, core.dueToday().length)} 颗 · 今天还剩 ${core.dueToday().length} 颗`, "cta", polish);
  else { const c = core.candidates(); if (c.length) btn(`继续：${c[0].w} · ${core.qnOf(c[0].w)} 题`, "cta", () => startQuiz(c[0].w, "light"));
    else btn("回到星图", "alt", () => { quiz = null; select(null); }); }
}

// ---------- 提示、提醒、音效 ----------
const TIPS = {
  first:  "点任何一颗星看看它的意思。点<b>做题点亮</b>，答对几道题就能点亮它。",
  stars:  "点亮了！一次全对得 <b>3 颗星</b>，答错会暗一些。拿到的<b>星尘</b>可以换提示卡。",
  choose: "想学哪个词都可以：在星图上点它，或者从推荐里挑。<b>越亮越大的星</b>越重要，题目也越多。",
  hint:   "星尘够了！答题时可以用<b>提示卡</b>去掉两个错误选项。",
  cons:   "连成<b>星座</b>了！它已经收起成一颗大星，点它可以展开。",
  fav:    "喜欢的话，点右上角 <b>···</b>，选<b>添加到我的小程序</b>，明天更好找到。",
  fade:   "有的星<b>变暗</b>了，说明该复习了。每轮擦亮 <b>5 颗</b>，一颗只要答 1 题。"
};
const tipQ = [];
function tip(key){ if (!S().tips) S().tips = {}; if (S().tips[key] || tipQ.includes(key)) return; tipQ.push(key); }
function closeTip(){ const k = tipQ.shift(); if (k){ S().tips[k] = 1; core.save(); } }
let toastMsg = null, toastT = 0;
function toast(m){ toastMsg = m; toastT = Date.now(); }
function sfx(kind, n){ if (S().mute) return; const AC = P.audio(); if (!AC) return;
  try { if (AC.state === "suspended" && AC.resume) AC.resume();
    const seq = {ok:[[880,0],[1319,.07]], bad:[[220,0],[175,.12]], light:[[523,0],[659,.08],[784,.16],[1047,.24]], cons:[[523,0],[659,.1],[784,.2],[1047,.3],[1568,.42]], tick:[[[1175,1319,1568,1760,2093,2349][Math.min(5, Math.floor((n || 0) / 2))],0]]}[kind];
    const t0 = AC.currentTime;
    seq.forEach(([f, dt]) => { const o = AC.createOscillator(), g = AC.createGain();
      o.type = kind === "bad" ? "triangle" : "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + dt); g.gain.exponentialRampToValueAtTime(kind === "bad" ? 0.12 : kind === "tick" ? 0.035 : 0.09, t0 + dt + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.28);
      o.connect(g); g.connect(AC.destination); o.start(t0 + dt); o.stop(t0 + dt + 0.3); }); } catch(e){} }

// ---------- 动画效果 ----------
const pops = {}, sparks = [], meteors = [];
function pop(w){ pops[w] = Date.now(); }
function meteor(n){ const t = Date.now(); for (let k = 0; k < n; k++) meteors.push({t0: t + k * 180, x: .4 + Math.random() * .6, y: .1 + Math.random() * .35}); }

// ---------- 绘制 ----------
let hits = [], press = null;
function hit(x, y, w, h, fn, prio){ const cl = drawClip; if (cl){ const x2 = Math.min(x + w, cl.x + cl.w), y2 = Math.min(y + h, cl.y + cl.h); x = Math.max(x, cl.x); y = Math.max(y, cl.y); w = x2 - x; h = y2 - y; if (w <= 0 || h <= 0) return; }
  hits.push({x, y, w, h, fn, prio}); }
function pressFx(c, x, y, w, h, r){ if (!press || press.moved) return; const p = press; let px = p.x, py = p.y;
  if (drawClip === L.panel) py += 0; // 面板内坐标已经换算到屏幕
  if (px >= x && px <= x + w && py >= y && py <= y + h){ U.box(c, x, y, w, h, r, "rgba(255,255,255,.07)"); } }
let drawClip = null;
let skyCanvas = null;
function makeSky(){ const m = L.map; skyCanvas = P.offscreen(Math.round(m.w * dpr), Math.round(m.h * dpr)); skyCanvas.mh = m.h; const x = skyCanvas.getContext("2d"); x.scale(dpr, dpr);
  const gr = x.createRadialGradient(m.w * .3, m.h * .2, 0, m.w * .3, m.h * .2, Math.max(m.w, m.h) * .9);
  gr.addColorStop(0, "#16213d"); gr.addColorStop(.6, COL.sky); gr.addColorStop(1, COL.sky); x.fillStyle = gr; x.fillRect(0, 0, m.w, m.h);
  let sd = 11; const rn = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < m.w * m.h / 2600; k++){ x.globalAlpha = .15 + rn() * .45; x.fillStyle = rn() < .15 ? "#ffe6b0" : "#cfd8ff";
    x.beginPath(); x.arc(rn() * m.w, rn() * m.h, rn() < .92 ? .7 : 1.3, 0, 7); x.fill(); } }

// 星图分两层：静态层（热力场、亮线、星点）画进离屏画布，视野和状态不变就直接贴图；动态层（选中、动画、名字）每帧画
let mapLayer = null, mapKey = "", mapVer = 0, statN = 0, mapV = null;
const NEAR_COL = ["#6a624f", "#7d7259", "#97855f"], DIM_COL = ["#46537a", "#57658f", "#6673a0"];
function geo(){ const v = view(), s = v.s, k = Math.min(1.5, Math.max(.45, 1 / s));
  return {v, s, k, far: s > 2.2, Z: x => x * k * s, PX: x => x * s}; }
function worldTf(c, v, sx0, sy0, d){ const m = L.map; d = d || dpr; c.setTransform(d / v.s, 0, 0, d / v.s, d * (m.x - (sx0 || 0) - v.ox / v.s), d * (m.y - (sy0 || 0) - v.oy / v.s)); }
const toScr = (p, v) => ({x: L.map.x + (p.x - v.ox) / v.s, y: L.map.y + (p.y - v.oy) / v.s});
function litR(w, Z){ const T0 = core.tierOf(w), st = S().stars[w] || 3; return Z(3 + T0 * 1.05) * (st === 1 ? .8 : 1); }
function drawStatic(c, G){ statN++;
  const {v, s, k, far, Z, PX} = G, m = L.map, MX = G.MX, MY = G.MY;
  const wx0 = v.ox - (40 + MX) * s, wy0 = v.oy - (40 + MY) * s, wx1 = v.ox + (m.w + MX + 40) * s, wy1 = v.oy + (m.h + MY + 40) * s;
  const inV = p => p.x > wx0 && p.x < wx1 && p.y > wy0 && p.y < wy1, skip = ign ? ign.w : null;
  worldTf(c, v, m.x - MX, m.y - MY, LD); c.lineCap = "round";
  // 热力场（手机屏幕小，调淡一半，让星星的颜色更显眼）
  if (heat){ const a = Math.min(1, (Date.now() - heatT0) / 600); c.imageSmoothingEnabled = true;
    if (heatPrev && a < 1){ c.globalAlpha = (1 - a) * HEAT_A; c.drawImage(heatPrev.c, heatPrev.x, heatPrev.y, heatPrev.w, heatPrev.h); }
    c.globalAlpha = a * HEAT_A; c.drawImage(heat.c, heat.x, heat.y, heat.w, heat.h); c.globalAlpha = 1;
    if (goldF){ c.globalAlpha = a; c.drawImage(goldF.c, goldF.x, goldF.y, goldF.w, goldF.h); c.globalAlpha = 1; } }
  // 完成的星座：一层暖光
  if (V.consE.length){ c.beginPath(); V.consE.forEach(([a, b]) => { c.moveTo(POS[a].x, POS[a].y); c.lineTo(POS[b].x, POS[b].y); });
    c.globalAlpha = .12; c.strokeStyle = COL.lamp; c.lineWidth = PX(6); c.stroke(); c.globalAlpha = 1; }
  // 两端都点亮的连线：按关系类型一次画完；拉远时不画“同主题”
  Object.keys(V.litE).forEach(t => { if (far && t === "topic") return; const weak = t === "topic";
    c.beginPath(); V.litE[t].forEach(i => { const [a, b] = D.edges[i]; if (a === skip || b === skip) return; const pa = POS[a], pb = POS[b];
      if (!inV(pa) && !inV(pb)) return; c.moveTo(pa.x, pa.y); c.lineTo(pb.x, pb.y); });
    c.globalAlpha = far ? .3 : weak ? .35 : .6; c.strokeStyle = COL[t]; c.lineWidth = PX(weak ? .9 : 1.3); c.stroke(); });
  c.globalAlpha = 1;
  // 一端点亮：从亮的一端伸出一小段光
  if (!far && V.half.length){ c.beginPath(); V.half.forEach(([a, b]) => { if (a === skip) return; const pa = POS[a], pb = POS[b]; if (!inV(pa)) return;
      const d = Math.hypot(pb.x - pa.x, pb.y - pa.y), f = Math.min(.4, 40 / d); c.moveTo(pa.x, pa.y); c.lineTo(pa.x + (pb.x - pa.x) * f, pa.y + (pb.y - pa.y) * f); });
    c.globalAlpha = .28; c.strokeStyle = COL.lamp; c.lineWidth = PX(1.1); c.stroke(); c.globalAlpha = 1; }
  // 收起后的连线束
  V.bundles.forEach(bd => { c.beginPath(); c.moveTo(bd.pa.x, bd.pa.y); c.lineTo(bd.pb.x, bd.pb.y); c.strokeStyle = bd.color;
    c.globalAlpha = bd.lit ? .7 : .25; c.lineWidth = PX(bd.lit ? 1.6 : 1); c.stroke(); c.globalAlpha = 1; });
  // 没点亮的星：小实心点，越重要越大；挨着已点亮的词带一点暖色
  const groups = [[], [], [], [], [], []];
  core.WORDS.forEach(w => { if (core.isLit(w) && w !== skip || core.rep(w) !== w) return; const p = POS[w]; if (!inV(p)) return;
    groups[(core.tierOf(w) - 1) + (V.warm.has(w) ? 3 : 0)].push(p); });
  groups.forEach((ps, gi) => { if (!ps.length) return; const T0 = gi % 3, r = Z([1.8, 2.5, 3.3][T0]);
    c.beginPath(); ps.forEach(p => { c.moveTo(p.x + r, p.y); c.arc(p.x, p.y, r, 0, 6.2832); }); c.fillStyle = gi >= 3 ? NEAR_COL[T0] : DIM_COL[T0]; c.fill(); });
  // 点亮的星：星等越高越大越亮，二、一等星带光晕
  core.litArr.forEach(w => { if (w === skip || core.rep(w) !== w) return; const p = POS[w]; if (!inV(p)) return; drawLit(c, w, p, Z); });
}
const HEAT_A = .55;
const MCOL = ["#ff9a55", "#ffb85c", "#ffd27a", "#fff1d0"];
function drawLit(c, w, p, Z, boost){
  const T0 = core.tierOf(w), fade = core.isFading(w), giant = core.isGiant(w), r = litR(w, Z) * (boost || 1);
  // 不画光晕外环（重要程度看热力场和星星大小）；只在点亮动画时闪一下
  // 颜色 = 记得多牢：刚点亮橙色，复习一次比一次“热”（黄 → 白），恒星淡蓝白；该擦亮时冷却成暗红、变小
  const m = S().mem[w], col = fade ? "#8f5d4a" : giant ? "#d6e8ff" : MCOL[Math.min(3, (m && m.lv) || 0)];
  if (boost && boost > 1.05){ c.globalAlpha = .35 * (boost - 1); c.beginPath(); c.arc(p.x, p.y, r * 3.4, 0, 6.2832); c.fillStyle = col; c.fill(); c.globalAlpha = 1; }
  if (fade) c.globalAlpha = .75;
  c.beginPath(); c.arc(p.x, p.y, fade ? r * .8 : r, 0, 6.2832); c.fillStyle = col; c.fill(); c.globalAlpha = 1;
 }
function drawMap(t){
  const m = L.map, c = ctx, G = geo(), {v, s, k, far, Z, PX} = G;
  c.save(); c.beginPath(); c.rect(m.x, m.y, m.w, m.h); c.clip();
  // 底色和背景小星星预先画好，按星图区域贴一块
  if (!skyCanvas || skyCanvas.mh !== m.h) makeSky();
  c.drawImage(skyCanvas, 0, 0, skyCanvas.width, skyCanvas.height, m.x, m.y, m.w, m.h);
  // 静态层：比星图四周多画一圈，拖动时直接平移贴图，移出这一圈或停下来再重画
  const MX = Math.round(m.w * .35), MY = Math.round(m.h * .25), LW = Math.round((m.w + 2 * MX) * LD), LH = Math.round((m.h + 2 * MY) * LD);
  const heatFading = heat && t - heatT0 < 650, moving = touch.active || glideA;
  const key = [s.toFixed(5), m.y, m.h, mapVer, ign ? ign.w : "", heatFading ? t : heatT0].join("|");
  if (!mapLayer || mapLayer.width !== LW || mapLayer.height !== LH) { mapLayer = P.offscreen(LW, LH); mapKey = ""; }
  let dx = mapKey ? (mapV.ox - v.ox) / s : 0, dy = mapKey ? (mapV.oy - v.oy) / s : 0;
  if (key !== mapKey || Math.abs(dx) > MX * .9 || Math.abs(dy) > MY * .9 || (!moving && (Math.abs(dx) > .01 || Math.abs(dy) > .01))){
    mapKey = key; mapV = v; dx = dy = 0; const lc = mapLayer.getContext("2d"); lc.setTransform(1, 0, 0, 1, 0, 0); lc.clearRect(0, 0, LW, LH);
    drawStatic(lc, Object.assign({MX, MY}, G)); lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalAlpha = 1; }
  c.globalAlpha = selected || selCons !== null ? .5 : 1;
  c.drawImage(mapLayer, 0, 0, LW, LH, m.x - MX + dx, m.y - MY + dy, m.w + 2 * MX, m.h + 2 * MY);
  c.globalAlpha = 1;
  worldTf(c, v); c.lineCap = "round";
  // 选中的词：它的连线（细实线）和相关的词恢复亮度
  if (selected){ V.hl.forEach(([i, both]) => { const [a, b, tp] = D.edges[i]; c.beginPath(); c.moveTo(POS[a].x, POS[a].y); c.lineTo(POS[b].x, POS[b].y);
      c.globalAlpha = both ? .95 : .55; c.strokeStyle = COL[tp]; c.lineWidth = PX(both ? 1.6 : 1.2); c.stroke(); });
    c.globalAlpha = 1;
    [selected, ...V.nb].forEach(w => { if (core.rep(w) !== w) return; const p = POS[w];
      if (core.isLit(w) && w !== (ign && ign.w)) drawLit(c, w, p, Z);
      else if (!core.isLit(w)){ c.beginPath(); c.arc(p.x, p.y, Z(w === selected ? 4.5 : 3.2), 0, 6.2832); c.fillStyle = w === selected ? COL.sky : "#4a5778"; c.fill();
        c.strokeStyle = w === selected ? COL.ink : "rgba(233,237,246,.55)"; c.lineWidth = PX(1); c.stroke(); } }); }
  if (selCons !== null && !core.isFolded(selCons)) CONS[selCons].words.forEach(w => { const p = POS[w]; if (core.isLit(w)) drawLit(c, w, p, Z);
    else { c.beginPath(); c.arc(p.x, p.y, Z(3.2), 0, 6.2832); c.fillStyle = "#4a5778"; c.fill(); } });
  // 推荐、幸运星、待擦亮：一圈实线
  const ring = (p, r, col, lw, a) => { c.globalAlpha = a === undefined ? 1 : a; c.beginPath(); c.arc(p.x, p.y, r, 0, 6.2832); c.strokeStyle = col; c.lineWidth = lw; c.stroke(); c.globalAlpha = 1; };
  // 推荐的词：一团淡淡的暖光；幸运星：慢慢明暗的金星（都不画圈）
  if (!quiz){ V.rec.forEach(w => { if (w === selected || core.isLit(w)) return; const p = POS[w], R = Z(11), g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
      g.addColorStop(0, "rgba(255,140,90,.45)"); g.addColorStop(1, "rgba(255,140,90,0)"); c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, R, 0, 6.2832); c.fill();
      c.fillStyle = "#ffb08a"; c.beginPath(); c.arc(p.x, p.y, Z(2.4), 0, 6.2832); c.fill(); });
    if (V.luck && V.luck !== selected && !core.isLit(V.luck)){ const p = POS[V.luck]; c.globalAlpha = .725 + .275 * Math.cos(t / 3000 * Math.PI * 2);
      c.fillStyle = "#ffd36b"; c.beginPath(); c.arc(p.x, p.y, Z(4), 0, 6.2832); c.fill(); c.globalAlpha = 1; } }
  if (selected && core.rep(selected) === selected) ring(POS[selected], Z(9), "#fff", PX(1.8));
  // 答题中：选中星外面一圈进度
  if (quiz && !quiz.done){ const z = quiz, p = POS[z.w], N = z.qs.length, ok = z.picked !== null && z.qs[z.i].opts[z.picked].key === z.qs[z.i].answer, f = (z.i + (ok ? 1 : 0)) / N;
    ring(p, Z(11), COL.rule, PX(2.2)); if (f > 0){ c.beginPath(); c.arc(p.x, p.y, Z(11), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); c.strokeStyle = COL.lamp; c.lineWidth = PX(2.2); c.stroke(); } }
  // 收起的星座：一颗大星
  ALLC.forEach(i => { if (!core.isFolded(i)) return; const p = CP[i], fade = CONS[i].words.some(core.isFading);
    const br = fade ? 1 : 1 + .06 - .06 * Math.cos(t / 4000 * Math.PI * 2);
    c.globalAlpha = fade ? .06 : .18; c.beginPath(); c.arc(p.x, p.y, Z(26) * br, 0, 6.2832); c.fillStyle = COL.lamp; c.fill(); c.globalAlpha = 1;
    c.beginPath(); for (let q = 0; q < 8; q++){ const a = q * Math.PI / 4, r1 = Z(q % 2 ? 13 : 14), r2 = Z(q % 2 ? 17 : 20); c.moveTo(p.x + Math.cos(a) * r1, p.y + Math.sin(a) * r1); c.lineTo(p.x + Math.cos(a) * r2, p.y + Math.sin(a) * r2); }
    c.globalAlpha = .6; c.strokeStyle = COL.lamp; c.lineWidth = PX(1.2); c.stroke(); c.globalAlpha = 1;
    c.beginPath(); c.arc(p.x, p.y, Z(10), 0, 6.2832); c.fillStyle = fade ? "#8a7440" : COL.lamp; c.fill(); c.strokeStyle = selCons === i ? "#fff" : fade ? "#b99a5a" : COL.cream; c.lineWidth = PX(selCons === i ? 2.4 : 1.6); c.stroke(); });
  // 点亮动画
  if (ign){ const e = t - ign.t0, w = ign.w, p = POS[w], T0 = ign.T;
    const pk = e < IGN_D0 ? e / IGN_D0 : 1, boost = e < IGN_D0 ? .5 + pk * .9 : 1 + .4 * Math.max(0, 1 - (e - IGN_D0) / 500);
    if (e < IGN_D0){ c.globalAlpha = .35 + .65 * pk; c.beginPath(); c.arc(p.x, p.y, Z(11), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pk); c.strokeStyle = COL.lamp; c.lineWidth = PX(2.2); c.stroke(); c.globalAlpha = 1; }
    // 冲击波：一等星三圈
    for (let q = 0; q < T0; q++){ const e2 = (e - IGN_D0 - q * 140) / 800; if (e2 < 0 || e2 > 1) continue; const ee = 1 - Math.pow(1 - e2, 2);
      ring(p, Z(6 + (30 + T0 * 12) * ee), q ? COL.cream : COL.lamp, PX(2 * (1 - e2) + .4), .8 * (1 - e2)); }
    // 光沿连线流向已点亮的邻居
    ign.nbs.forEach((x, q) => { const t0 = IGN_D0 + IGN_GAP + q * IGN_STEP, f = Math.min(1, Math.max(0, (e - t0) / IGN_BEAM)); if (f <= 0) return; const ff = 1 - Math.pow(1 - f, 3), px = POS[x];
      const tp = (adj[w].find(a => a.w === x) || {}).t || "topic";
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + (px.x - p.x) * ff, p.y + (px.y - p.y) * ff); c.strokeStyle = f < 1 ? COL.cream : COL[tp]; c.globalAlpha = f < 1 ? .9 : .6; c.lineWidth = PX(f < 1 ? 2 : 1.3); c.stroke(); c.globalAlpha = 1;
      if (f < 1){ c.beginPath(); c.arc(p.x + (px.x - p.x) * ff, p.y + (px.y - p.y) * ff, Z(2.4), 0, 6.2832); c.fillStyle = "#fff"; c.fill(); } });
    drawLit(c, w, p, Z, boost); }
  // 邻居被光流到时闪一下
  for (const w in pops){ const e = (t - pops[w]) / 700; if (e >= 1){ delete pops[w]; continue; } if (e < 0 || !POS[w]) continue; const p = POS[w];
    ring(p, Z(4 + 10 * e), COL.cream, PX(1.6 * (1 - e) + .3), 1 - e); }
  // 星点四散
  for (let q = sparks.length - 1; q >= 0; q--){ const sp = sparks[q], e = (t - sp.t0) / 900; if (e >= 1){ sparks.splice(q, 1); continue; }
    const qq = 1 - Math.pow(1 - e, 2); c.globalAlpha = 1 - qq; c.beginPath(); c.arc(sp.x + Z(sp.dx * .6) * qq, sp.y + Z(sp.dy * .6) * qq, Z(sp.r * .6) * (1 - .7 * qq), 0, 6.2832); c.fillStyle = COL.cream; c.fill(); }
  c.globalAlpha = 1;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  // 名字：只给选中的词和它最重要的 14 个相关词（以及答题、点亮中的词）
  // 名字放在半透明底色的小牌子上，户外也看得清
  // 先试星下方，挡住了再试上方，都挡住就不标
  const placed = [];
  const lab = (w, col, b, size, must) => { const q = toScr(POS[w], v); if (q.x < -60 || q.x > W + 60 || q.y < m.y - 20 || q.y > L.panel.y + 20) return;
    const tw = U.measure(c, w, "w", size, b), off = Math.max(10, 13 / Math.max(s, .5)) + 7, hh = Math.round(size * 1.3) + 4;
    let y = null; for (const yy of [q.y + off, q.y - off]){ const r = {x0: q.x - tw / 2 - 6, x1: q.x + tw / 2 + 6, y0: yy - hh / 2 - 1, y1: yy + hh / 2 + 1};
      if (!placed.some(o => r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0)){ y = yy; placed.push(r); break; } }
    if (y === null){ if (!must) return; y = q.y + off; }
    U.box(c, q.x - tw / 2 - 5, y - hh / 2, tw + 10, hh, 6, "rgba(9,15,30,.66)"); U.text(c, w, q.x, y, "w", size, col, {align: "center", b}); };
  if (selected){ lab(selected, "#fff", 1, 16, true); V.nbl.forEach(w => { if (core.rep(w) === w) lab(w, core.isLit(w) ? COL.cream : "#c6cee2", 0, 13); }); }
  else if (!quiz && !ign) homeLabels(v, s).forEach(([w, col, b]) => lab(w, col, b, 13));
  if (quiz && quiz.w !== selected) lab(quiz.w, COL.cream, 1, 14);
  ALLC.forEach(i => { if (!core.isFolded(i)) return; const q = toScr(CP[i], v); if (q.x < -60 || q.x > W + 60) return;
    U.text(c, CONS[i].name, q.x, q.y + Z(20) / s + 14, "cn", 12, "cream", {align: "center", b: 1, stroke: COL.sky}); });
  if (fxText){ const e = (t - fxText.t0) / 1600; if (e >= 1) fxText = null; else { const q = toScr(POS[fxText.w], v);
    c.globalAlpha = e < .15 ? e / .15 : 1 - Math.max(0, (e - .5) / .5); U.text(c, fxText.s, q.x, q.y - 20 - 24 * e, "cn", 14, "lamp", {align: "center", b: 1, stroke: COL.sky}); c.globalAlpha = 1; } }
  // 流星（屏幕坐标）
  for (let q = meteors.length - 1; q >= 0; q--){ const me = meteors[q], e = (t - me.t0) / 1100; if (e < 0) continue; if (e >= 1){ meteors.splice(q, 1); continue; }
    const x = m.x + me.x * m.w - 420 * e * e, y = m.y + me.y * m.h + 190 * e * e, a = e < .15 ? e / .15 : 1 - (e - .15) / .85;
    c.save(); c.translate(x, y); c.rotate(-24 * Math.PI / 180); const lg = c.createLinearGradient(0, 0, 140, 0); lg.addColorStop(0, "rgba(255,243,214,0)"); lg.addColorStop(1, "#fff3d6");
    c.globalAlpha = a; c.shadowColor = COL.lamp; c.shadowBlur = 10; c.fillStyle = lg; c.fillRect(0, -1, 140, 2); c.restore(); }
  drawZoom(); drawTip();
  c.restore();
}
// 没选中词时，放大到一定程度就给看得见的星标名字：推荐、幸运星、点亮的、重要的优先，互相不重叠，最多 14 个
let hlCache = {key: "", list: []};
function homeLabels(v, s){
  if (s > 1.15) return [];
  const key = [Math.round(v.ox), Math.round(v.oy), s.toFixed(3), mapVer, sheetK].join("|"); if (hlCache.key === key) return hlCache.list;
  const top = L.map.y + 8, bot = L.panel.y - 26, cand = [];
  core.WORDS.forEach(w => { if (core.rep(w) !== w) return; const q = toScr(POS[w], v); if (q.x < 24 || q.x > W - 24 || q.y < top || q.y > bot || (q.x > W - 90 && q.y > L.panel.y - 170)) return;
    const lit = core.isLit(w), sc0 = V.rec.has(w) ? 100 : w === V.luck ? 90 : lit ? 50 + core.tierOf(w) * 5 : core.tierOf(w) * 6 + (V.warm.has(w) ? 8 : 0);
    cand.push({w, q, sc0, lit}); });
  cand.sort((a, b) => b.sc0 - a.sc0);
  const placed = [], list = [];
  for (const it of cand){ if (list.length >= 14) break; const tw = it.w.length * 7.4 + 12, y = it.q.y + Math.max(10, 13 / Math.max(s, .5)) + 7;
    const r = {x0: it.q.x - tw / 2 - 3, x1: it.q.x + tw / 2 + 3, y0: y - 12, y1: y + 12};
    if (placed.some(o => r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0)) continue;
    placed.push(r); list.push([it.w, V.rec.has(it.w) ? "#ffc59e" : it.w === V.luck ? COL.lamp : it.lit ? COL.cream : "#b4bdd3", V.rec.has(it.w) || it.w === V.luck ? 1 : 0]); }
  hlCache = {key, list}; return list; }
function drawZoom(){ const c = ctx, s = 36, x = W - 10 - s, y = L.panel.y - 12 - s * 3 - 12;
  if (y < L.map.y + 8) return;
  [["+", () => zoom(.6, undefined, undefined, true)], ["−", () => zoom(1.6, undefined, undefined, true)], ["全览", () => fit(true)]].forEach(([lab, fn], k) => {
    const yy = y + k * (s + 6); U.box(c, x, yy, s, s, 10, "rgba(20,30,52,.88)", "rule"); pressFx(c, x, yy, s, s, 10);
    U.text(c, lab, x + s / 2, yy + s / 2 + 1, "cn", lab.length > 1 ? 11 : 18, "ink", {align: "center"}); hit(x - 4, yy - 3, s + 8, s + 6, fn); }); }
let tipCache = null;
function drawTip(){ if (!tipQ.length || cover) return; const c = ctx, key = tipQ[0], w = Math.min(440, W - 76), x = 12;
  if (!tipCache || tipCache.key !== key){ const runs = TIPS[key].split(/<\/?b>/).map((s, k) => ({s, b: k % 2 ? 1 : 0, c: k % 2 ? "lamp" : "ink"})).filter(r => r.s);
    tipCache = {key, t0: Date.now(), L: U.layout(c, runs, w - 28 - 70, {size: 14, lh: 21})}; }
  // 提示不挡路：8 秒后自己收起
  if (reveal) tipCache.t0 = Date.now(); else if (Date.now() - tipCache.t0 > 8000){ closeTip(); return; }
  const Lr = tipCache.L, h = Math.max(48, Lr.h + 24), y = L.panel.y - 12 - h;
  c.save(); c.shadowColor = "rgba(0,0,0,.5)"; c.shadowBlur = 30; c.shadowOffsetY = 8; U.box(c, x, y, w, h, 12, "#1b2742"); c.restore();
  U.box(c, x, y, w, h, 12, null, "rgba(255,201,92,.6)");
  U.drawLayout(c, Lr, x + 14, y + h / 2 - Lr.h / 2);
  const bw = 62, bx = x + w - 12 - bw, by = y + h / 2 - 15; U.box(c, bx, by, bw, 30, 8, "lamp"); U.text(c, "知道了", bx + bw / 2, by + 15, "cn", 13, "dark", {align: "center", b: 1});
  hits.push({x, y, w, h, fn: () => {}}); hit(bx - 6, by - 8, bw + 12, 46, closeTip); }

// 顶栏只留一行：今日目标圈、等级、已点亮数、词库；星尘、连续天数、音效都在“等级”页里
function drawHeader(){ const c = ctx, h = L.head;
  c.fillStyle = COL.sky2; c.fillRect(0, 0, W, h.h); c.fillStyle = COL.rule; c.fillRect(0, h.h - 1, W, 1);
  const lit = core.litArr.length, tot = core.WORDS.length;
  c.fillStyle = COL.lamp; c.save(); c.shadowColor = COL.lamp; c.shadowBlur = 8; c.fillRect(0, h.h - 2, W * lit / tot, 2); c.restore();
  const cy = h.r1y + h.r1h / 2, dg = core.daily(), gp = Math.min(1, dg.n / core.goalOf());
  // 今日目标：写明“今日 2/5”，底色按进度填充
  let x = PAD; { const gt = dg.done ? "今日 ✓" : `今日 ${dg.n}/${core.goalOf()}`, gw = U.measure(c, gt, "cn", 12, 1) + 18;
    U.box(c, x, cy - 13, gw, 26, 9, "rgba(255,201,92,.08)", "rgba(255,201,92,.45)");
    if (gp > 0){ c.save(); U.rr(c, x, cy - 13, gw, 26, 9); c.clip(); c.fillStyle = "rgba(255,201,92,.28)"; c.fillRect(x, cy - 13, gw * gp, 26); c.restore(); }
    pressFx(c, x, cy - 13, gw, 26, 9); U.text(c, gt, x + gw / 2, cy, "cn", 12, "lamp", {align: "center", b: 1}); x += gw + 8; }
  const n = S().lit.length, lv = core.lvOf(n), LA = core.LV_AT, top = lv >= LA.length, kf = top ? 1 : (n - LA[lv - 1]) / (LA[lv] - LA[lv - 1]);
  const lt = `Lv.${lv}`, lvw = U.measure(c, lt, "mono", 13, 1) + 38;
  U.box(c, x, cy - 13, lvw, 26, 9, "rgba(255,201,92,.12)", "rgba(255,201,92,.45)"); pressFx(c, x, cy - 13, lvw, 26, 9);
  U.text(c, lt, x + 9, cy, "mono", 13, "lamp", {b: 1}); const bx2 = x + lvw - 25; U.box(c, bx2, cy - 2, 17, 4, 2, "rule"); U.box(c, bx2, cy - 2, Math.max(4, 17 * kf), 4, 2, "lamp");
  hits.push({x: 0, y: cy - 20, w: x + lvw + 4, h: 40, fn: showLevel});
  x += lvw + 10;
  const ls = "★ " + lit, lW = U.measure(c, ls, "mono", 15, 1); U.text(c, ls, x, cy, "mono", 15, "lamp", {b: 1}); x += lW + 8;
  const bl = core.BANKS[core.BANK].name, bw = U.measure(c, bl, "mono", 11) + 16;
  if (x + bw <= h.r1right){ U.box(c, x, cy - 12, bw, 24, 8, null, "rgba(255,201,92,.4)"); pressFx(c, x, cy - 12, bw, 24, 8); U.text(c, bl, x + bw / 2, cy, "mono", 11, "lamp", {align: "center"});
    hit(x - 4, cy - 18, bw + 8, 36, askBank); }
}
function drawPanel(){ const c = ctx, p = L.panel;
  c.save(); c.shadowColor = "rgba(0,0,0,.5)"; c.shadowBlur = 24; c.shadowOffsetY = -4; U.box(c, 0, p.y, W, p.h + 24, 16, COL.panel); c.restore();
  U.box(c, 0, p.y, W, p.h + 24, 16, null, COL.rule);
  U.box(c, W / 2 - 18, p.y + 8, 36, 4, 2, "#3d4b6c");
  hit(0, p.y, W, SHEET_TOP, () => setSheet(sheetK < 2 ? 2 : 0));
  c.save(); c.beginPath(); c.rect(0, p.y + SHEET_TOP - 4, W, p.h - SHEET_TOP + 4); c.clip(); drawClip = {x: 0, y: p.y + SHEET_TOP - 4, w: W, h: p.h - SHEET_TOP + 4};
  const y0 = p.y + SHEET_TOP - pScroll;
  PB.items.forEach(it => { const y = y0 + it.y; if (y + it.h < p.y - 40 || y > p.y + p.h + 40) return; it.draw(c, PAD, y); });
  drawClip = null; c.restore();
  // 可以继续往下滚时，底部渐隐提示
  if (pScroll < maxScroll() - 2){ const lg = c.createLinearGradient(0, H - 28, 0, H); lg.addColorStop(0, "rgba(20,30,52,0)"); lg.addColorStop(1, COL.panel); c.fillStyle = lg; c.fillRect(0, H - 28, W, 28); }
}
function drawToast(t){ if (!toastMsg) return; const e = t - toastT; if (e > 2200){ toastMsg = null; return; }
  const c = ctx, w = U.measure(c, toastMsg, "cn", 14, 1) + 32, x = W / 2 - w / 2, y = L.map.y + 54, a = e < 150 ? e / 150 : e > 1900 ? (2200 - e) / 300 : 1;
  c.save(); c.globalAlpha = a; c.shadowColor = "rgba(255,201,92,.5)"; c.shadowBlur = 24; U.box(c, x, y, w, 34, 17, "lamp"); c.restore();
  c.save(); c.globalAlpha = a; U.text(c, toastMsg, W / 2, y + 17, "cn", 14, "dark", {align: "center", b: 1}); c.restore(); }

let lastDraw = 0, frameN = 0, lastFrame = 0, loopId = 0, frameErr = 0;
// 画面循环：某一帧出错也照样排下一帧，不让整个游戏停住
function frame(id){ if (id !== loopId) return; lastFrame = Date.now();
  try { frameBody(); frameErr = 0; } catch(e){ if (++frameErr === 3){ try { quiz && quiz.done && (quiz = null); pick = null; reveal = null; ign = null; glideA = null; refresh(); renderPanel(true); } catch(e2){} } if (typeof console !== "undefined") console.error(e); }
  P.raf(() => frame(id)); }
function startLoop(){ const id = ++loopId; lastFrame = Date.now(); P.raf(() => frame(id)); }
function frameBody(){
  const t = Date.now();
  if (glideA){ const k = Math.min(1, (t - glideA.t0) / glideA.dur), e = 1 - Math.pow(1 - k, 3), f = glideA.from, to = glideA.to;
    vb = {x: f.x + (to.x - f.x) * e, y: f.y + (to.y - f.y) * e, w: f.w + (to.w - f.w) * e, h: f.h + (to.h - f.h) * e}; if (k >= 1) glideA = null; }
  if (pVel && !touch.active){ pScroll += pVel; pVel *= .94; if (Math.abs(pVel) < .3) pVel = 0; const ms = maxScroll(); if (pScroll < 0 || pScroll > ms){ clampScroll(); pVel = 0; } }
  if (scrollTo !== null){ if (touch.active) scrollTo = null; else { pScroll += (scrollTo - pScroll) * .2; if (Math.abs(scrollTo - pScroll) < 1){ pScroll = scrollTo; scrollTo = null; } } }
  // 空闲时降到约 15 帧，省电
  ignTick(t); const sheetMoving = sheetTick();
  const active = cover || sheetMoving || pick || reveal || glideA || pVel || scrollTo !== null || touch.active || sparks.length || meteors.length || toastMsg || autoT && tapAny || ign || fxText || Object.keys(pops).length || (heat && t - heatT0 < 700) || (quiz && !quiz.done);
  frameN++;
  if (active || frameN % 4 === 0){
    hits = []; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
    ctx.fillStyle = COL.sky; ctx.fillRect(0, 0, W, H);
    drawMap(t); drawPanel(); drawHeader(); drawToast(t); drawPick(); drawReveal(t); drawCover(t);
    lastDraw = t;
  }
}

// ---------- 开场封面（只给新玩家看一次） ----------
function drawCover(t){ if (!cover) return; const c = ctx;
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "rgba(8,13,26,.62)"); g.addColorStop(.5, "rgba(8,13,26,.86)"); g.addColorStop(1, "rgba(8,13,26,.97)"); c.fillStyle = g; c.fillRect(0, 0, W, H);
  hits.push({x: 0, y: 0, w: W, h: H, fn: () => {}, prio: true});
  const cy = Math.round(Math.max(H * .4, L.head.h + 250)), sy = cy - 124, R = 84, pul = .5 + .5 * Math.sin(t / 650), cx = W / 2;
  // 一张小星网：中间的词亮着，四条不同颜色的线依次亮起，连到有关系的词
  const NET = [["glad", "近义", "syn", -148], ["sad", "反义", "ant", -32], ["birthday", "搭配", "coll", 28], ["happiness", "同词根", "root", 152]];
  const ph = (t % 4800) / 800;   // 每 0.8 秒亮一条，亮完停一会儿再重来
  NET.forEach(([wd, rel, tp, deg], k) => { const a = deg * Math.PI / 180, x = cx + Math.cos(a) * R * 1.25, y = sy + Math.sin(a) * R * .8, on = Math.max(0, Math.min(1, ph - k));
    c.save(); c.globalAlpha = .22; c.strokeStyle = COL[tp]; c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx, sy); c.lineTo(x, y); c.stroke();
    if (on > 0){ c.globalAlpha = .95; c.shadowColor = COL[tp]; c.shadowBlur = 8; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, sy); c.lineTo(cx + (x - cx) * on, sy + (y - sy) * on); c.stroke(); }
    c.restore();
    const lit = on >= 1; c.beginPath(); c.arc(x, y, lit ? 6 : 4, 0, 7); c.fillStyle = lit ? COL.lamp : "#6673a0"; c.save(); if (lit){ c.shadowColor = COL.lamp; c.shadowBlur = 14; } c.fill(); c.restore();
    const up = deg < 0, ty = y + (up ? -20 : 20);
    U.text(c, wd, x, ty, "w", 15, lit ? "cream" : "muted", {align: "center", b: 1});
    U.text(c, rel, x, ty + (up ? -17 : 17), "cn", 11, COL[tp], {align: "center"}); });
  const rg = c.createRadialGradient(cx, sy, 0, cx, sy, 30 + pul * 6); rg.addColorStop(0, "rgba(255,240,200,1)"); rg.addColorStop(.2, "rgba(255,201,92,.8)"); rg.addColorStop(1, "rgba(255,201,92,0)");
  c.fillStyle = rg; c.beginPath(); c.arc(cx, sy, 36, 0, 7); c.fill();
  U.text(c, "happy", cx, sy + 30, "w", 17, "cream", {align: "center", b: 1, stroke: "rgba(8,13,26,.9)", sw: 4});
  c.save(); c.shadowColor = COL.lamp; c.shadowBlur = 26; U.text(c, APP_NAME, cx, cy, "cn", Math.min(42, Math.floor((W - 48) / 7)), "lamp", {align: "center", b: 1}); c.restore();
  U.text(c, "单词连成一张星网", cx, cy + 54, "cn", 18, "ink", {align: "center"});
  U.text(c, "点亮一颗，顺着线记住一串", cx, cy + 82, "cn", 18, "ink", {align: "center"});
  U.text(c, `KET · PET · FCE 考纲 ${Object.keys(core.RAW.words).length} 词 · ${core.RAW.edges.length} 条连线`, cx, cy + 116, "cn", 12, "muted", {align: "center"});
  const bw = Math.min(320, W - 64), bh = 56, bx = W / 2 - bw / 2, by = Math.round(Math.max(H * .68, cy + 142));
  c.save(); c.shadowColor = "rgba(255,201,92,.55)"; c.shadowBlur = 18 + pul * 14; U.box(c, bx, by, bw, bh, 28, "lamp"); c.restore();
  pressFx(c, bx, by, bw, bh, 28); U.text(c, "点亮第一颗星", W / 2, by + bh / 2 + 1, "cn", 20, "dark", {align: "center", b: 1});
  U.text(c, "先答 2 道题，十几秒就能点亮", W / 2, by + bh + 26, "cn", 13, "muted", {align: "center"});
  hits.push({x: bx - 8, y: by - 8, w: bw + 16, h: bh + 16, fn: startFirst, prio: true}); }

// ---------- 分享卡片：画出自己的星空和今天的成绩 ----------
let shareCv = null;
function shareCard(){ const SW0 = 500, SH0 = 400; if (!shareCv) shareCv = P.offscreen(SW0, SH0); const c = shareCv.getContext("2d");
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
  const g = c.createLinearGradient(0, 0, 0, SH0); g.addColorStop(0, "#0b1222"); g.addColorStop(1, "#1b2547"); c.fillStyle = g; c.fillRect(0, 0, SW0, SH0);
  // 镜头对准已点亮的那一片（没点亮时看整片星空），画出点亮的词之间的连线
  const lw = core.litArr, bx = BBall; let k, ox, oy, links = 0;
  if (lw.length){ const xs = lw.map(w => POS[w].x), ys = lw.map(w => POS[w].y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const vw = Math.max(340, x1 - x0 + 150), vh = Math.max(280, y1 - y0 + 150); k = Math.min(SW0 * .62 / vw, (SH0 - 110) / vh); ox = SW0 * .66 - (x0 + x1) / 2 * k; oy = (SH0 - 92) / 2 + 6 - (y0 + y1) / 2 * k; }
  else { k = Math.min(SW0 / bx.w, SH0 / bx.h) * 1.2; ox = SW0 * .62 - (bx.x + bx.w / 2) * k; oy = SH0 * .46 - (bx.y + bx.h / 2) * k; }
  const ds = Math.max(1.5, Math.min(3, 2.4 * k));
  c.fillStyle = "rgba(150,170,220,.3)"; core.WORDS.forEach(w => { if (core.isLit(w)) return; const p = POS[w], x = ox + p.x * k, y = oy + p.y * k; if (x < -4 || x > SW0 + 4 || y < -4 || y > SH0 + 4) return; c.beginPath(); c.arc(x, y, ds / 2, 0, 7); c.fill(); });
  c.lineCap = "round"; D.edges.forEach(([a, b, tp]) => { if (!core.isLit(a) || !core.isLit(b)) return; links++;
    c.globalAlpha = tp === "topic" ? .35 : .85; c.strokeStyle = COL[tp]; c.lineWidth = tp === "topic" ? 1 : 1.6; c.beginPath(); c.moveTo(ox + POS[a].x * k, oy + POS[a].y * k); c.lineTo(ox + POS[b].x * k, oy + POS[b].y * k); c.stroke(); });
  c.globalAlpha = 1; c.globalCompositeOperation = "lighter"; const gr = Math.max(9, Math.min(22, 20 * k));
  lw.forEach(w => { const p = POS[w], x = ox + p.x * k, y = oy + p.y * k, rg = c.createRadialGradient(x, y, 0, x, y, gr);
    rg.addColorStop(0, "rgba(255,226,150,.95)"); rg.addColorStop(.22, "rgba(255,190,90,.45)"); rg.addColorStop(1, "rgba(255,190,90,0)"); c.fillStyle = rg; c.beginPath(); c.arc(x, y, gr, 0, 7); c.fill(); });
  c.globalCompositeOperation = "source-over";
  // 镜头够近时，给最近点亮的几颗标上词名
  if (k > .55){ const used = []; lw.slice(-8).reverse().forEach(w => { const p = POS[w], x = ox + p.x * k, y = oy + p.y * k + 17, hw = U.measure(c, w, "w", 13, 1) / 2 + 4;
    if (x - hw < SW0 * .34 || x + hw > SW0 - 6 || y > SH0 - 104 || used.some(u => Math.abs(u.x - x) < u.hw + hw && Math.abs(u.y - y) < 16)) return;
    used.push({x, y, hw}); U.text(c, w, x, y, "w", 13, "cream", {align: "center", b: 1, stroke: "rgba(11,18,34,.85)", sw: 3}); }); }
  const sg = c.createLinearGradient(0, 0, SW0 * .5, 0); sg.addColorStop(0, "rgba(11,18,34,.92)"); sg.addColorStop(.55, "rgba(11,18,34,.6)"); sg.addColorStop(1, "rgba(11,18,34,0)"); c.fillStyle = sg; c.fillRect(0, 0, SW0 * .5, SH0);
  const n = S().lit.length, sn = core.streakNow(), lv = core.lvOf(n), d = core.daily(), today = d.n ? S().lit.slice(-d.n) : [];
  U.text(c, APP_NAME, 28, 44, "cn", 22, "lamp", {b: 1});
  U.text(c, String(n), 26, 138, "mono", 84, "lamp", {b: 1}); const nw = U.measure(c, String(n), "mono", 84, 1);
  U.text(c, "颗星", 34 + nw, 158, "cn", 24, "ink", {b: 1});
  U.text(c, "已经点亮", 28, 204, "cn", 20, "ink");
  if (links) U.text(c, `连成了 ${links} 条线`, 28, 268, "cn", 15, "cream");
  U.text(c, `${sn > 1 ? `连续 ${sn} 天 · ` : ""}Lv.${lv} ${core.titleOf(lv)}`, 28, 240, "cn", 16, "muted");
  if (today.length){ c.fillStyle = "rgba(11,18,34,.78)"; c.fillRect(0, SH0 - 92, SW0, 92);
    U.text(c, `今天学会 ${today.length} 个词`, 28, SH0 - 64, "cn", 15, "lamp", {b: 1});
    let line = ""; for (const w of today.slice().reverse()){ const nx = line ? line + " · " + w : w; if (U.measure(c, nx + " …", "w", 18, 1) > SW0 - 56){ line += " …"; break; } line = nx; }
    U.text(c, line, 28, SH0 - 32, "w", 18, "ink", {b: 1}); }
  return shareCv; }
function shareInfo(){ const n = S().lit.length, sn = core.streakNow(), d = core.daily();
  const title = !n ? APP_NAME + "：答对题目，点亮一整片单词星空" : d.n ? `我今天在「${APP_NAME}」点亮了 ${d.n} 颗单词星${sn > 1 ? `，已经连续 ${sn} 天` : ""}，你也来试试？` : `我的单词星网已经亮了 ${n} 颗星，你也来连一片？`;
  return {title, canvas: shareCard()}; }
function shareBtn(){ gap(10); btn("把我的星空发给爸妈或同学", "ghost", () => P.shareNow(shareInfo), {h: 40, size: 14}); }

// ---------- 触摸 ----------
const touch = {active: false, pts: new Map(), zone: null, moved: 0, pinch: 0, last: null, vy: 0, vx: 0, sheet: false, mode: null};
let lastTap = null, pick = null;
function zoneAt(x, y){ if (y < L.head.h) return "head"; if (y < L.panel.y) return "map"; return "panel"; }
function findHit(x, y){ for (let k = hits.length - 1; k >= 0; k--){ const h = hits[k]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h; } return null; }
// 点哪儿就选离手指最近的那颗星（收起的星座优先）
// 手指范围（半径 22 像素）里有好几颗星挤在一起时，弹出小列表让你选
function mapTap(x, y){ const p = toWorld(x, y), s = sc(), R = 22 * s;
  let best = null, bd = Infinity;
  ALLC.forEach(i => { if (!core.isFolded(i)) return; const d = Math.hypot(CP[i].x - p.x, CP[i].y - p.y); if (d < Math.max(R, 28 * s) && d < bd){ bd = d; best = {c: i}; } });
  if (best) return selectCons(best.c);
  const near = []; core.WORDS.forEach(w => { if (core.rep(w) !== w) return; const q = POS[w], d = Math.hypot(q.x - p.x, q.y - p.y); if (d < R) near.push([d, w]); });
  near.sort((a, b) => a[0] - b[0]);
  if (!near.length) return select(null);
  const crowd = near.filter(([d]) => d < near[0][0] + 12 * s);
  if (crowd.length > 5) return zoom(.35, x, y, true);   // 拉得太远、挤了一大堆：先放大
  if (crowd.length >= 2 && !busy()) { pick = {x, y, ws: crowd.map(a => a[1])}; return; }
  select(near[0][1]); }
function drawPick(){ if (!pick) return; const c = ctx, n = pick.ws.length, rh = 40, w = 210, h = n * rh + 34;
  let x = Math.max(10, Math.min(W - w - 10, pick.x - w / 2)), y = pick.y + 18; if (y + h > L.panel.y - 6) y = Math.max(L.map.y + 6, pick.y - 18 - h);
  hits.push({x: 0, y: 0, w: W, h: H, fn: () => { pick = null; }, prio: true});
  c.save(); c.shadowColor = "rgba(0,0,0,.55)"; c.shadowBlur = 26; c.shadowOffsetY = 6; U.box(c, x, y, w, h, 12, "#1b2742"); c.restore(); U.box(c, x, y, w, h, 12, null, "rgba(255,201,92,.45)");
  U.text(c, "这里有几颗星，选一个", x + 14, y + 17, "cn", 12, "muted");
  pick.ws.forEach((wd, k) => { const yy = y + 30 + k * rh, lit = core.isLit(wd); pressFx(c, x + 4, yy, w - 8, rh - 4, 8);
    c.beginPath(); c.arc(x + 20, yy + rh / 2 - 2, 4, 0, 7); c.fillStyle = lit ? COL.lamp : "#6673a0"; c.fill();
    U.text(c, wd, x + 34, yy + rh / 2 - 2, "w", 15, lit ? "cream" : "ink", {b: 1}); const nw = U.measure(c, wd, "w", 15, 1);
    U.text(c, fitStr(c, core.cn1(wd), w - 54 - nw, 12), x + 42 + nw, yy + rh / 2 - 2, "cn", 12, "muted");
    hits.push({x: x + 4, y: yy, w: w - 8, h: rh - 4, fn: () => { pick = null; select(wd); }, prio: true}); }); }
P.onTouch({
  start(e){ const ts = e.changedTouches || e.touches || [];
    // 系统没发“结束”的旧触摸点先清掉
    if (e.touches){ const live = new Set(e.touches.map(x => x.identifier)); for (const id of [...touch.pts.keys()]) if (!live.has(id)) touch.pts.delete(id); if (!touch.pts.size) touch.active = false; }
    for (const tt of ts) touch.pts.set(tt.identifier, {x: tt.clientX, y: tt.clientY});
    if (!touch.active){ const f = ts[0]; touch.active = true; touch.zone = zoneAt(f.clientX, f.clientY); touch.moved = 0; touch.start = {x: f.clientX, y: f.clientY}; touch.t0 = Date.now();
      press = {x: f.clientX, y: f.clientY, moved: false}; pVel = 0; touch.vx = touch.vy = 0; touch.mode = null; touch.sheet = false;
      const h = findHit(f.clientX, f.clientY); if (h && touch.zone === "map") touch.zone = "ui"; }
    if (touch.pts.size === 2 && (touch.zone === "map" || touch.zone === "ui")){ touch.zone = "map"; const [a, b] = [...touch.pts.values()]; touch.pinch = Math.hypot(a.x - b.x, a.y - b.y); touch.moved = 99; press = null; } },
  move(e){ const ts = e.changedTouches || e.touches || []; if (cover) return;
    for (const tt of ts){ const prev = touch.pts.get(tt.identifier); if (!prev) continue; const p = {x: tt.clientX, y: tt.clientY}, dx = p.x - prev.x, dy = p.y - prev.y;
      touch.pts.set(tt.identifier, p);
      if (touch.pts.size === 1){ touch.moved += Math.abs(dx) + Math.abs(dy); if (touch.moved > 8 && press) press.moved = true;
        if (touch.zone === "map" || (touch.zone === "ui" && touch.moved > 8)){ touch.zone = "map"; glideA = null; const s = sc(); vb = {...vb, x: vb.x - dx * s, y: vb.y - dy * s}; }
        else if (touch.zone === "panel" && touch.moved > 6){
          // 拖面板：没拉到最高时往上拖、或者内容在顶部时往下拖 = 拉动抽屉；否则滚动内容
          if (!touch.mode) touch.mode = (dy < 0 && sheetK < 2) || (dy > 0 && pScroll <= 0) ? "sheet" : "scroll";
          if (touch.mode === "sheet"){ touch.sheet = true; sheetH = Math.max(SN[0] * .8, Math.min(SN[2] + 20, sheetH - dy)); L.panel.y = H - sheetH; L.panel.h = sheetH; touch.vy = -dy; }
          else { pScroll -= dy; touch.vy = -dy; const ms = maxScroll(); if (pScroll < 0) pScroll *= .5; if (pScroll > ms) pScroll = ms + (pScroll - ms) * .5; } } } }
    if (touch.pts.size === 2 && touch.zone === "map" && touch.pinch){ const [a, b] = [...touch.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0){ zoom(touch.pinch / d, (a.x + b.x) / 2, (a.y + b.y) / 2); touch.pinch = d; } } },
  end(e){ const ts = e.changedTouches || [];
    for (const tt of ts) touch.pts.delete(tt.identifier);
    if (touch.pts.size < 2) touch.pinch = 0;
    if (touch.pts.size) return;
    touch.active = false; press = null;
    if (reveal && touch.moved < 8){ endReveal(); return; }
    if (touch.sheet){ touch.sheet = false; let k = 0; SN.forEach((h0, i) => { if (Math.abs(h0 - sheetH) < Math.abs(SN[k] - sheetH)) k = i; });
      if (Math.abs(touch.vy) > 4){ const dir = touch.vy > 0 ? 1 : -1; k = SN.findIndex(h0 => dir > 0 ? h0 > sheetH + 1 : false); if (dir < 0){ k = -1; SN.forEach((h0, i) => { if (h0 < sheetH - 1) k = i; }); } if (k < 0) k = dir > 0 ? 2 : 0; }
      setSheet(k); clampScroll(); return; }
    if (touch.zone === "panel"){ if (touch.moved > 6) pVel = touch.vy; clampScrollSoft(); }
    if (touch.moved >= 8) return;
    const f = ts[0] || touch.start, x = f.clientX !== undefined ? f.clientX : f.x, y = f.clientY !== undefined ? f.clientY : f.y;
    const h = findHit(x, y);
    if (h && h.prio) return h.fn();
    if (tapAny && zoneAt(x, y) === "panel") return tapAny();
    if (h) return h.fn();
    if (zoneAt(x, y) === "map"){
      // 双击星图放大
      const now = Date.now(); if (lastTap && now - lastTap.t < 320 && Math.hypot(x - lastTap.x, y - lastTap.y) < 30){ lastTap = null; zoom(.5, x, y, true); return; }
      lastTap = {t: now, x, y}; mapTap(x, y); } }
});
function clampScrollSoft(){ const ms = maxScroll(); if (pScroll < 0 || pScroll > ms){ clampScroll(); pVel = 0; } }

// ---------- 启动 ----------
computeLayout();
boot();
P.share(shareInfo);
// 从后台回来：清掉没收尾的触摸（否则之后的点击都会被当成双指）、重画星图、重启画面循环
function resetTouch(){ touch.pts.clear(); touch.active = false; touch.pinch = 0; touch.sheet = false; touch.mode = null; touch.moved = 0; press = null; pVel = 0;
  sheetH = sheetTarget(); L.panel.y = H - sheetH; L.panel.h = sheetH; }
P.onShow(() => { resetTouch(); mapKey = ""; heatKey = ""; try { refresh(); renderPanel(false); } catch(e){} startLoop(); });
P.onHide(() => { resetTouch(); core.save(); core.backup(); });
// 画面循环万一停了（有的手机切后台后不再回调），1.5 秒内自动重启
setInterval(() => { if (Date.now() - lastFrame > 1500) startLoop(); }, 1000);
startLoop();
// 浏览器预览里方便自动化测试
if (typeof window !== "undefined" && window.__wxPreview) window.__game = { get core(){ return core; }, get quiz(){ return quiz; }, get L(){ return L; }, get hits(){ return hits; }, get selected(){ return selected; }, get statN(){ return statN; }, boot, select, selectCons, showLevel, startQuiz, answer, nextQ, fit, polish, get reveal(){ return reveal; }, get run(){ return run; }, mapTap, get pick(){ return pick; }, get sheetK(){ return sheetK; }, get ign(){ return ign; }, get V(){ return V; }, get vb(){ return vb; }, toWorld, view, get pScroll(){ return pScroll; } };
