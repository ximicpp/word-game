// 删除构建报告里“重复”的行（保留第一次出现的）
const { execSync } = require("child_process"); const fs = require("fs");
let out = ""; try { out = execSync("node tools/build.js", {encoding:"utf8"}); } catch(e){ out = e.stdout; }
const del = {}; for (const m of out.matchAll(/(\S+\.txt):(\d+) 重复/g)) (del[m[1]] = del[m[1]] || []).push(+m[2]);
for (const f in del){ const p = "words/" + f; const L = fs.readFileSync(p, "utf8").split("\n"); del[f].sort((a,b)=>b-a).forEach(n => L.splice(n-1, 1)); fs.writeFileSync(p, L.join("\n")); console.log(f, "删除", del[f].length); }
