// 规则核心的自测：每个词库、每个词都能出题，选项不重复且包含答案；模拟一路点亮。
// 用法：node minigame/test/core.test.js
const assert = require("assert");
const { createCore, KEY } = require("../js/core.js");
const mem = {}; const store = { get: k => mem[k] || null, set: (k, v) => { mem[k] = v; } };
let n = 0;
for (const bank of ["ket", "pet", "kp", "kpf"]){
  for (const k in mem) delete mem[k];
  mem[KEY] = JSON.stringify({ lit: [], bank });
  const C = createCore(store);
  assert.strictEqual(C.BANK, bank);
  for (const w of C.WORDS){
    for (const g of C.gensFor(w, "light")){
      const q = C.GENS[g](w); n++;
      assert.ok(q.opts.length >= 2, `${bank} ${w} ${g} 选项太少`);
      assert.strictEqual(new Set(q.opts.map(o => o.key)).size, q.opts.length, `${bank} ${w} ${g} 选项重复`);
      assert.ok(q.opts.some(o => o.key === q.answer), `${bank} ${w} ${g} 没有正确答案`);
      assert.ok(q.q.length && q.explain.length);
    }
  }
  // 一路按推荐点亮 120 个词
  for (let k = 0; k < 120; k++){
    const c = C.candidates(); if (!c.length) break;
    const z = C.newQuiz(c[0].w, "light");
    // 星等决定题数（三等星 3 题 … 一等星 5 题），每轮至少一道拼写类题
    assert.strictEqual(z.qs.length, C.qnOf(c[0].w), `${bank} ${c[0].w} 题数不对`);
    // 新手头 3 颗少出题：第 1 颗 2 题（意思 + 填空），第 2、3 颗最多 3 题
    if (k === 0){ assert.strictEqual(z.qs.length, 2); assert.deepStrictEqual(z.qs.map(q => q.gen), ["meaning", "blank"]); }
    else if (k < 3) assert.ok(z.qs.length <= 3, `${bank} 第 ${k + 1} 颗题太多`);
    if (k >= 3 && C.gensFor(c[0].w, "light").includes("spell")) assert.ok(z.qs.some(q => q.gen === "spell" || q.gen === "letters"), `${bank} ${c[0].w} 没有拼写题`);
    z.qs.forEach((q, i) => { z.i = i; z.picked = null; C.answer(z, q.opts.findIndex(o => o.key === q.answer)); });
    C.lightUp(z); assert.ok(C.isLit(c[0].w)); assert.strictEqual(z.stars, 3);
  }
  assert.ok(C.litArr.length >= 100, `${bank} 只点亮了 ${C.litArr.length}`);
  assert.ok(C.S.lvl >= C.lvOf(100) && C.lvOf(C.S.lit.length) === C.S.lvl, `${bank} 等级不对`);
  assert.ok(C.streakNow() === 1 && C.examPassed().length >= 0);
  // 守护星：星尘够就能换，最多 2 颗
  C.S.dust = 1000; assert.ok(C.buyGuard()); assert.ok(C.buyGuard()); assert.ok(!C.buyGuard()); assert.strictEqual(C.S.guard, 2);
  const saved = JSON.parse(mem[KEY]); assert.strictEqual(saved.bank, bank); assert.ok(saved.lit.length >= 100);
  // 30 天后应该有变暗的星，并能擦亮
  const later = createCore(store, 30); const f = later.fadingWords(); assert.ok(f.length > 0);
  const z = later.newQuiz(f[0], "review"); const q = z.qs[0]; later.answer(z, q.opts.findIndex(o => o.key === q.answer)); later.finishReview(z);
  assert.ok(!later.isFading(f[0]));
  // 擦亮带邻居：关系题答对，已点亮的邻居也一起擦亮
  { const L2 = createCore(store, 30), w = L2.fadingWords().find(x => L2.adj[x].some(e => e.t !== "topic" && L2.isFading(e.w)));
    if (w){ let z2; for (let k = 0; k < 40; k++){ z2 = L2.newQuiz(w, "review"); if (z2.qs[0].gen === "link" && L2.isLit(z2.qs[0].pair)) break; }
      if (z2.qs[0].gen === "link"){ const p0 = z2.qs[0].pair, d0 = L2.S.mem[p0].due; L2.answer(z2, z2.qs[0].opts.findIndex(o => o.key === z2.qs[0].answer)); L2.finishReview(z2);
        assert.strictEqual(z2.pair, p0); assert.ok(L2.S.mem[p0].due > d0, `${bank} 邻居没有一起擦亮`); } } }
}
// 推荐：新玩家前 20 颗都是 KET 词，并且有所在片区
{ for (const k in mem) delete mem[k]; mem[KEY] = JSON.stringify({ lit: [], bank: "kp" }); const C = createCore(store);
  for (let k = 0; k < 20; k++){ const w = C.candidates()[0].w; assert.strictEqual(C.D.words[w].lv, "A2", `第 ${k + 1} 颗推荐了 ${w}`); assert.ok(C.whyOf(w).sub, `${w} 没有片区`);
    const z = C.newQuiz(w, "light"); z.qs.forEach((q, i) => { z.i = i; z.picked = null; C.answer(z, q.opts.findIndex(o => o.key === q.answer)); }); C.lightUp(z); }
  // 混淆对：答错记下来，下次出题把易混词放进选项
  const z = C.newQuiz("quiet", "light"), i = z.qs.findIndex(q => ["meaning", "reverse", "blank", "ipa"].includes(q.gen)); z.i = i;
  const bad = z.qs[i].opts.findIndex(o => o.key !== z.qs[i].answer); const bw = z.qs[i].opts[bad].key; C.answer(z, bad);
  assert.strictEqual(C.confMiss("quiet"), bw);
  const z2 = C.newQuiz("quiet", "light"); assert.strictEqual(z2.conf, bw);
  z2.qs.filter(q => ["meaning", "reverse", "blank", "ipa"].includes(q.gen)).forEach(q => assert.ok(q.opts.some(o => o.key === bw), `易混词 ${bw} 没放进 ${q.gen}`));
  // 学完一片
  const si = C.D.words.apple.s; C.SW[si].forEach(w => { if (C.isLit(w)) return; const z3 = C.newQuiz(w, "light"); z3.qs.forEach((q, j) => { z3.i = j; z3.picked = null; C.answer(z3, q.opts.findIndex(o => o.key === q.answer)); }); C.lightUp(z3); if (C.SW[si].every(C.isLit)) assert.strictEqual(z3.subDone, si); });
  assert.ok(C.subDone(si)); }
// 存档备份：主存档坏了或被清空时，从备份恢复；“重新开始”会连备份一起清
{ for (const k in mem) delete mem[k]; mem[KEY] = JSON.stringify({ lit: [], bank: "kp" }); const C = createCore(store);
  for (let k = 0; k < 6; k++){ const w = C.candidates()[0].w, z = C.newQuiz(w, "light"); z.qs.forEach((q, i) => { z.i = i; z.picked = null; C.answer(z, q.opts.findIndex(o => o.key === q.answer)); }); C.lightUp(z); }
  assert.ok(C.save() && C.saveOk() && C.backup()); const lit = C.S.lit.slice();
  mem[KEY] = "{坏掉的存档"; assert.deepStrictEqual(createCore(store).S.lit, lit, "主存档损坏时没有用备份");
  delete mem[KEY]; assert.deepStrictEqual(createCore(store).S.lit, lit, "主存档丢失时没有用备份");
  mem[KEY] = JSON.stringify({ lit: [], bank: "kp" }); assert.deepStrictEqual(createCore(store).S.lit, lit, "主存档被清空时没有用备份");
  const R = createCore(store); R.reset(); assert.strictEqual(createCore(store).S.lit.length, 0, "重新开始后进度应该是空的");
  // 写入失败时能知道
  const bad = createCore({ get: store.get, set: () => false }); assert.strictEqual(bad.save(), false); assert.strictEqual(bad.saveOk(), false); }
console.log(`核心自测通过：${n} 道题`);
