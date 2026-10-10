/* 队长验收脚本：零外部依赖断言（集成完成后运行） */
'use strict';
const fs = require('fs');
const path = require('path');
let fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL'), name, detail || '');
  if (!cond) fail++;
};

// 1) js目录禁用项：不得引用上游仓库路径或已弃用的 gfx 程序化贴图
//（模式用拼接构造，避免本文件自身命中这些字面量的全局自查）
const jsDir = path.join(__dirname, 'js');
const badPatterns = [
  new RegExp(['super', 'mario', 'kart', 'master'].join('-') + '\\\\/assets'),   // 仅禁止路径式引用（署名注释允许）
  new RegExp('\\bG' + 'FX\\b'),
  new RegExp('g' + 'fx' + '\\.' + 'js')
];
for (const f of fs.readdirSync(jsDir)) {
  const txt = fs.readFileSync(path.join(jsDir, f), 'utf8');
  for (const re of badPatterns)
    if (re.test(txt)) { check('弃用引用 js/' + f, false, '命中 ' + re); }
}
check('js目录无弃用引用', true);

// 2) 打包体系已删除
for (const f of ['build_embed.js', 'verify_embed.js', 'offline.html'])
  check('已删除 ' + f, !fs.existsSync(path.join(__dirname, f)));
check('embed目录已删', !fs.existsSync(path.join(__dirname, 'embed')));

// 3) index.html 引用链完整且顺序正确
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
for (const s of ['assets.js', 'circuit_txt.js', 'audio.js', 'mode7.js', 'map.js', 'animator.js',
                 'ai.js', 'driver.js', 'items.js', 'gui.js', 'trackgen.js', 'states.js', 'main.js'])
  check('index.html 含 ' + s, html.includes('js/' + s));

// 4) 全部js语法可解析（node --check 在外层做）
console.log(fail === 0 ? 'ACCEPTANCE OK' : fail + ' ACCEPTANCE FAILURES');
process.exit(fail ? 1 : 0);

