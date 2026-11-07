// 把 data.js（网页版词库）转成微信小游戏用的 minigame/js/data.js，并检查包大小。
// 用法：node tools/build-minigame.js         只生成词库
//       node tools/build-minigame.js --check 检查 minigame/js/data.js 是否和 data.js 一致（CI 用）
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "data.js"), "utf8");
const sandbox = { window: {} }; vm.runInNewContext(src, sandbox);
if (!sandbox.window.WORDNET) throw new Error("data.js 里没有 window.WORDNET");
const out = "// 本文件由 tools/build-minigame.js 根据 data.js 自动生成，请勿手改。\nmodule.exports = " + JSON.stringify(sandbox.window.WORDNET) + ";\n";
const target = path.join(root, "minigame", "js", "data.js");
if (process.argv.includes("--check")){
  const cur = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  if (cur !== out){ console.error("minigame/js/data.js 和 data.js 不一致，请运行 node tools/build-minigame.js 后提交。"); process.exit(1); }
} else fs.writeFileSync(target, out, "utf8");
// 主包上限 4 MB（不算 dev/ 预览文件）
let total = 0; const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name);
  if (e.isDirectory()) { if (e.name !== "dev") walk(p); } else if (!/README\.md$/.test(e.name)) total += fs.statSync(p).size; });
walk(path.join(root, "minigame"));
console.log(`小游戏包大小约 ${(total / 1024 / 1024).toFixed(2)} MB（上限 4 MB）`);
if (total > 4 * 1024 * 1024) { console.error("超过微信小游戏主包 4 MB 上限"); process.exit(1); }
