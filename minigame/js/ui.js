// Canvas 绘图小工具：颜色、字体、圆角矩形、中英文混排的自动换行。
const COL = {
  sky:"#0b1222", sky2:"#111a2e", panel:"#141e34", rule:"#26324d",
  ink:"#e9edf6", muted:"#8e9ab5", dim:"#3a4664",
  lamp:"#ffc95c", ready:"#9fd8ff", good:"#7fe0a3", bad:"#ff7d8f", cream:"#fff3d6", dark:"#2b1d00",
  sound:"#6ea8ff", form:"#ff9466", syn:"#7fe0a3", ant:"#ff6f91", root:"#c49bff", coll:"#4fd6e3", topic:"#c7cf6d", hyper:"#f0a6d6"
};
let FAM = { w:"sans-serif", cn:"sans-serif", ipa:"sans-serif", mono:"monospace" };
function setFamilies(f){ FAM = Object.assign({}, FAM, f); }
const font = (f, size, bold) => `${bold ? "bold " : ""}${size}px ${FAM[f] || FAM.cn}`;
const col = c => COL[c] || c;

function rr(ctx, x, y, w, h, r){ r = Math.min(r, w / 2, h / 2); ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath(); }
function box(ctx, x, y, w, h, r, fill, stroke, lw, dash){
  rr(ctx, x, y, w, h, r);
  if (fill){ ctx.fillStyle = col(fill); ctx.fill(); }
  if (stroke){ ctx.strokeStyle = col(stroke); ctx.lineWidth = lw || 1; if (dash) setDash(ctx, dash); ctx.stroke(); if (dash) setDash(ctx, []); } }
function setDash(ctx, d){ if (ctx.setLineDash) ctx.setLineDash(d); }

// ---------- 混排换行 ----------
const CJK = "⺀-鿿豈-﫿︰-﹏＀-￯　-〿—‘’“”…·●★✦";
const TOK = new RegExp(`[${CJK}]|\\s+|[^\\s${CJK}]+`, "g");
const NO_START = /^[，。：；！？）、”’…·]/;
// runs: [{s, f, b, c, size}]；返回 {lines:[{segs:[{x,s,font,c}], w}], h, w}
function layout(ctx, runs, maxW, o){
  o = o || {}; const size = o.size || 15, lh = o.lh || Math.round(size * 1.5), dc = o.c || "ink", df = o.f || "cn";
  const lines = []; let line = {segs:[], w:0};
  const push = () => { while (line.segs.length && /^\s+$/.test(line.segs[line.segs.length - 1].s)) { line.w -= line.segs.pop().wd; } lines.push(line); line = {segs:[], w:0}; };
  for (const r of runs){
    const fnt = font(fam(r.f || df, r.s), r.size || size, r.b || o.b); ctx.font = fnt;
    for (const t of (r.s.match(TOK) || [])){
      if (t === "\n"){ push(); continue; }
      const space = /^\s+$/.test(t);
      if (space && !line.segs.length) continue;
      const wd = ctx.measureText(t).width;
      if (line.w + wd > maxW && line.segs.length && !space && !NO_START.test(t)) push();
      line.segs.push({x: line.w, s: t, font: fnt, c: r.c || dc, wd, strike: r.strike});
      line.w += wd;
    }
  }
  if (line.segs.length || !lines.length) push();
  return {lines, h: lines.length * lh, lh, w: Math.max(...lines.map(l => l.w))};
}
function drawLayout(ctx, L, x, y, align, alpha){
  ctx.textBaseline = "middle"; ctx.textAlign = "left";
  L.lines.forEach((ln, i) => { const cy = y + i * L.lh + L.lh / 2, dx = align === "center" ? -ln.w / 2 : align === "right" ? -ln.w : 0;
    ln.segs.forEach(sg => { ctx.font = sg.font; ctx.fillStyle = col(sg.c); ctx.fillText(sg.s, x + dx + sg.x, cy);
      if (sg.strike){ ctx.fillRect(x + dx + sg.x, cy, sg.wd, 1.2); } }); });
}
// 单行文字（可选描边，用在星图上）
const HAN = /[\u3000-\u9fff\uff00-\uffef]/;
// 等宽字体没有中文，含中文时改用中文字体，避免字距被拉开
const fam = (f, s) => f === "mono" && HAN.test(s) ? "cn" : f;
function text(ctx, s, x, y, f, size, c, o){
  f = fam(f, s); o = o || {}; ctx.font = font(f, size, o.b); ctx.textAlign = o.align || "left"; ctx.textBaseline = o.base || "middle";
  if (o.stroke){ ctx.lineWidth = o.sw || 4; ctx.lineJoin = "round"; ctx.strokeStyle = col(o.stroke); ctx.strokeText(s, x, y); }
  ctx.fillStyle = col(c); ctx.fillText(s, x, y);
}
function measure(ctx, s, f, size, b){ ctx.font = font(fam(f, s), size, b); return ctx.measureText(s).width; }

module.exports = { COL, col, font, setFamilies, rr, box, setDash, layout, drawLayout, text, measure };
