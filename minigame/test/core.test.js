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
    z.qs.forEach((q, i) => { z.i = i; z.picked = null; C.answer(z, q.opts.findIndex(o => o.key === q.answer)); });
    C.lightUp(z); assert.ok(C.isLit(c[0].w)); assert.strictEqual(z.stars, 3);
  }
  assert.ok(C.litArr.length >= 100, `${bank} 只点亮了 ${C.litArr.length}`);
  const saved = JSON.parse(mem[KEY]); assert.strictEqual(saved.bank, bank); assert.ok(saved.lit.length >= 100);
  // 30 天后应该有变暗的星，并能擦亮
  const later = createCore(store, 30); const f = later.fadingWords(); assert.ok(f.length > 0);
  const z = later.newQuiz(f[0], "review"); const q = z.qs[0]; later.answer(z, q.opts.findIndex(o => o.key === q.answer)); later.finishReview(z);
  assert.ok(!later.isFading(f[0]));
}
console.log(`核心自测通过：${n} 道题`);
