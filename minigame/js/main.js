// 单词星系 · 微信小游戏版：全部界面画在一块 Canvas 上。
// 上方是星图（可拖动、双指缩放、点星），下方是可滚动的面板（推荐、单词、答题、结果）。
const P = require("./platform.js");
const U = require("./ui.js");
const { createCore } = require("./core.js");
const { COL } = U;

const VERSION = "1.5";
const ctx = P.ctx, W = P.W, H = P.H, dpr = P.dpr;
const PAD = 16, AUTO_MS = 1300;
U.setFamilies(P.families || {});

// ---------- 规则核心（换词库时重建） ----------
let core, D, GAL, CONS, GW, GE, GC, consOf, adj, TYPES, POS, BBg, CP;
function boot(){
  core = createCore(P.store, P.shiftDays);
  ({ D, GAL, CONS, GW, GE, GC, consOf, adj, TYPES } = core);
  POS = {}; core.WORDS.forEach(w => POS[w] = {x: D.words[w].p[0], y: D.words[w].p[1]});
  BBg = GAL.map((_, g) => { const xs = GW[g].map(w => POS[w].x), ys = GW[g].map(w => POS[w].y);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    return {x: x0 - 70, y: y0 - 90, w: Math.max(...xs) - x0 + 140, h: Math.max(...ys) - y0 + 150}; });
  CP = CONS.map(c => c.words.length ? { x: c.words.reduce((s,w) => s + POS[w].x, 0) / c.words.length, y: c.words.reduce((s,w) => s + POS[w].y, 0) / c.words.length,
    top: Math.min(...c.words.map(w => POS[w].y)) } : {x:0, y:0, top:0});
  quiz = null; selected = null; selCons = null; gbarX = null; tipQ.length = 0; tipCache = null;
  build(core.S.gal); refresh(); renderPanel(true);
  if (!core.S.lit.length) tip("first");
  if (core.fadingWords().length) tip("fade");
}
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
let vb = {x:0, y:0, w:1000, h:1000}, BB = vb, glideA = null, fadeA = null;
const sc = () => Math.max(vb.w / L.map.w, vb.h / L.map.h);
function view(){ const s = sc(); return {s, ox: vb.x + (vb.w - L.map.w * s) / 2, oy: vb.y + (vb.h - L.map.h * s) / 2}; }
const toWorld = (sx, sy) => { const v = view(); return {x: v.ox + (sx - L.map.x) * v.s, y: v.oy + (sy - L.map.y) * v.s}; };
function glide(to){ glideA = {from: {...vb}, to, t0: Date.now()}; }
const go = (to, anim) => { if (anim) glide(to); else { glideA = null; vb = to; } };
function fit(anim){ go({...BB}, anim); }
function fitActive(anim){ const ws = GW[core.cur].filter(w => core.status(w) !== "locked" && core.rep(w) === w);
  if (!ws.length || ws.length > GW[core.cur].length * .6) return fit(anim);
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

// ---------- 状态 ----------
let selected = null, selCons = null, quiz = null, autoT = null, autoStart = 0, tapAny = null;
const busy = () => quiz && !quiz.done;
const V = { rec: new Set(), luck: null, near: null, selId: null, bundles: [], gbar: [] };
function build(g){ core.setCur(g); BB = BBg[g]; computeLayout(); fitActive(false); }
function bundles(){
  const m = new Map();
  GE[core.cur].forEach(i => { const [a,b] = D.edges[i]; const ra = core.rep(a), rb = core.rep(b);
    if ((ra === a && rb === b) || ra === rb) return;
    const key = [ra, rb].sort().join("|");
    if (!m.has(key)) m.set(key, {ra, rb, list:[]}); m.get(key).list.push(i); });
  return [...m.values()];
}
// 状态变化后重新计算星图要用的东西（相当于网页版的 paint）
function refresh(){
  const cur = core.cur;
  V.rec = new Set(core.candidates().filter(c => core.gOf(c.w) === cur).slice(0, 3).map(c => c.w)); V.luck = core.lucky();
  V.near = selected ? new Set([...core.nbSet(selected)].map(core.rep)) : null;
  V.selId = selected || (selCons !== null ? "c" + selCons : null);
  V.bundles = bundles().map(bd => { const ts = new Set(bd.list.map(i => D.edges[i][2]));
    return {pa: posOf(bd.ra), pb: posOf(bd.rb), n: bd.list.length, color: ts.size === 1 ? COL[[...ts][0]] : "#d9dfec",
      lit: bd.list.every(i => core.isLit(D.edges[i][0]) && core.isLit(D.edges[i][1])), hl: !!V.selId && (bd.ra === V.selId || bd.rb === V.selId)}; });
  V.gain = {}; GW[cur].forEach(w => { if (core.status(w) === "ready") { const cl = core.consLeft(w), g = core.gainOf(w).length; V.gain[w] = cl === 0 ? "连成星座" : g ? "解锁" + g : ""; } });
  const lit = core.litArr.length, nextG = GAL.findIndex((_, g) => !core.openG[g]);
  V.gbar = [];
  GAL.forEach((G, g) => { const n = GW[g].filter(core.isLit).length, open = core.openG[g];
    if (!open && g !== nextG) return;
    const item = open ? {g, name: G.name, sub: n === GW[g].length ? "★" : `${n}/${GW[g].length}`, cur: g === cur, has: g !== cur && GW[g].some(w => core.readySet.has(w)), full: n === GW[g].length}
      : {g, name: G.name, sub: `再亮 ${g * core.OPEN_STEP - lit} 颗`, next: true};
    item.w = U.measure(ctx, item.name, "cn", 13) + U.measure(ctx, item.sub, "mono", 11) + 28; V.gbar.push(item); });
  let x = 12; V.gbar.forEach(it => { it.x = x; x += it.w + 6; }); V.gbarW = x + 6;
  if (gbarX === null){ const c = V.gbar.find(it => it.cur); gbarX = c ? c.x + c.w / 2 - W / 2 : 0; }
  gbarX = Math.max(0, Math.min(gbarX, V.gbarW - W));
}

// ---------- 选择与导航 ----------
function select(w){ if (busy()) { if (w) toast("先完成这一轮答题"); return; }
  const back = !w && (quiz || selected || selCons !== null);
  if (w && core.gOf(w) !== core.cur) build(core.gOf(w));
  if (w && core.rep(w) !== w) { S().folded = S().folded.filter(i => i !== consOf[w]); }
  quiz = null; selected = w; selCons = null; core.save(); refresh(); renderPanel(true);
  if (w) focusOn(POS[w]); else if (back) fitActive(true); }
function selectCons(i){ if (busy()) { toast("先完成这一轮答题"); return; }
  quiz = null; selected = null; selCons = i; refresh(); renderPanel(true); focusOn(CP[i]); }
function switchGal(g){ if (busy()) { toast("先完成这一轮答题"); return; }
  if (g === core.cur) { fit(true); return; }
  fadeA = {t0: Date.now()};
  glide({x: vb.x - vb.w * .3, y: vb.y - vb.h * .3, w: vb.w * 1.6, h: vb.h * 1.6});
  setTimeout(() => { selected = null; selCons = null; build(g); core.save(); refresh(); renderPanel(true);
    const t = {...vb}; vb = {x: t.x - t.w * .4, y: t.y - t.h * .4, w: t.w * 1.8, h: t.h * 1.8}; glide(t); }, 220); }

function startQuiz(w, mode){
  if (core.gOf(w) !== core.cur) build(core.gOf(w));
  selected = w; selCons = null;
  quiz = core.newQuiz(w, mode);
  if (S().lit.length && S().dust >= core.HINT_COST) tip("hint");
  refresh(); renderPanel(true); focusOn(POS[w]); }
function answer(k){ const z = quiz; const r = core.answer(z, k); if (!r) return;
  sfx(r.ok ? "ok" : "bad");
  if (r.milestone){ meteor(3); toast(`连击 ×${S().combo}！`); }
  refresh(); renderPanel(false); scrollTo = maxScroll(); }   // 小屏幕上让解析和“再答一次”露出来
function nextQ(){ clearTimeout(autoT); tapAny = null; const z = quiz; if (!z || z.done || z.picked === null) return;
  if (z.i < z.qs.length - 1){ z.i++; z.picked = null; renderPanel(true); } else if (z.mode === "review") finishReview(); else lightUp(); }
function lightUp(){
  const z = quiz, w = z.w; core.lightUp(z);
  refresh(); pop(w); burst(w, z.unlocked); P.vibrate();
  setTimeout(() => { if (quiz === z) fitWords([w, ...z.unlocked.filter(x => core.gOf(x) === core.cur)], 420, true); }, 450);
  if (z.goal || z.galDone) meteor(8);
  sfx(z.newCons !== null ? "cons" : "light");
  if (z.newCons !== null) meteor(5); else if (z.stars === 3) meteor(1);
  tip("stars"); if (z.unlocked.length) tip("choose"); if (z.newCons !== null) tip("cons"); if (z.newGal.length) tip("galaxy");
  if (core.litArr.length === core.WORDS.length) toast("整片单词星系都点亮了！");
  else if (z.goal) toast(`今日目标完成！星尘 +${core.GOAL_BONUS}`);
  else if (z.newCons !== null) toast(`连成了${CONS[z.newCons].name}！`);
  else if (z.newGal.length) toast(z.newGal.length === 1 ? `新星系开放：${GAL[z.newGal[0]].name}` : `开放了 ${z.newGal.length} 个新星系`);
  renderPanel(true);
}
function finishReview(){
  const z = quiz; core.finishReview(z);
  if (z.goal){ toast(`今日目标完成！星尘 +${core.GOAL_BONUS}`); meteor(8); }
  refresh(); pop(z.w); sfx("light"); if (z.miss === 0) meteor(1); renderPanel(true);
}
function quitQuiz(){ quiz = null; clearTimeout(autoT); tapAny = null; refresh(); renderPanel(true); }
function polish(){ const f = core.fadingWords(); if (!f.length) return; if (busy()) { toast("先完成这一轮答题"); return; } startQuiz(f[0], "review"); }
function askBank(){ if (busy()) { toast("先完成这一轮答题"); return; }
  const lit = new Set(S().lit), keys = Object.keys(core.BANKS);
  const items = keys.map(k => { const b = core.BANKS[k], ws = Object.keys(core.RAW.words).filter(w => b.lv.includes(core.RAW.words[w].lv)), n = ws.filter(w => lit.has(w)).length;
    return `${k === core.BANK ? "✓ " : ""}${b.name} · ${ws.length} 词${n ? ` · 已亮 ${n}` : ""}`; });
  P.actionSheet(items, i => { const k = keys[i]; if (!k || k === core.BANK) return; core.setBank(k); boot(); toast(`已换成 ${core.BANKS[k].name} 词库`); }); }
function askReset(){
  P.confirm("重新开始？", `会清除已点亮的 ${S().lit.length} 个词和答题记录，不能恢复。`, "清除并重来", () => {
    core.reset(); quiz = null; selected = null; selCons = null; gbarX = null; build(0); refresh(); renderPanel(true); }); }

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
    else U.box(c, x, y, w, h, kind === "ghost" || kind === "dash" ? 8 : 10, st[0], st[1], 1, kind === "dash" ? [4, 3] : null);
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
function diffRuns(w){ return [1,2,3].map(k => T("●", {c: k <= core.DIFF[w] ? "form" : "dim", size: 10})); }
const starRuns = n => [T("★".repeat(n), {c: "lamp", size: 17}), T("★".repeat(3 - n), {c: "dim", size: 17})];
function metaRuns(w){ const g = core.gainOf(w).length, cl = core.consLeft(w), r = [];
  if (w === V.luck) r.push(T("✦ 幸运星 星尘翻倍   ", {c: "lamp"}));
  r.push(...diffRuns(w), T("   "));
  r.push(...(g ? [T("解锁 ", {c: "muted"}), T(g, {c: "ink", b: 1})] : [T("不解锁新词", {c: "muted"})]), T("   "));
  if (cl === 0) r.push(T("点亮就连成" + CONS[consOf[w]].name + "   ", {c: "lamp"})); else if (cl !== null) r.push(T(CONS[consOf[w]].name + "还差 " + cl + "   ", {c: "muted"}));
  r.push(T(`星尘 +${core.dustFor(w, 1)}~${core.dustFor(w, 3)}`, {c: "muted"}));
  return r; }
function meta(w){ gap(8); txt(metaRuns(w), {size: 13, lh: 20}); }
function cands(list){
  list.forEach(({w, g, cl}) => { add(44, (c, x, y) => { const ww = cw(), h = 38;
    U.box(c, x, y, ww, h, 8, "sky2", "rgba(159,216,255,.4)"); pressFx(c, x, y, ww, h, 8);
    U.text(c, w, x + 10, y + h / 2, "w", 15, "ink");
    const dx = x + ww * .48; [1,2,3].forEach(k => { c.beginPath(); c.arc(dx + (k - 1) * 10, y + h / 2, 3.5, 0, 7); c.fillStyle = k <= core.DIFF[w] ? COL.form : COL.dim; c.fill(); });
    const right = cl === 0 ? "连成星座" : core.gOf(w) !== core.cur ? GAL[core.gOf(w)].name : "";
    U.text(c, g ? "解锁 " + g : "—", x + ww * .62, y + h / 2, "cn", 12, "muted");
    if (right) U.text(c, right, x + ww - 10, y + h / 2, "cn", 12, cl === 0 ? "lamp" : "muted", {align: "right"});
    hit(x, y, ww, h, () => startQuiz(w, "light")); }); }); }
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
  if (lit < 3){ txt([T("答对题目就能点亮单词。点亮一颗星，它旁边的星就能挑战了。")], {size: 15, lh: 23}); gap(12); }
  if (lit === core.WORDS.length){ bigWord("全部点亮！", {c: "lamp", glow: 1, size: 38}); gap(8); }
  if (fades.length){ btn(`擦亮变暗的星 · 还有 ${fades.length} 颗`, "cta", () => startQuiz(fades[0], "review")); gap(18); }
  const lw = V.luck;
  if (cs0.length){ const w = cs0[0].w;
    eyebrow("下一颗" + (core.gOf(w) !== core.cur ? " · " + GAL[core.gOf(w)].name : ""));
    gap(4); bigWord(w); txt(ipaRuns(w), {size: 17}); meta(w); gap(14);
    btn(`开始挑战 · ${core.QN} 题`, fades.length ? "alt" : "cta", () => startQuiz(w, "light"));
    if (lw && lw !== w){ gap(12); btn("", "dash", () => startQuiz(lw, "light"), {h: 40}); const it = PB.items[PB.items.length - 1], d0 = it.draw;
      it.draw = (c, x, y) => { d0(c, x, y); U.text(c, "✦ 今天的幸运星", x + 12, y + 20, "cn", 14, "lamp"); U.text(c, lw, x + 12 + U.measure(c, "✦ 今天的幸运星 ", "cn", 14), y + 20, "w", 16, "lamp", {b: 1});
        U.text(c, "星尘翻倍", x + cw() - 12, y + 20, "cn", 12, "muted", {align: "right"}); }; }
    if (cs0.length > 1){ gap(22); eyebrow(`也可以选 · ${cs0.length - 1}`); gap(8); cands(cs0.slice(1, 7)); } }
  const cs = GC[core.cur], done = cs.filter(core.consDone).length;
  gap(14); foldHead(`${GAL[core.cur].name} · 星座 ${done} / ${cs.length}`, "cons");
  if (fold.cons) cs.forEach(consRow);
  foldHead("说明与记录", "info");
  if (fold.info){
    txt([T(`拖动或双指缩放地图，上方切换星系。每点亮 ${core.OPEN_STEP} 个词开放一个新星系。点亮的词过几天会变暗，答 1 题就能擦亮。`)], {size: 13, lh: 20, c: "muted"});
    gap(8); txt([].concat(...core.TYPE_ORDER.map(t => [T("▬ ", {c: t}), T(TYPES[t].name + "   ", {c: "muted"})])), {size: 12, lh: 20});
    gap(8); txt([T(`正确率 ${S().answered ? Math.round(S().correct / S().answered * 100) + "%" : "—"} · 最高连击 ${S().best} · 星座 ${core.ALLC.filter(core.consDone).length} / ${core.NCONS}`)], {size: 13, lh: 20, c: "muted"});
    gap(8); txt([T(`单词星系 v${VERSION} · 当前词库 ${core.BANKS[core.BANK].name}，共 ${core.WORDS.length} 词。词表按剑桥 A2 Key（KET）、B1 Preliminary（PET）和 B2 First（FCE）的范围整理；例句为原创。`)], {size: 13, lh: 20, c: "muted"});
    gap(12); btn("重新开始", "ghost", askReset, {w: 90, h: 32, size: 13});
  }
}
function pWord(){
  const w = selected, d = D.words[w], s = core.status(w);
  bigWord(w); txt(ipaRuns(w), {size: 17});
  if (s === "ready"){ meta(w); gap(16); btn(`开始挑战 · ${core.QN} 题`, "cta", () => startQuiz(w, "light")); }
  else if (s === "locked"){ gap(8); txt([T("还没解锁。先点亮它旁边的星（地图上亮着的连线）。")], {size: 14, c: "muted", lh: 21}); }
  else {
    gap(8); txt([T(d.cn)], {size: 18, lh: 26}); exBlock(d.ex);
    gap(10); txt([...starRuns(S().stars[w] || 3), T("   " + core.dueText(w), {c: "muted", size: 13})], {size: 13, lh: 24});
    if (core.isFading(w)){ gap(14); btn("擦亮它 · 1 题", "cta", () => startQuiz(w, "review")); }
    else if ((S().stars[w] || 3) < 3){ gap(14); btn("再答 1 题，多拿一颗星", "alt", () => startQuiz(w, "review")); }
    const lk = adj[w].filter(e => core.isLit(e.w));
    if (lk.length){ gap(22); eyebrow(`点亮的连线 · ${lk.length}`); gap(6);
      lk.forEach(e => { const Lr = U.layout(ctx, [T(TYPES[e.t].name + " ", {c: e.t}), Wd(e.w, {c: "ink", b: 1}), T("：" + e.note, {c: "muted"})], cw(), {size: 13, lh: 20});
        add(Lr.h + 6, (c, x, y) => { U.drawLayout(c, Lr, x, y); hit(x, y, cw(), Lr.h, () => select(e.w)); }); }); }
  }
  const ci = consOf[w];
  if (ci !== undefined){ gap(18); consRow(ci); }
  back();
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
function pResult(){
  const z = quiz, w = z.w, c0 = z.newCons !== null ? CONS[z.newCons] : null, cs0 = core.candidates(new Set(z.unlocked));
  eyebrow("点亮成功"); bigWord(w, {c: "lamp", glow: 1, size: 40});
  txt([...starRuns(z.stars), T("   星尘 +" + z.dust, {c: "lamp", f: "mono", size: 12})], {size: 13, lh: 26});
  txt(ipaRuns(w), {size: 17}); gap(6); txt([T(D.words[w].cn)], {size: 18, lh: 26}); exBlock(D.words[w].ex);
  if (z.galDone) badge(`${GAL[core.gOf(w)].name}全部点亮！`, [T(`这个星系的 ${GW[core.gOf(w)].length} 颗星都亮了。`)]);
  if (z.lucky) badge("✦ 幸运星", [T("今天的幸运星，星尘翻倍。")]);
  if (c0) badge("新星座：" + c0.name, [T(c0.note), T("\n"), T("已收起成一颗大星，点它可以展开。", {c: "muted"})]);
  if (cs0.length){ const t = cs0[0]; gap(16);
    btn(`继续：${t.w} · ${core.QN} 题`, "cta", () => startQuiz(t.w, "light"));
    if (cs0.length > 1){ gap(20); eyebrow(z.unlocked.length ? `新解锁 ${z.unlocked.length} 个` : "也可以选"); gap(8); cands(cs0.slice(1, 5)); } }
  else { gap(16); btn("回到星图", "alt", () => { quiz = null; select(null); }); }
}
function pReviewDone(){
  const z = quiz, w = z.w, d = Math.round((S().mem[w].due - core.now()) / 864e5), f = core.fadingWords();
  eyebrow("擦亮成功"); bigWord(w, {c: "lamp", glow: 1, size: 40});
  txt([...starRuns(S().stars[w] || 3), ...(z.dust ? [T("   星尘 +" + z.dust, {c: "lamp", f: "mono", size: 12})] : [])], {size: 13, lh: 26});
  txt([T(D.words[w].cn)], {size: 18, lh: 26});
  const note = (z.gain ? "一次答对，多了一颗星！" : "") + (z.wasDue ? `下次 ${d} 天后再来看看它。` : "");
  if (note){ gap(6); txt([T(note)], {size: 13, c: "muted"}); }
  gap(16);
  if (f.length) btn(`擦亮下一颗 · 还有 ${f.length} 颗`, "cta", () => startQuiz(f[0], "review"));
  else { const c = core.candidates(); if (c.length) btn(`继续：${c[0].w} · ${core.QN} 题`, "cta", () => startQuiz(c[0].w, "light"));
    else btn("回到星图", "alt", () => { quiz = null; select(null); }); }
}

// ---------- 提示、提醒、音效 ----------
const TIPS = {
  first:  "点<b>开始挑战</b>，答对几道题就能点亮这颗星。",
  stars:  "点亮了！一次全对得 <b>3 颗星</b>，答错会暗一些。拿到的<b>星尘</b>可以换提示卡。",
  choose: "旁边的星能挑战了。地图上的“<b>解锁 3</b>”表示点亮它能再打开 3 颗星。按推荐走，或者自己挑。",
  hint:   "星尘够了！答题时可以用<b>提示卡</b>去掉两个错误选项。",
  cons:   "连成<b>星座</b>了！它已经收起成一颗大星，点它可以展开。",
  galaxy: "开放了新的<b>星系</b>！在地图上方切换。",
  fade:   "有的星<b>变暗</b>了，说明该复习了。答对 1 题就能把它擦亮。"
};
const tipQ = [];
function tip(key){ if (!S().tips) S().tips = {}; if (S().tips[key] || tipQ.includes(key)) return; tipQ.push(key); }
function closeTip(){ const k = tipQ.shift(); if (k){ S().tips[k] = 1; core.save(); } }
let toastMsg = null, toastT = 0;
function toast(m){ toastMsg = m; toastT = Date.now(); }
function sfx(kind){ if (S().mute) return; const AC = P.audio(); if (!AC) return;
  try { if (AC.state === "suspended" && AC.resume) AC.resume();
    const seq = {ok:[[880,0],[1319,.07]], bad:[[220,0],[175,.12]], light:[[523,0],[659,.08],[784,.16],[1047,.24]], cons:[[523,0],[659,.1],[784,.2],[1047,.3],[1568,.42]]}[kind];
    const t0 = AC.currentTime;
    seq.forEach(([f, dt]) => { const o = AC.createOscillator(), g = AC.createGain();
      o.type = kind === "bad" ? "triangle" : "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + dt); g.gain.exponentialRampToValueAtTime(kind === "bad" ? 0.12 : 0.09, t0 + dt + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.28);
      o.connect(g); g.connect(AC.destination); o.start(t0 + dt); o.stop(t0 + dt + 0.3); }); } catch(e){} }

// ---------- 动画效果 ----------
const pops = {}, sparks = [], flows = {}, meteors = [];
function pop(w){ pops[w] = Date.now(); }
function burst(w, unlocked){ const t = Date.now();
  for (let k = 0; k < 10; k++){ const a = k / 10 * Math.PI * 2 + Math.random() * .4, r = 26 + Math.random() * 22;
    sparks.push({x: POS[w].x, y: POS[w].y, dx: Math.cos(a) * r, dy: Math.sin(a) * r, r: 1.6 + Math.random() * 1.6, t0: t}); }
  const nu = new Set(unlocked);
  GE[core.cur].forEach(i => { const [a, b] = D.edges[i]; if ((a === w && nu.has(b)) || (b === w && nu.has(a))) flows[i] = t + 2700; }); }
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
function makeSky(){ skyCanvas = P.offscreen(Math.round(W * dpr), Math.round(H * dpr)); const x = skyCanvas.getContext("2d"); x.scale(dpr, dpr);
  let sd = 11; const rn = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < W * H / 2600; k++){ x.globalAlpha = .15 + rn() * .45; x.fillStyle = rn() < .15 ? "#ffe6b0" : "#cfd8ff";
    x.beginPath(); x.arc(rn() * W, rn() * H, rn() < .92 ? .7 : 1.3, 0, 7); x.fill(); } }

function drawMap(t){
  const m = L.map, c = ctx;
  c.save(); c.beginPath(); c.rect(m.x, m.y, m.w, m.h); c.clip();
  const gr = c.createRadialGradient(m.x + m.w * .3, m.y + m.h * .2, 0, m.x + m.w * .3, m.y + m.h * .2, Math.max(m.w, m.h) * .9);
  gr.addColorStop(0, "#16213d"); gr.addColorStop(.6, COL.sky); gr.addColorStop(1, COL.sky); c.fillStyle = gr; c.fillRect(m.x, m.y, m.w, m.h);
  if (skyCanvas) c.drawImage(skyCanvas, 0, 0, W * dpr, H * dpr, 0, 0, W, H);
  let fa = 1; if (fadeA){ const k = (t - fadeA.t0) / 220; fa = k < 1 ? 1 - k : k < 2 ? k - 1 : 1; if (k >= 2) fadeA = null; }
  c.globalAlpha = fa;
  const v = view(), s = v.s, far = s > 1.1, cur = core.cur;   // 手机屏幕小，比网页版晚一点隐藏未解锁的词名
  c.setTransform(dpr / s, 0, 0, dpr / s, dpr * (m.x - v.ox / s), dpr * (m.y - v.oy / s));
  const wx0 = v.ox - 60, wy0 = v.oy - 60, wx1 = v.ox + m.w * s + 60, wy1 = v.oy + m.h * s + 60;
  const inView = p => p.x > wx0 && p.x < wx1 && p.y > wy0 && p.y < wy1;
  c.lineCap = "round";
  // 星座光带
  GC[cur].forEach(i => { if (!core.consDone(i) || core.isFolded(i)) return; const set = new Set(CONS[i].words);
    c.beginPath(); GE[cur].forEach(k => { const [a, b] = D.edges[k]; if (set.has(a) && set.has(b)){ c.moveTo(POS[a].x, POS[a].y); c.lineTo(POS[b].x, POS[b].y); } });
    c.globalAlpha = fa * .16; c.strokeStyle = COL.lamp; c.lineWidth = 7; c.stroke(); c.globalAlpha = fa;
    U.text(c, CONS[i].name, CP[i].x, CP[i].top - 18, "cn", 12, "rgba(255,201,92,.75)", {align: "center", stroke: COL.sky}); });
  // 连线：按颜色、透明度、粗细分组一次画完
  const groups = new Map(), flowing = [];
  GE[cur].forEach(i => { const [a, b, tp] = D.edges[i]; if (core.rep(a) !== a || core.rep(b) !== b) return;
    if (!inView(POS[a]) && !inView(POS[b])) return;
    if (flows[i] > t){ flowing.push(i); return; }
    const la = core.isLit(a), lb = core.isLit(b), weak = tp === "topic", hl = !!selected && (a === selected || b === selected);
    let al = weak ? .07 : .16, lw = 1.2;
    if (la !== lb) al = weak ? .22 : .4;
    if (la && lb){ al = weak ? .55 : .95; lw = weak ? 1.4 : 2; }
    if (hl){ al = 1; lw = 2.6; }
    const key = tp + "|" + al + "|" + lw; let g = groups.get(key); if (!g) groups.set(key, g = {tp, al, lw, list: []}); g.list.push(i); });
  groups.forEach(g => { c.beginPath(); g.list.forEach(i => { const [a, b] = D.edges[i]; c.moveTo(POS[a].x, POS[a].y); c.lineTo(POS[b].x, POS[b].y); });
    c.globalAlpha = fa * g.al; c.strokeStyle = COL[g.tp]; c.lineWidth = g.lw; c.stroke(); });
  c.globalAlpha = fa;
  if (flowing.length){ U.setDash(c, [5, 7]); c.lineDashOffset = -((t % 900) / 900) * 24; c.lineWidth = 2.6;
    flowing.forEach(i => { const [a, b, tp] = D.edges[i]; c.beginPath(); c.moveTo(POS[a].x, POS[a].y); c.lineTo(POS[b].x, POS[b].y); c.strokeStyle = COL[tp]; c.stroke(); });
    U.setDash(c, []); c.lineDashOffset = 0; }
  // 收起后的连线束
  V.bundles.forEach(bd => { c.beginPath(); c.moveTo(bd.pa.x, bd.pa.y); c.lineTo(bd.pb.x, bd.pb.y); c.strokeStyle = bd.color;
    c.globalAlpha = fa * (bd.hl ? 1 : bd.lit ? .85 : .45); c.lineWidth = bd.hl ? 3 : bd.lit ? 2.2 : 1.6; c.stroke(); c.globalAlpha = fa;
    if (bd.n > 1){ const mx = (bd.pa.x + bd.pb.x) / 2, my = (bd.pa.y + bd.pb.y) / 2; c.beginPath(); c.arc(mx, my, 8, 0, 7); c.fillStyle = COL.sky2; c.fill(); c.strokeStyle = COL.rule; c.lineWidth = 1; c.stroke();
      U.text(c, String(bd.n), mx, my, "mono", 10, "ink", {align: "center"}); } });
  // 星点
  GW[cur].forEach(w => { if (core.rep(w) !== w) return; const p = POS[w]; if (!inView(p)) return;
    const st = core.status(w), lit = st === "lit", fade = core.isFading(w), sel = w === selected, stars = S().stars[w] || 3;
    const dim = (!!selected && !sel && !V.near.has(w)) || (selCons !== null && consOf[w] !== selCons);
    c.globalAlpha = fa * (dim ? .35 : 1);
    // 光晕
    let ha = lit ? (fade ? .04 : stars === 1 ? .09 : stars === 2 ? .17 : .3) : 0, hr = 22;
    if (pops[w]){ const k = (t - pops[w]) / 1200; if (k < 1){ const e = 1 - Math.pow(1 - k, 2); ha = .9 + (Math.max(ha, .22) - .9) * e; hr = 22 * (.6 + .4 * e); } else delete pops[w]; }
    if (ha){ c.globalAlpha = fa * (dim ? .35 : 1) * ha; c.beginPath(); c.arc(p.x, p.y, hr, 0, 7); c.fillStyle = COL.lamp; c.fill(); c.globalAlpha = fa * (dim ? .35 : 1); }
    // 外环
    let ring = null;
    if (sel) ring = {c: "#fff", w: 2};
    else if (lit && fade) ring = {c: "#b99a5a", w: 1.5, d: [2, 3], spin: 10000};
    else if (st === "ready") ring = w === V.luck ? {c: COL.lamp, w: V.rec.has(w) ? 2.5 : 2, d: [2, 3], spin: 6000} : {c: COL.ready, w: V.rec.has(w) ? 2.5 : 2, d: [3, 3], spin: 6000};
    if (ring){ c.beginPath(); c.arc(p.x, p.y, 10, 0, 7); c.strokeStyle = ring.c; c.lineWidth = ring.w;
      if (ring.d){ U.setDash(c, ring.d); c.lineDashOffset = -(t % ring.spin) / ring.spin * 62.8; } c.stroke(); if (ring.d){ U.setDash(c, []); c.lineDashOffset = 0; } }
    // 星核
    c.beginPath(); c.arc(p.x, p.y, lit ? (stars === 1 ? 4.5 : 6) : far && st === "locked" ? 4 : 6, 0, 7);
    c.fillStyle = lit ? (fade ? "#8a7440" : COL.lamp) : st === "ready" ? COL.sky : COL.dim; c.fill();
    // 名字
    if (!(far && st === "locked")){
      const col = lit ? (fade ? "#b9a676" : COL.cream) : st === "ready" ? COL.ink : COL.muted;
      if (st === "locked") c.globalAlpha = fa * (dim ? .35 : 1) * .6;
      U.text(c, w, p.x, p.y + 24, "w", 13, col, {align: "center", b: lit && !fade, stroke: COL.sky});
      c.globalAlpha = fa * (dim ? .35 : 1); }
    if (st === "ready" && (V.rec.has(w) || sel) && V.gain[w]) U.text(c, V.gain[w], p.x, p.y - 16, "cn", 11, "ready", {align: "center", b: 1, stroke: COL.sky, sw: 3});
    if (w === V.luck){ c.globalAlpha = fa * (dim ? .35 : 1) * (.675 + .325 * Math.cos(t / 1600 * Math.PI * 2)); U.text(c, "✦", p.x + 12, p.y - 8, "cn", 13, "lamp"); }
  });
  c.globalAlpha = fa;
  // 收起的星座：一颗大星
  GC[cur].forEach(i => { if (!core.isFolded(i)) return; const p = CP[i], fade = CONS[i].words.some(core.isFading);
    const dim = !!selected && !V.near.has("c" + i); c.globalAlpha = fa * (dim ? .35 : 1);
    const br = fade ? 1 : 1 + .06 - .06 * Math.cos(t / 4000 * Math.PI * 2);
    c.save(); c.globalAlpha *= fade ? .06 : .18; c.beginPath(); c.arc(p.x, p.y, 38 * br, 0, 7); c.fillStyle = COL.lamp; c.fill(); c.restore();
    c.beginPath(); for (let k = 0; k < 8; k++){ const a = k * Math.PI / 4, r1 = k % 2 ? 19 : 21, r2 = k % 2 ? 25 : 30; c.moveTo(p.x + Math.cos(a) * r1, p.y + Math.sin(a) * r1); c.lineTo(p.x + Math.cos(a) * r2, p.y + Math.sin(a) * r2); }
    c.save(); c.globalAlpha *= .6; c.strokeStyle = COL.lamp; c.lineWidth = 1.5; c.stroke(); c.restore();
    c.beginPath(); c.arc(p.x, p.y, 15, 0, 7); c.fillStyle = fade ? "#8a7440" : COL.lamp; c.fill(); c.strokeStyle = selCons === i ? "#fff" : fade ? "#b99a5a" : COL.cream; c.lineWidth = selCons === i ? 3 : 2; c.stroke();
    U.text(c, String(CONS[i].words.length), p.x, p.y + 1, "mono", 11, "dark", {align: "center"});
    U.text(c, CONS[i].name, p.x, p.y + 48, "cn", 14, "cream", {align: "center", b: 1, stroke: COL.sky}); });
  c.globalAlpha = fa;
  // 星点四散
  for (let k = sparks.length - 1; k >= 0; k--){ const sp = sparks[k], e = (t - sp.t0) / 900; if (e >= 1){ sparks.splice(k, 1); continue; }
    const q = 1 - Math.pow(1 - e, 2); c.globalAlpha = fa * (1 - q); c.beginPath(); c.arc(sp.x + sp.dx * q, sp.y + sp.dy * q, sp.r * (1 - .7 * q), 0, 7); c.fillStyle = COL.cream; c.fill(); }
  c.globalAlpha = 1;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  // 流星（屏幕坐标）
  for (let k = meteors.length - 1; k >= 0; k--){ const me = meteors[k], e = (t - me.t0) / 1100; if (e < 0) continue; if (e >= 1){ meteors.splice(k, 1); continue; }
    const x = m.x + me.x * m.w - 420 * e * e, y = m.y + me.y * m.h + 190 * e * e, a = e < .15 ? e / .15 : 1 - (e - .15) / .85;
    c.save(); c.translate(x, y); c.rotate(-24 * Math.PI / 180); const lg = c.createLinearGradient(0, 0, 140, 0); lg.addColorStop(0, "rgba(255,243,214,0)"); lg.addColorStop(1, "#fff3d6");
    c.globalAlpha = a; c.shadowColor = COL.lamp; c.shadowBlur = 10; c.fillStyle = lg; c.fillRect(0, -1, 140, 2); c.restore(); }
  drawGbar(t); drawZoom(); drawTip();
  c.restore();
}
let gbarX = null;
function drawGbar(){ const c = ctx, y0 = L.map.y, h = 48;
  const lg = c.createLinearGradient(0, y0, 0, y0 + h); lg.addColorStop(0, COL.sky); lg.addColorStop(.4, COL.sky); lg.addColorStop(1, "rgba(11,18,34,0)"); c.fillStyle = lg; c.fillRect(0, y0, W, h);
  V.gbar.forEach(it => { const x = it.x - gbarX, y = y0 + 9, bh = 28; if (x > W || x + it.w < 0) return;
    c.save(); if (it.next) c.globalAlpha = .45;
    if (it.cur){ c.save(); c.shadowColor = "rgba(255,201,92,.3)"; c.shadowBlur = 12; U.box(c, x, y, it.w, bh, 14, "rgba(20,30,52,.95)"); c.restore(); }
    U.box(c, x, y, it.w, bh, 14, it.full ? "rgba(255,201,92,.18)" : "rgba(20,30,52,.9)", it.cur ? "lamp" : it.has ? "rgba(159,216,255,.5)" : "rule", 1, it.next ? [4, 3] : null);
    pressFx(c, x, y, it.w, bh, 14);
    const nw = U.measure(c, it.name, "cn", 13);
    U.text(c, it.name, x + 11, y + bh / 2, "cn", 13, it.cur ? "lamp" : "ink"); U.text(c, it.sub, x + 17 + nw, y + bh / 2, "mono", 11, it.cur ? "lamp" : "muted");
    c.restore();
    if (!it.next) hit(Math.max(0, x), y - 6, Math.min(it.w, W - x), bh + 12, () => switchGal(it.g)); }); }
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
  const totS = " / " + tot, tW = U.measure(c, totS, "mono", 12);
  U.text(c, totS, h.r1right, cy1, "mono", 12, "muted", {align: "right"}); U.text(c, String(lit), h.r1right - tW, cy1, "mono", 16, "lamp", {align: "right", b: 1});
  // 第二行：今日目标、星尘、连击 | 待擦亮、音效
  const cy = h.r2y + h.r2h / 2, dg = core.daily(), gp = Math.min(1, dg.n / core.GOAL);
  let x = PAD; c.lineWidth = 3; c.beginPath(); c.arc(x + 9, cy, 8, 0, 7); c.strokeStyle = COL.rule; c.stroke();
  if (gp > 0){ c.beginPath(); c.arc(x + 9, cy, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * gp); c.strokeStyle = COL.lamp; c.lineCap = "round"; c.stroke(); c.lineCap = "butt"; }
  x += 24; const gt = dg.done ? `今日完成${s.streak && s.streak.c > 1 ? ` · 连续 ${s.streak.c} 天` : ""}` : `今日 ${dg.n}/${core.GOAL}`;
  U.text(c, gt, x, cy, "cn", 12, dg.done ? "lamp" : "muted"); x += U.measure(c, gt, "cn", 12) + 14;
  U.text(c, `星尘 ${s.dust}`, x, cy, "mono", 12, "lamp"); x += U.measure(c, `星尘 ${s.dust}`, "mono", 12) + 14;
  let rx = W - PAD; const mt = s.mute ? "静音" : "音效", mw = U.measure(c, mt, "cn", 12) + 18;
  rx -= mw; U.box(c, rx, cy - 12, mw, 24, 8, null, "rule"); pressFx(c, rx, cy - 12, mw, 24, 8); U.text(c, mt, rx + mw / 2, cy, "cn", 12, "muted", {align: "center"});
  hit(rx - 4, cy - 16, mw + 8, 32, () => { s.mute = !s.mute; core.save(); if (!s.mute) sfx("ok"); });
  const nf = core.fadingWords().length;
  if (nf){ const pt = `待擦亮 ${nf}`, pw = U.measure(c, pt, "cn", 12) + 18; rx -= pw + 8;
    U.box(c, rx, cy - 12, pw, 24, 8, null, "rgba(255,201,92,.5)"); pressFx(c, rx, cy - 12, pw, 24, 8); U.text(c, pt, rx + pw / 2, cy, "cn", 12, "lamp", {align: "center"}); hit(rx - 4, cy - 16, pw + 8, 32, polish); }
  if (s.combo >= 2 && x + 60 < rx) U.text(c, `连击 ×${s.combo}`, x, cy, "mono", 12, "lamp");
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
  if (gVel && !touch.active){ gbarX += gVel; gVel *= .92; if (Math.abs(gVel) < .3) gVel = 0; gbarX = Math.max(0, Math.min(gbarX, V.gbarW - W)); }
  // 空闲时降到约 30 帧，省电
  const active = glideA || fadeA || pVel || scrollTo !== null || gVel || touch.active || sparks.length || meteors.length || toastMsg || autoT && tapAny;
  frameN++;
  if (active || frameN % 2 === 0){
    hits = []; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
    ctx.fillStyle = COL.sky; ctx.fillRect(0, 0, W, H);
    drawMap(t); drawPanel(); drawHeader(); drawToast(t);
    lastDraw = t;
  }
  P.raf(frame);
}

// ---------- 触摸 ----------
const touch = {active: false, pts: new Map(), zone: null, moved: 0, pinch: 0, last: null, vy: 0, vx: 0};
let gVel = 0;
function zoneAt(x, y){ if (y < L.head.h) return "head"; if (y < L.map.y + 48 && y >= L.map.y) return "gbar"; if (y < L.panel.y) return "map"; return "panel"; }
function findHit(x, y){ for (let k = hits.length - 1; k >= 0; k--){ const h = hits[k]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h; } return null; }
function mapTap(x, y){ const p = toWorld(x, y), s = sc(), cur = core.cur;
  let best = null, bd = Infinity;
  GC[cur].forEach(i => { if (!core.isFolded(i)) return; const d = Math.hypot(CP[i].x - p.x, CP[i].y - p.y); if (d < Math.max(32, 26 * s) && d < bd){ bd = d; best = {c: i}; } });
  if (!best) GW[cur].forEach(w => { if (core.rep(w) !== w) return; const q = POS[w], d = Math.hypot(q.x - p.x, (q.y + 6) - p.y); if (d < Math.max(20, 22 * s) && d < bd){ bd = d; best = {w}; } });
  if (best && best.c !== undefined) selectCons(best.c); else if (best) select(best.w); else select(null); }
P.onTouch({
  start(e){ const ts = e.changedTouches || e.touches || [];
    for (const tt of ts) touch.pts.set(tt.identifier, {x: tt.clientX, y: tt.clientY});
    if (!touch.active){ const f = ts[0]; touch.active = true; touch.zone = zoneAt(f.clientX, f.clientY); touch.moved = 0; touch.start = {x: f.clientX, y: f.clientY}; touch.t0 = Date.now();
      press = {x: f.clientX, y: f.clientY, moved: false}; pVel = 0; gVel = 0; touch.vx = touch.vy = 0;
      const h = findHit(f.clientX, f.clientY); if (h && touch.zone === "map") touch.zone = "ui"; }
    if (touch.pts.size === 2 && (touch.zone === "map" || touch.zone === "ui")){ touch.zone = "map"; const [a, b] = [...touch.pts.values()]; touch.pinch = Math.hypot(a.x - b.x, a.y - b.y); touch.moved = 99; press = null; } },
  move(e){ const ts = e.changedTouches || e.touches || [];
    for (const tt of ts){ const prev = touch.pts.get(tt.identifier); if (!prev) continue; const p = {x: tt.clientX, y: tt.clientY}, dx = p.x - prev.x, dy = p.y - prev.y;
      touch.pts.set(tt.identifier, p);
      if (touch.pts.size === 1){ touch.moved += Math.abs(dx) + Math.abs(dy); if (touch.moved > 8 && press) press.moved = true;
        if (touch.zone === "map" || (touch.zone === "ui" && touch.moved > 8)){ touch.zone = "map"; glideA = null; const s = sc(); vb = {...vb, x: vb.x - dx * s, y: vb.y - dy * s}; }
        else if (touch.zone === "panel" && touch.moved > 6){ pScroll -= dy; touch.vy = -dy; const ms = maxScroll(); if (pScroll < 0) pScroll *= .5; if (pScroll > ms) pScroll = ms + (pScroll - ms) * .5; }
        else if (touch.zone === "gbar" && touch.moved > 6){ gbarX = Math.max(-40, Math.min(gbarX - dx, V.gbarW - W + 40)); touch.vx = -dx; } } }
    if (touch.pts.size === 2 && touch.zone === "map" && touch.pinch){ const [a, b] = [...touch.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0){ zoom(touch.pinch / d, (a.x + b.x) / 2, (a.y + b.y) / 2); touch.pinch = d; } } },
  end(e){ const ts = e.changedTouches || [];
    for (const tt of ts) touch.pts.delete(tt.identifier);
    if (touch.pts.size < 2) touch.pinch = 0;
    if (touch.pts.size) return;
    touch.active = false; press = null;
    if (touch.zone === "panel"){ if (touch.moved > 6) pVel = touch.vy; clampScrollSoft(); }
    if (touch.zone === "gbar" && touch.moved > 6){ gVel = touch.vx; gbarX = Math.max(0, Math.min(gbarX, V.gbarW - W)); }
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
computeLayout(); makeSky();
boot();
P.share("单词星系：答对题目，点亮一整片单词星空");
P.onShow(() => { if (!busy()){ refresh(); renderPanel(false); } });
P.raf(frame);
// 浏览器预览里方便自动化测试
if (typeof window !== "undefined" && window.__wxPreview) window.__game = { get core(){ return core; }, get quiz(){ return quiz; }, get L(){ return L; }, get hits(){ return hits; }, boot, select, selectCons, switchGal, startQuiz, get pScroll(){ return pScroll; } };
