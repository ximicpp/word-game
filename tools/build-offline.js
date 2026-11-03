// 将游戏和词库合并成可离线打开的单个 HTML 文件。
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const data = fs.readFileSync(path.join(root, 'data.js'), 'utf8');
const marker = '<script src="data.js"></script>';
if (html.split(marker).length !== 2) throw new Error('找不到唯一的词库脚本引用');
if (/<\/script/i.test(data)) throw new Error('词库包含 HTML 脚本结束标签，无法安全嵌入');
const offline = html
  .replace(/^<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*\r?\n/m, '')
  .replace(/^<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\s*\r?\n/m, '')
  .replace(/^<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/[^\n]*\r?\n/m, '')
  .replace(marker, () => `<script>\n${data}\n</script>`);
const output = path.join(root, 'dist', '单词星系-离线版.html');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, offline, 'utf8');
console.log(`已生成 ${output} (${Buffer.byteLength(offline)} 字节)`);
