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
    if (C.gensFor(c[0].w, "light").includes("spell")) assert.ok(z.qs.some(q => q.gen === "spell" || q.gen === "letters"), `${bank} ${c[0].w} 没有拼写题`);
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
}
console.log(`核心自测通过：${n} 道题`);
