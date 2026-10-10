/* ============================================================
 * 工具脚本：生成 js/circuit_img.js
 * 把需要【像素采样】的赛道贴图（每条赛道的 base.png 与 edge.png）
 * 固化为 data-URI 常量。data URI 图片画入 canvas 不会污染画布，
 * 从而避免 file:// 双击游玩时 getImageData 抛 SecurityError。
 * 用法：node tools_gen_circuit_img.js
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const TRACKS = [
  'donut_plains_1',
  'mario_circuit_2',
  'ghost_valley_1',
  'bowser_castle_1',
  'rainbow_road',
];
const LAYERS = ['base', 'edge'];

// 从工具自身位置向上定位到含 assets/circuit 的目录，与运行时 cwd 无关
function findSmkDir() {
  let dir = __dirname;
  if (fs.existsSync(path.join(dir, 'assets', 'circuit'))) return dir;
  const up = path.join(dir, '..');
  if (fs.existsSync(path.join(up, 'smk', 'assets', 'circuit'))) return path.join(up, 'smk');
  throw new Error('cannot locate the circuit asset directory from ' + dir);
}

const smkDir = findSmkDir();
const outFile = path.join(smkDir, 'js', 'circuit_img.js');

const lines = [];
lines.push('/* 自动生成：需要像素采样的赛道贴图 data-URI（避免file://画布污染） */');
lines.push('/* 由 tools_gen_circuit_img.js 生成，请勿手工编辑 */');
lines.push("'use strict';");
lines.push('window.CIRCUIT_IMAGES = window.CIRCUIT_IMAGES || {};');

let count = 0;
for (const track of TRACKS) {
  for (const layer of LAYERS) {
    const key = 'circuit/' + track + '/' + layer + '.png';
    const abs = path.join(smkDir, 'assets', 'circuit', track, layer + '.png');
    const buf = fs.readFileSync(abs);
    lines.push('window.CIRCUIT_IMAGES[' + JSON.stringify(key) + '] = "data:image/png;base64,' + buf.toString('base64') + '";');
    count++;
    console.log('packed ' + key + '  (' + buf.length + ' bytes png)');
  }
}

// 额外：会被盖到赛道画布上的公共小贴图（同样参与像素采样管线）
const EXTRA_FILES = [
  ['objects/floor/misc.png', 'objects/floor/misc.png'],
  ['objects/floor/question_panel.png', 'objects/floor/question_panel.png'],
];
for (const [key, rel] of EXTRA_FILES) {
  const buf = fs.readFileSync(path.join(smkDir, 'assets', rel));
  lines.push('window.CIRCUIT_IMAGES[' + JSON.stringify(key) + '] = "data:image/png;base64,' + buf.toString('base64') + '";');
  count++;
  console.log('packed ' + key + '  (' + buf.length + ' bytes png)');
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, lines.join('\n') + '\n', 'utf8');
console.log('OK: wrote ' + count + ' data-URI entries to ' + outFile);
