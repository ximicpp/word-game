// 单词星系 · 微信小游戏版：全部界面画在一块 Canvas 上。
// 上方是星图（可拖动、双指缩放、点星），下方是可滚动的面板（推荐、单词、答题、结果）。
const P = require("./platform.js");
const U = require("./ui.js");
const { createCore } = require("./core.js");
const { COL } = U;

const VERSION = "1.12";
const ctx = P.ctx, W = P.W, H = P.H, dpr = P.dpr;
const PAD = 16, AUTO_MS = 3500;
U.setFamilies(P.families || {});

// ---------- 规则核心（换词库时重建） ----------
let core, D, GAL, CONS, GW, GE, GC, consOf, adj, TYPES, POS, BBall, CP, ALLC;
function boot(){
  core = createCore(P.store, P.shiftDays);
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
  if (g) toast(`守护星帮你保住了连续天数（用掉 ${g} 颗）`);
  if (!core.S.lit.length) tip("first");
  if (core.fadingWords().length) tip("fade");
}
let weekCard = null, page = null;
const S = () => core.S;
const posOf = id => /^c\d+$/.test(id) ? CP[+id.slice(1)] : POS[id];

// ---------- 版面 ----------
const L = {};
function computeLayout(){
  const top = Math.max(P.safe.top || 0, 6);
  let r1y = top + 6, r1h = 32, r1right = W - PAD;
  if (P.menu){ r1y = P.menu.top; r1h = P.menu.height; r1right = P.menu.left - 10; }
  const r2y = r1y + r1h + 6, r2h = 28;
  L.head = {h: r2y + r2h + 8, r1y, r1h, r1right, r2y, r2h};
  const rest = H - L.head.h;
  const mh = Math.max(190, Math.round(rest * (quiz ? 0.3 : 0.47)));
  L.map = {x: 0, y: L.head.h, w: W, h: mh};
  L.panel = {x: 0, y: L.head.h + mh, w: W, h: H - L.head.h - mh, padB: Math.max(16, H - (P.safe.bottom || H) + 12)};
}

// ---------- 视野（和网页版 SVG viewBox 一样的算法） ----------
let vb = {x:0, y:0, w:1000, h:1000}, BB = vb, glideA = null;
const sc = () => Math.max(vb.w / L.map.w, vb.h / L.map.h);
function view(){ const s = sc(); return {s, ox: vb.x + (vb.w - L.map.w * s) / 2, oy: vb.y + (vb.h - L.map.h * s) / 2}; }
const toWorld = (sx, sy) => { const v = view(); return {x: v.ox + (sx - L.map.x) * v.s, y: v.oy + (sy - L.map.y) * v.s}; };
function glide(to){ glideA = {from: {...vb}, to, t0: Date.now()}; }
const go = (to, anim) => { if (anim) glide(to); else { glideA = null; vb = to; } };
function fit(anim){ go({...BB}, anim); }
// 一整张星空：先看已点亮的词和推荐的下一批
function fitActive(anim){ const ws = core.litArr.filter(w => core.rep(w) === w).concat(core.candidates().slice(0, 6).map(c => c.w));
  if (!ws.length) return fit(anim);
  fitWords(ws, 460, anim); }
function fitWords(ws, mn, anim){
  const xs = ws.map(w => POS[w].x), ys = ws.map(w => POS[w].y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, asp = L.map.h / L.map.w;
  let w = Math.max(Math.max(...xs) - Math.min(...xs) + 220, mn), h = Math.max(Math.max(...ys) - Math.min(...ys) + 220, mn * asp);
  if (h / w < asp) h = w * asp; else w = h / asp;
  go({x: cx - w/2, y: cy - h/2, w, h}, anim); }
function zoom(f, sx, sy, anim){ const v = view();
  const px = sx === undefined ? vb.x + vb.w/2 : v.ox + (sx - L.map.x) * v.s, py = sy === undefined ? vb.y + vb.h/2 : v.oy + (sy - L.map.y) * v.s;
  const nw = Math.min(BB.w * 2.5, Math.max(BB.w / 8, vb.w * f)), k = nw / vb.w;
  go({x: px - (px - vb.x) * k, y: py - (py - vb.y) * k, w: nw, h: vb.h * k}, anim); }
function focusOn(p){ const ww = 380, hh = ww * L.map.h / L.map.w; glide({x: p.x - ww/2, y: p.y - hh/2, w: ww, h: hh}); }
// 选中词：对准它和附近的相关词
function focusWord(w){ const ns = [w, ...[...core.nbSet(w)].filter(x => core.rep(x) === x && Math.hypot(POS[x].x - POS[w].x, POS[x].y - POS[w].y) < 260)];
  fitWords(ns, 340, true); }

// ---------- 状态 ----------
let selected = null, selCons = null, quiz = null, autoT = null, autoStart = 0, tapAny = null;
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
  const nbS = selected ? core.nbSet(selected) : null;
  V.nb = nbS; V.near = selected ? new Set([...nbS].map(core.rep)) : null;
  // 相关词太多时只给最重要的 14 个标名字（已点亮的优先）
  V.nbl = nbS ? new Set([...nbS].sort((a, b) => (core.isLit(b) - core.isLit(a)) || (core.IMP[b] - core.IMP[a])).slice(0, 14)) : new Set();
  V.selId = selected || (selCons !== null ? "c" + selCons : null);
  V.bundles = bundles().map(bd => { const ts = new Set(bd.list.map(i => D.edges[i][2]));
    return {pa: posOf(bd.ra), pb: posOf(bd.rb), n: bd.list.length, color: ts.size === 1 ? COL[[...ts][0]] : "#d9dfec",
      lit: bd.list.every(i => core.isLit(D.edges[i][0]) && core.isLit(D.edges[i][1])), hl: !!V.selId && (bd.ra === V.selId || bd.rb === V.selId)}; });
  // 挨着已点亮的词（强关系）：没点亮的星带一点暖色
  V.warm = new Set(); core.litArr.forEach(w => adj[w].forEach(e => { if (e.t !== "topic" && !core.isLit(e.w)) V.warm.add(e.w); }));
  // 连线分组：亮线按类型，选中词的连线单独画，一端点亮的光
  // 平时只画骨架：每颗点亮的星只连到离它最近的一个已点亮的相关词（强关系优先）；选中的词显示全部连线
  V.litE = {}; V.half = []; V.hl = []; const best = {};
  D.edges.forEach(([a, b, t], i) => { if (core.rep(a) !== a || core.rep(b) !== b) return; const la = core.isLit(a), lb = core.isLit(b), isHl = !!selected && (a === selected || b === selected);
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
  heatPrev = heat; heat = {c, x: B.x, y: B.y, w: Wd2 * HEAT_CELL, h: Hd * HEAT_CELL}; heatT0 = Date.now(); }

// ---------- 选择与导航 ----------
function select(w){ if (busy()) { if (w) toast("先完成这一轮答题"); return; }
  const back = !w && (quiz || selected || selCons !== null);
  if (w && core.rep(w) !== w) { S().folded = S().folded.filter(i => i !== consOf[w]); }
  quiz = null; page = null; selected = w; selCons = null; core.save(); refresh(); renderPanel(true);
  if (w) focusWord(w); else if (back) fitActive(true); }
function selectCons(i){ if (busy()) { toast("先完成这一轮答题"); return; }
  quiz = null; page = null; selected = null; selCons = i; refresh(); renderPanel(true); focusOn(CP[i]); }
function showLevel(){ if (busy()) { toast("先完成这一轮答题"); return; } quiz = null; page = "level"; selected = null; selCons = null; refresh(); renderPanel(true); }

function startQuiz(w, mode){
  selected = w; selCons = null; page = null;
  quiz = core.newQuiz(w, mode);
  if (S().lit.length && S().dust >= core.HINT_COST) tip("hint");
  refresh(); renderPanel(true); focusWord(w); }
function answer(k){ const z = quiz; const r = core.answer(z, k); if (!r) return;
  sfx(r.ok ? "ok" : "bad");
  if (r.milestone){ meteor(3); toast(`连击 ×${S().combo}！`); }
  refresh(); renderPanel(false); scrollTo = maxScroll(); }   // 小屏幕上让解析和“再答一次”露出来
function nextQ(){ clearTimeout(autoT); tapAny = null; const z = quiz; if (!z || z.done || z.picked === null) return;
  if (z.i < z.qs.length - 1){ z.i++; z.picked = null; renderPanel(true); } else if (z.mode === "review") finishReview(); else lightUp(); }
function lightUp(){
  const z = quiz, w = z.w; core.lightUp(z);
  // 点亮动画：镜头对准新星和已点亮的邻居 → 星星燃起、冲击波、星点四散 → 光沿连线流向已点亮的邻居
  const nbs = [...new Set(adj[w].filter(e => core.isLit(e.w) && core.rep(e.w) === e.w).map(e => e.w))]
    .sort((x, y) => Math.hypot(POS[x].x - POS[w].x, POS[x].y - POS[w].y) - Math.hypot(POS[y].x - POS[w].x, POS[y].y - POS[w].y)).slice(0, 12);
  const near = nbs.filter(x => Math.hypot(POS[x].x - POS[w].x, POS[x].y - POS[w].y) < 260);
  fitWords([w, ...near], 340, true);
  ign = {w, t0: Date.now(), nbs, T: core.tierOf(w), done: {}};
  ign.end = IGN_D0 + 520 + Math.max(0, nbs.length - 1) * IGN_STEP + IGN_BEAM + 200;
  refresh(); P.vibrate();
  if (z.goal || z.lvUp || z.ms.length || z.streak) meteor(8);
  sfx(z.newCons !== null || z.lvUp || z.ms.length || z.streak ? "cons" : "light");
  if (z.newCons !== null) meteor(5); else if (z.stars === 3) meteor(1);
  tip("stars"); if (z.newCons !== null) tip("cons");
  if (core.litArr.length === core.WORDS.length) toast("整片单词星系都点亮了！");
  else if (z.ms.length) toast(core.msText(z.ms[z.ms.length - 1]));
  else if (z.streak) toast(`连续 ${z.streak} 天！`);
  else if (z.lvUp) toast(`升到 Lv.${z.lvUp} · ${core.titleOf(z.lvUp)}！`);
  else if (z.goal) toast(`今日目标完成！星尘 +${core.GOAL_BONUS}`);
  else if (z.newCons !== null) toast(`连成了${CONS[z.newCons].name}！`);
  renderPanel(true);
}
const IGN_D0 = 380, IGN_STEP = 130, IGN_BEAM = 520;
let ign = null;
function ignTick(t){ if (!ign) return; const e = t - ign.t0;
  if (!ign.boom && e > IGN_D0 + 120){ ign.boom = true; const T = ign.T, n = 8 + T * 4, p = POS[ign.w];
    for (let k = 0; k < n; k++){ const a = k / n * Math.PI * 2 + Math.random() * .4, r = 24 + T * 8 + Math.random() * 26;
      sparks.push({x: p.x, y: p.y, dx: Math.cos(a) * r, dy: Math.sin(a) * r, r: 1.4 + Math.random() * 1.8, t0: t}); } }
  ign.nbs.forEach((x, k) => { const t0 = IGN_D0 + 520 + k * IGN_STEP;
    if (e > t0 && !ign.done["s" + k]) { ign.done["s" + k] = 1; if (k % 2 === 0) sfx("tick", k); }
    if (e > t0 + IGN_BEAM && !ign.done[x]) { ign.done[x] = 1; pops[x] = t; } });
  if (e > ign.end){ const z = quiz, w = ign.w; ign = null;
    if (z && z.w === w && z.newCons !== null && !core.isFolded(z.newCons)) core.fold(z.newCons, true);
    if (z && z.w === w && ign === null && ignTextFor(z)) fxText = {w, s: ignTextFor(z), t0: t};
    refresh(); } }
const ignTextFor = z => { const n = new Set(adj[z.w].filter(e => core.isLit(e.w)).map(e => e.w)).size; return n ? `+${n} 条星光` : ""; };
let fxText = null;
function finishReview(){
  const z = quiz; core.finishReview(z);
  if (z.goal){ toast(`今日目标完成！星尘 +${core.GOAL_BONUS}`); meteor(8); }
  if (z.streak){ toast(`连续 ${z.streak} 天！`); meteor(8); }
  refresh(); pop(z.w); sfx(z.giant || z.streak ? "cons" : "light"); if (z.giant) meteor(5); else if (z.miss === 0) meteor(1); renderPanel(true);
}
function quitQuiz(){ quiz = null; clearTimeout(autoT); tapAny = null; refresh(); renderPanel(true); }
function polish(){ const f = core.fadingWords(); if (!f.length) return; if (busy()) { toast("先完成这一轮答题"); return; } startQuiz(f[0], "review"); }
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
  add(h, (c, x, y) => { const w = o.w || cw();
    const st = { cta: ["lamp", null, "dark"], alt: [null, "rule", "ink"], danger: ["bad", null, "dark"], ghost: [null, "rule", "muted"], dash: [null, "rgba(255,201,92,.5)", "lamp"] }[kind];
    if (kind === "cta" && !o.noGlow){ c.save(); c.shadowColor = "rgba(255,201,92,.35)"; c.shadowBlur = 18; U.box(c, x, y, w, h, 10, st[0]); c.restore(); }
    else U.box(c, x, y, w, h, kind === "ghost" || kind === "dash" ? 8 : 10, st[0], st[1], 1, null);
    pressFx(c, x, y, w, h, 10);
    U.text(c, label, x + (o.left ? 14 : w / 2), y + h / 2, "cn", o.size || (kind === "cta" ? 16 : 14), st[2], {b: kind === "cta", align: o.left ? "left" : "center"});
    hit(x, y, w, h, fn); }); }
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
  if (top){ pScroll = 0; pVel = 0; scrollTo = null; }
  clampScroll();
}
const maxScroll = () => Math.max(0, PB.h + 16 + L.panel.padB - L.panel.h);
function clampScroll(){ pScroll = Math.max(0, Math.min(pScroll, maxScroll())); }

function pHome(){
  const fades = core.fadingWords(), cs0 = core.candidates(), lit = core.litArr.length;
  if (weekCard){ const wc = weekCard, n = S().lit.length, lv = core.lvOf(n), top = lv >= core.LV_AT.length;
    badge("新的一周", [T(wc.items.length ? `${wc.lastWeek ? "上周" : "上次以来"}你收获了：` : "新的一周，从这里继续。"),
      ...wc.items.map(([v, t]) => [T("\n"), T(String(v), {c: "lamp", b: 1, f: "mono"}), T(" " + t)]).flat(), T("\n"),
      T(top ? "已经满级了，去把更多星变成恒星吧。" : `这周再点亮 ${core.LV_AT[lv] - n} 颗，就能升到 Lv.${lv + 1}。`, {c: "muted"})]);
    gap(8); btn("开始这一周", "alt", () => { weekCard = null; renderPanel(false); }, {h: 36, size: 13}); gap(18); }
  if (lit < 3){ txt([T("在星系里随便逛：点任何一颗星都能看到意思、例句和相关的词。想学会哪个，就做题把它点亮。越重要的词题目越多，点亮后也越亮。")], {size: 15, lh: 23}); gap(12); }
  if (lit === core.WORDS.length){ bigWord("全部点亮！", {c: "lamp", glow: 1, size: 38}); gap(8); }
  if (fades.length){ btn(`擦亮变暗的星 · 还有 ${fades.length} 颗`, "cta", () => startQuiz(fades[0], "review")); gap(18); }
  const lw = V.luck;
  if (cs0.length){ const w = cs0[0].w;
    eyebrow("下一颗");
    gap(4); bigWord(w); txt(ipaRuns(w), {size: 17}); meta(w); gap(14);
    btn(`做题点亮 · ${core.qnOf(w)} 题`, fades.length ? "alt" : "cta", () => startQuiz(w, "light"));
    if (lw && lw !== w){ gap(12); btn("", "dash", () => startQuiz(lw, "light"), {h: 40}); const it = PB.items[PB.items.length - 1], d0 = it.draw;
      it.draw = (c, x, y) => { d0(c, x, y); U.text(c, "✦ 今天的幸运星", x + 12, y + 20, "cn", 14, "lamp"); U.text(c, lw, x + 12 + U.measure(c, "✦ 今天的幸运星 ", "cn", 14), y + 20, "w", 16, "lamp", {b: 1});
        U.text(c, "星尘翻倍", x + cw() - 12, y + 20, "cn", 12, "muted", {align: "right"}); }; }
    if (cs0.length > 1){ gap(22); eyebrow(`也可以选 · ${cs0.length - 1}`); gap(8); cands(cs0.slice(1, 7)); } }
  const lc = ALLC.filter(i => CONS[i].words.some(core.isLit)), frac = i => CONS[i].words.filter(core.isLit).length / CONS[i].words.length;
  const cs = lc.sort((a, b) => frac(b) - frac(a)).slice(0, 30), done = ALLC.filter(core.consDone).length;
  gap(14); foldHead(`星座 ${done} / ${ALLC.length}`, "cons");
  if (fold.cons){ if (cs.length) cs.forEach(consRow); else txt([T("点亮几颗星以后，这里会列出正在连的星座。", {c: "muted"})], {size: 13, lh: 20}); }
  foldHead("说明与记录", "info");
  if (fold.info){
    txt([T(`拖动或双指缩放地图，所有单词都在这一整张星空里。越亮越大的星越重要，题目也越多。点亮的词过几天会变暗，答 1 题就能擦亮。点亮的星会发热，学得越多，星空越暖。`)], {size: 13, lh: 20, c: "muted"});
    gap(8); txt([].concat(...core.TYPE_ORDER.map(t => [T("▬ ", {c: t}), T(TYPES[t].name + "   ", {c: "muted"})])), {size: 12, lh: 20});
    gap(8); txt([T(`正确率 ${S().answered ? Math.round(S().correct / S().answered * 100) + "%" : "—"} · 最高连击 ${S().best} · 星座 ${done} / ${core.NCONS}`)], {size: 13, lh: 20, c: "muted"});
    gap(8); txt([T(`单词星系 v${VERSION} · 当前词库 ${core.BANKS[core.BANK].name}，共 ${core.WORDS.length} 词。词表按剑桥 A2 Key（KET）、B1 Preliminary（PET）和 B2 First（FCE）的范围整理；例句为原创。`)], {size: 13, lh: 20, c: "muted"});
    gap(12); btn("重新开始", "ghost", askReset, {w: 90, h: 32, size: 13});
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
  gap(8); txt([T(d.cn)], {size: 18, lh: 26}); exBlock(d.ex);
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
function pLevel(){
  const n = S().lit.length, lv = core.lvOf(n), LA = core.LV_AT, top = lv >= LA.length, ex = core.examLit(), ms = S().ms || {}, sms = S().sms || {};
  const bar = (k) => add(10, (c, x, y) => { U.box(c, x, y + 2, cw(), 6, 3, "rule"); U.box(c, x, y + 2, Math.max(6, cw() * Math.min(1, k)), 6, 3, "lamp"); });
  add(40, (c, x, y) => { const lt = `Lv.${lv}`, bw = U.measure(c, lt, "mono", 15, 1) + 18; U.box(c, x, y + 4, bw, 30, 8, "lamp");
    U.text(c, lt, x + bw / 2, y + 19, "mono", 15, "dark", {align: "center", b: 1}); U.text(c, core.titleOf(lv), x + bw + 12, y + 19, "cn", 20, "ink", {b: 1}); });
  gap(6); bar(top ? 1 : (n - LA[lv - 1]) / (LA[lv] - LA[lv - 1]));
  gap(8); txt([T(top ? "已经满级了！" : `再点亮 `), ...(top ? [] : [T(String(LA[lv] - n), {c: "lamp", b: 1}), T(` 颗升到 Lv.${lv + 1}${core.titleOf(lv + 1) !== core.titleOf(lv) ? " · " + core.titleOf(lv + 1) : ""}。`)]),
    T(`一共点亮了 ${n} 个词，其中 `), T(String(core.giantCount()), {c: "lamp", b: 1}), T(" 颗恒星。")], {size: 14, lh: 21});
  core.EXAMS.filter(e => core.LVS.includes(e.lv) || ex[e.lv]).forEach(e => { const k = ex[e.lv] || 0, t = core.EXAM_N[e.lv];
    gap(16); add(22, (c, x, y) => { U.text(c, e.name, x, y + 10, "w", 15, "ink", {b: 1}); U.text(c, e.note, x + U.measure(c, e.name + " ", "w", 15, 1), y + 10, "w", 12, "muted");
      U.text(c, `${k} / ${t} · ${Math.floor(k / t * 100)}%`, x + cw(), y + 10, "mono", 12, "muted", {align: "right"}); });
    bar(k / t);
    gap(4); txt(core.QUARTERS.map(q => { const key = e.lv + ":" + q, on = key in ms; return T(`${on ? "★" : "☆"} ${q}%${ms[key] ? " · " + core.mdText(ms[key]) : ""}    `, {c: on ? "lamp" : "muted"}); }), {size: 12, lh: 18}); });
  gap(18); const sn = core.streakNow(), g = S().guard || 0;
  txt([T("连续 "), T(String(sn), {c: "lamp", b: 1, size: 18}), T(" 天", {}), T(`  · 最长 ${Math.max(S().streak && S().streak.best || 0, sn)} 天`, {c: "muted", size: 12})], {size: 14, lh: 24});
  gap(2); txt(core.STREAK_MS.slice(0, 6).map(m => T(`${m in sms ? "★" : "☆"} ${m}天   `, {c: m in sms ? "lamp" : "muted"})), {size: 12, lh: 18});
  gap(10); txt([T("守护星 "), T("◆".repeat(g), {c: "lamp"}), T("◇".repeat(core.GUARD_MAX - g), {c: "dim"})], {size: 14, lh: 22});
  gap(6); if (g >= core.GUARD_MAX) btn("已经存满", "ghost", () => {}, {h: 34, size: 13});
  else btn(`${core.GUARD_COST} 星尘换 1 颗守护星`, S().dust >= core.GUARD_COST ? "alt" : "ghost", () => { if (S().dust < core.GUARD_COST) toast(`星尘不够，需要 ${core.GUARD_COST}`); else buyGuard(); }, {h: 34, size: 13});
  gap(8); txt([T(`每天点亮或擦亮 1 颗星就算连续。守护星最多存 ${core.GUARD_MAX} 颗，哪天没来会自动用掉 1 颗，连续天数不会断。`, {c: "muted"})], {size: 12, lh: 18});
  gap(12); txt([T(`星座 ${ALLC.filter(core.consDone).length} / ${core.NCONS} · 正确率 ${S().answered ? Math.round(S().correct / S().answered * 100) + "%" : "—"} · 最高连击 ${S().best}`, {c: "muted"})], {size: 12, lh: 18});
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
    U.text(c, `${z.mode === "review" ? "擦亮" : "挑战"} ${w}`, x, y + 14, "mono", 12, "muted");
    const pw = 22, px = x + cw() - 40 - N * (pw + 6);
    for (let k = 0; k < N; k++){ const cl = k < z.i ? "good" : k === z.i ? (z.picked === null ? "ready" : right ? "good" : "bad") : "rule";
      U.box(c, px + k * (pw + 6), y + 11, pw, 6, 3, cl); }
    U.text(c, "✕", x + cw() - 8, y + 14, "cn", 16, "muted", {align: "right"});
    hit(x + cw() - 40, y - 6, 48, 42, quitQuiz, true); });
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
  if (z.picked !== null){
    gap(6); const Lr = U.layout(ctx, [T(right ? "答对了。" : "答错了。", {b: 1, c: right ? "good" : "bad"}), T(" "), ...q.explain], cw() - 28, {size: 14, lh: 21});
    add(Lr.h + 24, (c, x, y) => { U.box(c, x, y, cw(), Lr.h + 24, 10, "sky2"); U.drawLayout(c, Lr, x + 14, y + 12); });
    if (right){ gap(10); add(4, (c, x, y) => { U.box(c, x, y, cw(), 3, 2, "rule"); const k = Math.min(1, (Date.now() - autoStart) / AUTO_MS); U.box(c, x, y, cw() * k, 3, 2, "good"); });
      autoStart = Date.now(); autoT = setTimeout(nextQ, AUTO_MS); tapAny = nextQ; }
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
function pResult(){
  const z = quiz, w = z.w, c0 = z.newCons !== null ? CONS[z.newCons] : null, cs0 = core.candidates(new Set(z.unlocked));
  eyebrow("点亮成功"); bigWord(w, {c: "lamp", glow: 1, size: 40});
  txt([...starRuns(z.stars), T("   星尘 +" + z.dust, {c: "lamp", f: "mono", size: 12})], {size: 13, lh: 26});
  txt(ipaRuns(w), {size: 17}); gap(6); txt([T(D.words[w].cn)], {size: 18, lh: 26}); exBlock(D.words[w].ex);
  stageBadges(z);
  if (z.lucky) badge("✦ 幸运星", [T("今天的幸运星，星尘翻倍。")]);
  if (c0) badge("新星座：" + c0.name, [T(c0.note), T("\n"), T("已收起成一颗大星，点它可以展开。", {c: "muted"})]);
  if (cs0.length){ const t = cs0[0]; gap(16);
    btn(`继续：${t.w} · ${core.qnOf(t.w)} 题`, "cta", () => startQuiz(t.w, "light"));
    if (cs0.length > 1){ gap(20); eyebrow("也可以选"); gap(8); cands(cs0.slice(1, 5)); } }
  else { gap(16); btn("回到星图", "alt", () => { quiz = null; select(null); }); }
}
function pReviewDone(){
  const z = quiz, w = z.w, d = Math.round((S().mem[w].due - core.now()) / 864e5), f = core.fadingWords();
  eyebrow("擦亮成功"); bigWord(w, {c: "lamp", glow: 1, size: 40});
  txt([...starRuns(S().stars[w] || 3), ...(z.dust ? [T("   星尘 +" + z.dust, {c: "lamp", f: "mono", size: 12})] : [])], {size: 13, lh: 26});
  txt([T(D.words[w].cn)], {size: 18, lh: 26});
  const note = (z.gain ? "一次答对，多了一颗星！" : "") + (z.wasDue ? `下次 ${d} 天后再来看看它。` : "") + (z.near ? "再擦亮一次就成为恒星。" : "");
  if (note){ gap(6); txt([T(note)], {size: 13, c: "muted"}); }
  if (z.streak) streakBadge(z.streak);
  if (z.giant) badge(`新恒星：${w}`, [T(`它已经通过 ${core.GIANT_LV} 轮复习，算是真正记住了。现在一共有 ${core.giantCount()} 颗恒星。`), T("\n"), T(`恒星 ${core.INTERVALS[core.GIANT_LV]} 天才需要擦亮一次；答错会退回普通星。`, {c: "muted", size: 12})]);
  gap(16);
  if (f.length) btn(`擦亮下一颗 · 还有 ${f.length} 颗`, "cta", () => startQuiz(f[0], "review"));
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
  fade:   "有的星<b>变暗</b>了，说明该复习了。答对 1 题就能把它擦亮。"
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
const NEAR_COL = ["#5a5446", "#6b6250", "#847455"], DIM_COL = ["#3e4a6a", "#4f5c84", "#5d6a94"];
function geo(){ const v = view(), s = v.s, k = Math.min(1.5, Math.max(.45, 1 / s));
  return {v, s, k, far: s > 2.2, Z: x => x * k * s, PX: x => x * s}; }
function worldTf(c, v, sx0, sy0){ const m = L.map; c.setTransform(dpr / v.s, 0, 0, dpr / v.s, dpr * (m.x - (sx0 || 0) - v.ox / v.s), dpr * (m.y - (sy0 || 0) - v.oy / v.s)); }
const toScr = (p, v) => ({x: L.map.x + (p.x - v.ox) / v.s, y: L.map.y + (p.y - v.oy) / v.s});
function litR(w, Z){ const T0 = core.tierOf(w), st = S().stars[w] || 3; return Z(2.6 + T0 * .9) * (st === 1 ? .8 : 1); }
function drawStatic(c, G){ statN++;
  const {v, s, k, far, Z, PX} = G, m = L.map, MX = G.MX, MY = G.MY;
  const wx0 = v.ox - (40 + MX) * s, wy0 = v.oy - (40 + MY) * s, wx1 = v.ox + (m.w + MX + 40) * s, wy1 = v.oy + (m.h + MY + 40) * s;
  const inV = p => p.x > wx0 && p.x < wx1 && p.y > wy0 && p.y < wy1, skip = ign ? ign.w : null;
  worldTf(c, v, m.x - MX, m.y - MY); c.lineCap = "round";
  // 热力场
  if (heat){ const a = Math.min(1, (Date.now() - heatT0) / 600); c.imageSmoothingEnabled = true;
    if (heatPrev && a < 1){ c.globalAlpha = 1 - a; c.drawImage(heatPrev.c, heatPrev.x, heatPrev.y, heatPrev.w, heatPrev.h); }
    c.globalAlpha = a; c.drawImage(heat.c, heat.x, heat.y, heat.w, heat.h); c.globalAlpha = 1; }
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
function drawLit(c, w, p, Z, boost){
  const T0 = core.tierOf(w), fade = core.isFading(w), giant = core.isGiant(w), r = litR(w, Z) * (boost || 1);
  // 不画光晕外环（重要程度看热力场和星星大小）；只在点亮动画时闪一下
  if (boost && boost > 1.05){ c.globalAlpha = .35 * (boost - 1); c.beginPath(); c.arc(p.x, p.y, r * 3.4, 0, 6.2832); c.fillStyle = COL.lamp; c.fill(); c.globalAlpha = 1; }
  c.beginPath(); c.arc(p.x, p.y, r, 0, 6.2832); c.fillStyle = fade ? "#8a7440" : giant ? COL.cream : COL.lamp; c.fill();
 }
function drawMap(t){
  const m = L.map, c = ctx, G = geo(), {v, s, k, far, Z, PX} = G;
  c.save(); c.beginPath(); c.rect(m.x, m.y, m.w, m.h); c.clip();
  // 底色和背景小星星预先画好，按星图区域贴一块
  if (!skyCanvas || skyCanvas.mh !== m.h) makeSky();
  c.drawImage(skyCanvas, 0, 0, skyCanvas.width, skyCanvas.height, m.x, m.y, m.w, m.h);
  // 静态层：比星图四周多画一圈，拖动时直接平移贴图，移出这一圈或停下来再重画
  const MX = Math.round(m.w * .35), MY = Math.round(m.h * .35), LW = Math.round((m.w + 2 * MX) * dpr), LH = Math.round((m.h + 2 * MY) * dpr);
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
  if (!quiz){ V.rec.forEach(w => { if (w !== selected) ring(POS[w], Z(7), COL.ready, PX(1.3), .75); });
    if (V.luck && V.luck !== selected) ring(POS[V.luck], Z(8), COL.lamp, PX(1.4), .55 + .35 * Math.cos(t / 1600 * Math.PI * 2)); }
  core.fadingWords().slice(0, 40).forEach(w => { if (core.rep(w) === w) ring(POS[w], Z(7), "#b99a5a", PX(1.1), .8); });
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
    ign.nbs.forEach((x, q) => { const t0 = IGN_D0 + 520 + q * IGN_STEP, f = Math.min(1, Math.max(0, (e - t0) / IGN_BEAM)); if (f <= 0) return; const ff = 1 - Math.pow(1 - f, 3), px = POS[x];
      const tp = (adj[w].find(a => a.w === x) || {}).t || "topic";
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + (px.x - p.x) * ff, p.y + (px.y - p.y) * ff); c.strokeStyle = f < 1 ? COL.cream : COL[tp]; c.globalAlpha = f < 1 ? .9 : .6; c.lineWidth = PX(f < 1 ? 2 : 1.3); c.stroke(); c.globalAlpha = 1;
      if (f < 1){ c.beginPath(); c.arc(p.x + (px.x - p.x) * ff, p.y + (px.y - p.y) * ff, Z(2.4), 0, 6.2832); c.fillStyle = "#fff"; c.fill(); } });
    drawLit(c, w, p, Z, boost); }
  // 邻居被光流到时闪一下
  for (const w in pops){ const e = (t - pops[w]) / 700; if (e >= 1){ delete pops[w]; continue; } if (!POS[w]) continue; const p = POS[w];
    ring(p, Z(4 + 10 * e), COL.cream, PX(1.6 * (1 - e) + .3), 1 - e); }
  // 星点四散
  for (let q = sparks.length - 1; q >= 0; q--){ const sp = sparks[q], e = (t - sp.t0) / 900; if (e >= 1){ sparks.splice(q, 1); continue; }
    const qq = 1 - Math.pow(1 - e, 2); c.globalAlpha = 1 - qq; c.beginPath(); c.arc(sp.x + Z(sp.dx * .6) * qq, sp.y + Z(sp.dy * .6) * qq, Z(sp.r * .6) * (1 - .7 * qq), 0, 6.2832); c.fillStyle = COL.cream; c.fill(); }
  c.globalAlpha = 1;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  // 名字：只给选中的词和它最重要的 14 个相关词（以及答题、点亮中的词）
  const lab = (w, col, b, size) => { const q = toScr(POS[w], v); if (q.x < -60 || q.x > W + 60 || q.y < m.y - 20 || q.y > m.y + m.h + 20) return;
    U.text(c, w, q.x, q.y + Math.max(9, 12 / Math.max(s, .5)) + 6, "w", size || 12, col, {align: "center", b, stroke: COL.sky}); };
  if (selected){ V.nbl.forEach(w => { if (core.rep(w) === w) lab(w, core.isLit(w) ? COL.cream : "#aab4cc", 0, 11); }); lab(selected, "#fff", 1, 14); }
  if (quiz && quiz.w !== selected) lab(quiz.w, COL.cream, 1, 14);
  if (V.luck && !quiz){ const q = toScr(POS[V.luck], v); c.globalAlpha = .675 + .325 * Math.cos(t / 1600 * Math.PI * 2); U.text(c, "✦", q.x + 7, q.y - 9, "cn", 12, "lamp"); c.globalAlpha = 1; }
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
function drawZoom(){ const c = ctx, s = 32, x = W - 12 - s, y = L.map.y + L.map.h - 10 - s * 3 - 12;
  [["+", () => zoom(.7, undefined, undefined, true)], ["−", () => zoom(1.4, undefined, undefined, true)], ["⤢", () => fit(true)]].forEach(([lab, fn], k) => {
    const yy = y + k * (s + 6); U.box(c, x, yy, s, s, 8, "rgba(20,30,52,.9)", "rule"); pressFx(c, x, yy, s, s, 8);
    U.text(c, lab, x + s / 2, yy + s / 2 + 1, "cn", 16, "ink", {align: "center"}); hit(x - 4, yy - 3, s + 8, s + 6, fn); }); }
let tipCache = null;
function drawTip(){ if (!tipQ.length) return; const c = ctx, key = tipQ[0], w = Math.min(440, W - 76), x = 12;
  if (!tipCache || tipCache.key !== key){ const runs = TIPS[key].split(/<\/?b>/).map((s, k) => ({s, b: k % 2 ? 1 : 0, c: k % 2 ? "lamp" : "ink"})).filter(r => r.s);
    tipCache = {key, L: U.layout(c, runs, w - 28 - 70, {size: 14, lh: 21})}; }
  const Lr = tipCache.L, h = Math.max(48, Lr.h + 24), y = L.map.y + L.map.h - 10 - h;
  c.save(); c.shadowColor = "rgba(0,0,0,.5)"; c.shadowBlur = 30; c.shadowOffsetY = 8; U.box(c, x, y, w, h, 12, "#1b2742"); c.restore();
  U.box(c, x, y, w, h, 12, null, "rgba(255,201,92,.6)");
  U.drawLayout(c, Lr, x + 14, y + h / 2 - Lr.h / 2);
  const bw = 62, bx = x + w - 12 - bw, by = y + h / 2 - 15; U.box(c, bx, by, bw, 30, 8, "lamp"); U.text(c, "知道了", bx + bw / 2, by + 15, "cn", 13, "dark", {align: "center", b: 1});
  hits.push({x, y, w, h, fn: () => {}}); hit(bx - 6, by - 8, bw + 12, 46, closeTip); }

function drawHeader(){ const c = ctx, h = L.head, s = S();
  c.fillStyle = COL.sky2; c.fillRect(0, 0, W, h.h); c.fillStyle = COL.rule; c.fillRect(0, h.h - 1, W, 1);
  const lit = core.litArr.length, tot = core.WORDS.length;
  c.fillStyle = COL.lamp; c.save(); c.shadowColor = COL.lamp; c.shadowBlur = 8; c.fillRect(0, h.h - 2, W * lit / tot, 2); c.restore();
  const cy1 = h.r1y + h.r1h / 2;
  U.text(c, "单词星系", PAD, cy1, "cn", 17, "ink", {b: 1});
  const tw = U.measure(c, "单词星系", "cn", 17, 1), bx = PAD + tw + 10, bl = core.BANKS[core.BANK].name, bw = U.measure(c, bl, "mono", 11) + 18;
  U.box(c, bx, cy1 - 12, bw, 24, 8, null, "rgba(255,201,92,.4)"); pressFx(c, bx, cy1 - 12, bw, 24, 8); U.text(c, bl, bx + bw / 2, cy1, "mono", 11, "lamp", {align: "center"});
  hit(bx - 4, cy1 - 18, bw + 8, 36, askBank);
  // 等级：点开“我的星图”
  const n = s.lit.length, lv = core.lvOf(n), LA = core.LV_AT, top = lv >= LA.length, kf = top ? 1 : (n - LA[lv - 1]) / (LA[lv] - LA[lv - 1]);
  const lt = `Lv.${lv}`, lvw = U.measure(c, lt, "mono", 12, 1) + 46, lx = bx + bw + 8;
  U.box(c, lx, cy1 - 12, lvw, 24, 8, "rgba(255,201,92,.12)", "rgba(255,201,92,.45)"); pressFx(c, lx, cy1 - 12, lvw, 24, 8);
  U.text(c, lt, lx + 8, cy1, "mono", 12, "lamp", {b: 1}); const bx2 = lx + lvw - 32; U.box(c, bx2, cy1 - 2, 24, 4, 2, "rule"); U.box(c, bx2, cy1 - 2, Math.max(4, 24 * kf), 4, 2, "lamp");
  hit(lx - 4, cy1 - 18, lvw + 8, 36, showLevel);
  const totS = " / " + tot, tW = U.measure(c, totS, "mono", 12), lW = U.measure(c, String(lit), "mono", 16, 1), room = h.r1right - (lx + lvw + 8);
  if (room >= tW + lW){ U.text(c, totS, h.r1right, cy1, "mono", 12, "muted", {align: "right"}); U.text(c, String(lit), h.r1right - tW, cy1, "mono", 16, "lamp", {align: "right", b: 1}); }
  else if (room >= lW) U.text(c, String(lit), h.r1right, cy1, "mono", 16, "lamp", {align: "right", b: 1});
  // 第二行：今日目标、连续天数、星尘、连击 | 待擦亮、音效
  const cy = h.r2y + h.r2h / 2, dg = core.daily(), gp = Math.min(1, dg.n / core.GOAL);
  let x = PAD; c.lineWidth = 3; c.beginPath(); c.arc(x + 9, cy, 8, 0, 7); c.strokeStyle = COL.rule; c.stroke();
  if (gp > 0){ c.beginPath(); c.arc(x + 9, cy, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * gp); c.strokeStyle = COL.lamp; c.lineCap = "round"; c.stroke(); c.lineCap = "butt"; }
  x += 24; const gt = dg.done ? "今日完成" : `今日 ${dg.n}/${core.GOAL}`;
  U.text(c, gt, x, cy, "cn", 12, dg.done ? "lamp" : "muted"); x += U.measure(c, gt, "cn", 12) + 12;
  const sn = core.streakNow(), g = s.guard || 0;
  if (sn > 1 || g){ const st = sn > 1 ? `连续 ${sn} 天` : "", gs = "◆".repeat(g);
    if (st){ U.text(c, st, x, cy, "cn", 12, "lamp"); x += U.measure(c, st, "cn", 12) + 4; }
    if (gs){ U.text(c, gs, x, cy, "cn", 10, "ready"); x += U.measure(c, gs, "cn", 10) + 4; }
    hits.push({x: PAD + 20, y: cy - 16, w: x - PAD - 20, h: 32, fn: showLevel}); x += 8; }
  U.text(c, `星尘 ${s.dust}`, x, cy, "mono", 12, "lamp"); x += U.measure(c, `星尘 ${s.dust}`, "mono", 12) + 12;
  let rx = W - PAD; const mt = s.mute ? "静音" : "音效", mw = U.measure(c, mt, "cn", 12) + 18;
  rx -= mw; U.box(c, rx, cy - 12, mw, 24, 8, null, "rule"); pressFx(c, rx, cy - 12, mw, 24, 8); U.text(c, mt, rx + mw / 2, cy, "cn", 12, "muted", {align: "center"});
  hit(rx - 4, cy - 16, mw + 8, 32, () => { s.mute = !s.mute; core.save(); if (!s.mute) sfx("ok"); });
  const nf = core.fadingWords().length;
  if (nf){ const pt = `待擦亮 ${nf}`, pw = U.measure(c, pt, "cn", 12) + 18; rx -= pw + 8;
    U.box(c, rx, cy - 12, pw, 24, 8, null, "rgba(255,201,92,.5)"); pressFx(c, rx, cy - 12, pw, 24, 8); U.text(c, pt, rx + pw / 2, cy, "cn", 12, "lamp", {align: "center"}); hit(rx - 4, cy - 16, pw + 8, 32, polish); }
  if (s.combo >= 2 && x + 50 < rx) U.text(c, `连击 ×${s.combo}`, x, cy, "mono", 12, "lamp");
}
function drawPanel(){ const c = ctx, p = L.panel;
  c.fillStyle = COL.panel; c.fillRect(0, p.y, W, p.h); c.fillStyle = COL.rule; c.fillRect(0, p.y, W, 1);
  c.save(); c.beginPath(); c.rect(0, p.y + 1, W, p.h - 1); c.clip(); drawClip = {x: 0, y: p.y + 1, w: W, h: p.h - 1};
  const y0 = p.y + 16 - pScroll;
  PB.items.forEach(it => { const y = y0 + it.y; if (y + it.h < p.y - 40 || y > p.y + p.h + 40) return; it.draw(c, PAD, y); });
  drawClip = null; c.restore();
  // 可以继续往下滚时，底部渐隐提示
  if (pScroll < maxScroll() - 2){ const lg = c.createLinearGradient(0, H - 28, 0, H); lg.addColorStop(0, "rgba(20,30,52,0)"); lg.addColorStop(1, COL.panel); c.fillStyle = lg; c.fillRect(0, H - 28, W, 28); }
}
function drawToast(t){ if (!toastMsg) return; const e = t - toastT; if (e > 2200){ toastMsg = null; return; }
  const c = ctx, w = U.measure(c, toastMsg, "cn", 14, 1) + 32, x = W / 2 - w / 2, y = L.map.y + 54, a = e < 150 ? e / 150 : e > 1900 ? (2200 - e) / 300 : 1;
  c.save(); c.globalAlpha = a; c.shadowColor = "rgba(255,201,92,.5)"; c.shadowBlur = 24; U.box(c, x, y, w, 34, 17, "lamp"); c.restore();
  c.save(); c.globalAlpha = a; U.text(c, toastMsg, W / 2, y + 17, "cn", 14, "dark", {align: "center", b: 1}); c.restore(); }

let lastDraw = 0, frameN = 0;
function frame(){
  const t = Date.now();
  if (glideA){ const k = Math.min(1, (t - glideA.t0) / 350), e = 1 - Math.pow(1 - k, 3), f = glideA.from, to = glideA.to;
    vb = {x: f.x + (to.x - f.x) * e, y: f.y + (to.y - f.y) * e, w: f.w + (to.w - f.w) * e, h: f.h + (to.h - f.h) * e}; if (k >= 1) glideA = null; }
  if (pVel && !touch.active){ pScroll += pVel; pVel *= .94; if (Math.abs(pVel) < .3) pVel = 0; const ms = maxScroll(); if (pScroll < 0 || pScroll > ms){ clampScroll(); pVel = 0; } }
  if (scrollTo !== null){ if (touch.active) scrollTo = null; else { pScroll += (scrollTo - pScroll) * .2; if (Math.abs(scrollTo - pScroll) < 1){ pScroll = scrollTo; scrollTo = null; } } }
  // 空闲时降到约 15 帧，省电
  ignTick(t);
  const active = glideA || pVel || scrollTo !== null || touch.active || sparks.length || meteors.length || toastMsg || autoT && tapAny || ign || fxText || Object.keys(pops).length || (heat && t - heatT0 < 700) || (quiz && !quiz.done);
  frameN++;
  if (active || frameN % 4 === 0){
    hits = []; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
    ctx.fillStyle = COL.sky; ctx.fillRect(0, 0, W, H);
    drawMap(t); drawPanel(); drawHeader(); drawToast(t);
    lastDraw = t;
  }
  P.raf(frame);
}

// ---------- 触摸 ----------
const touch = {active: false, pts: new Map(), zone: null, moved: 0, pinch: 0, last: null, vy: 0, vx: 0};
function zoneAt(x, y){ if (y < L.head.h) return "head"; if (y < L.panel.y) return "map"; return "panel"; }
function findHit(x, y){ for (let k = hits.length - 1; k >= 0; k--){ const h = hits[k]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h; } return null; }
// 点哪儿就选离手指最近的那颗星（收起的星座优先）
function mapTap(x, y){ const p = toWorld(x, y), s = sc(), R = 22 * s;
  let best = null, bd = Infinity;
  ALLC.forEach(i => { if (!core.isFolded(i)) return; const d = Math.hypot(CP[i].x - p.x, CP[i].y - p.y); if (d < Math.max(R, 28 * s) && d < bd){ bd = d; best = {c: i}; } });
  if (!best) core.WORDS.forEach(w => { if (core.rep(w) !== w) return; const q = POS[w], d = Math.hypot(q.x - p.x, q.y - p.y); if (d < R && d < bd){ bd = d; best = {w}; } });
  if (best && best.c !== undefined) selectCons(best.c); else if (best) select(best.w); else select(null); }
P.onTouch({
  start(e){ const ts = e.changedTouches || e.touches || [];
    for (const tt of ts) touch.pts.set(tt.identifier, {x: tt.clientX, y: tt.clientY});
    if (!touch.active){ const f = ts[0]; touch.active = true; touch.zone = zoneAt(f.clientX, f.clientY); touch.moved = 0; touch.start = {x: f.clientX, y: f.clientY}; touch.t0 = Date.now();
      press = {x: f.clientX, y: f.clientY, moved: false}; pVel = 0; touch.vx = touch.vy = 0;
      const h = findHit(f.clientX, f.clientY); if (h && touch.zone === "map") touch.zone = "ui"; }
    if (touch.pts.size === 2 && (touch.zone === "map" || touch.zone === "ui")){ touch.zone = "map"; const [a, b] = [...touch.pts.values()]; touch.pinch = Math.hypot(a.x - b.x, a.y - b.y); touch.moved = 99; press = null; } },
  move(e){ const ts = e.changedTouches || e.touches || [];
    for (const tt of ts){ const prev = touch.pts.get(tt.identifier); if (!prev) continue; const p = {x: tt.clientX, y: tt.clientY}, dx = p.x - prev.x, dy = p.y - prev.y;
      touch.pts.set(tt.identifier, p);
      if (touch.pts.size === 1){ touch.moved += Math.abs(dx) + Math.abs(dy); if (touch.moved > 8 && press) press.moved = true;
        if (touch.zone === "map" || (touch.zone === "ui" && touch.moved > 8)){ touch.zone = "map"; glideA = null; const s = sc(); vb = {...vb, x: vb.x - dx * s, y: vb.y - dy * s}; }
        else if (touch.zone === "panel" && touch.moved > 6){ pScroll -= dy; touch.vy = -dy; const ms = maxScroll(); if (pScroll < 0) pScroll *= .5; if (pScroll > ms) pScroll = ms + (pScroll - ms) * .5; } } }
    if (touch.pts.size === 2 && touch.zone === "map" && touch.pinch){ const [a, b] = [...touch.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0){ zoom(touch.pinch / d, (a.x + b.x) / 2, (a.y + b.y) / 2); touch.pinch = d; } } },
  end(e){ const ts = e.changedTouches || [];
    for (const tt of ts) touch.pts.delete(tt.identifier);
    if (touch.pts.size < 2) touch.pinch = 0;
    if (touch.pts.size) return;
    touch.active = false; press = null;
    if (touch.zone === "panel"){ if (touch.moved > 6) pVel = touch.vy; clampScrollSoft(); }
    if (touch.moved >= 8) return;
    const f = ts[0] || touch.start, x = f.clientX !== undefined ? f.clientX : f.x, y = f.clientY !== undefined ? f.clientY : f.y;
    const h = findHit(x, y);
    if (h && h.prio) return h.fn();
    if (tapAny && zoneAt(x, y) === "panel") return tapAny();
    if (h) return h.fn();
    if (zoneAt(x, y) === "map") mapTap(x, y); }
});
function clampScrollSoft(){ const ms = maxScroll(); if (pScroll < 0 || pScroll > ms){ clampScroll(); pVel = 0; } }

// ---------- 启动 ----------
computeLayout();
boot();
P.share("单词星系：答对题目，点亮一整片单词星空");
P.onShow(() => { if (!busy()){ refresh(); renderPanel(false); } });
P.raf(frame);
// 浏览器预览里方便自动化测试
if (typeof window !== "undefined" && window.__wxPreview) window.__game = { get core(){ return core; }, get quiz(){ return quiz; }, get L(){ return L; }, get hits(){ return hits; }, get selected(){ return selected; }, get statN(){ return statN; }, boot, select, selectCons, showLevel, startQuiz, answer, nextQ, get ign(){ return ign; }, get V(){ return V; }, get vb(){ return vb; }, toWorld, view, get pScroll(){ return pScroll; } };
