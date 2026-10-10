/* Bug9诊断：全AI 120秒 headless 模拟，找卡死热点。用法: node diag_donut.js [course] */
'use strict';
const fs = require('fs');
const path = require('path');
function fakeCtx() {
  return new Proxy({}, {
    get(t, k) {
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (!(k in t)) t[k] = () => {};
      return t[k];
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}
global.document = { createElement: () => ({ width: 8, height: 8, getContext: () => fakeCtx() }), getElementById: () => ({ width: 512, height: 448, getContext: () => fakeCtx() }) };
global.window = { addEventListener() {}, innerWidth: 512, innerHeight: 448 };
global.Image = class { set src(v) { this.width = 32; this.height = 32; setTimeout(() => this.onload && this.onload(), 0); } };
global.fetch = async (url) => {
  const p = path.join(__dirname, url);
  const buf = fs.readFileSync(p);
  return { text: async () => buf.toString('utf8'), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
};
global.performance = require('perf_hooks').performance;

const files = ['assets.js', 'audio.js', 'mode7.js', 'map.js', 'animator.js', 'ai.js', 'driver.js', 'items.js', 'gui.js', 'trackgen.js', 'states.js'];
let src = '';
for (const f of files) src += fs.readFileSync(path.join(__dirname, 'js', f), 'utf8') + '\n';
src = src.replace('boot();', '');
src += '\nvar Game = { ccIndex: 1, playerChar: 0, setState() {} };\n';

const courseName = process.argv[2] || 'donut_plains_1';
const trackId = courseName;

const body = [
  "const trackId = RACE_TRACKS[courseName] ? courseName : 'donut_plains_1';",
  "if (RACE_TRACKS[trackId] && RACE_TRACKS[trackId].dir) await GameMap.load(RACE_TRACKS[trackId].dir);",
  "else await GameMap.loadGenerated(trackId);",
  "const race = new Race(trackId, 1, 7);",
  "await race.init();",
  "GameClock.now = () => race.time; race.updateRanks();  race.updateRanks();",
  "for (const d of race.drivers) d.controlType = 'ai';",
  "const stuckLog = [], fallLog = [];",
  "for (let f = 0; f < 60 * 120; f++) {",
  "  race.time += 1 / 60;",
  "  for (const d of race.drivers) { d.update(1 / 60, {}, race); interactFloorObjects(d, race); }",
  "  for (let i = 0; i < race.drivers.length; i++) for (let j = 0; j < race.drivers.length; j++) {",
  "    if (i === j) continue;",
  "    const a = race.drivers[i], b = race.drivers[j];",
  "    const dx = (b.position.x - a.position.x) * 128, dy = (b.position.y - a.position.y) * 128;",
  "    if (dx * dx + dy * dy > 9) continue;",
  "    const data = a.solveCollision(b);",
  "    if (data) { a.collisionMomentum.x += data.momentum.x; a.collisionMomentum.y += data.momentum.y;",
  "      a.speedForward *= data.speedFactor; a.speedTurn *= data.speedFactor;",
  "      if (data.hit) a.applyHit(); else if (!a.isImmune()) a.addCoin(-1); }",
  "  }",
  "  race.updateRanks();",
  "  if (f % 30 === 0) {",
  "    for (const d of race.drivers) {",
  "      const tx = Math.round(d.position.x * 128), ty = Math.round(d.position.y * 128);",
  "      if (d.speedForward < 0.005 && !d.falling && d.canDrive()) stuckLog.push({ f, char: d.charIdx, tx, ty, land: GameMap.land[ty*128+tx], grad: AI.gradient[ty*128+tx], ang: +(d.posAngle*180/Math.PI).toFixed(1) });",
  "      if (d.falling) fallLog.push({ f, char: d.charIdx, tx, ty, land: GameMap.land[ty*128+tx] });",
  "    }",
  "  }",
  "}",
  "console.log('=== 卡死样本(speed<0.005) 共', stuckLog.length, '条 ===');",
  "const hot = {};",
  "for (const s of stuckLog) { const k = s.tx + ',' + s.ty; (hot[k] = hot[k] || []).push(s); }",
  "const tops = Object.entries(hot).sort((a, b) => b[1].length - a[1].length).slice(0, 15);",
  "for (const [k, arr] of tops) console.log('tile(' + k + ') land=' + arr[0].land + ' grad=' + arr[0].grad + ' n=' + arr.length + ' 车=[' + [...new Set(arr.map(a => a.char))].join(',') + '] 首帧=' + Math.min(...arr.map(a => a.f)) + ' 角=' + arr[0].ang);",
  "console.log('=== 坠落事件 共', fallLog.length, '条 ===');",
  "const fh = {};",
  "for (const s of fallLog) { const k = 'tile(' + s.tx + ',' + s.ty + ')land' + s.land; fh[k] = (fh[k] || 0) + 1; }",
  "console.log(Object.entries(fh).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, c]) => k + ' x' + c).join(' | '));",
  "console.log('=== 各车进度 ===');",
  "for (const d of race.drivers) { const tx = Math.round(d.position.x*128), ty = Math.round(d.position.y*128); console.log('char' + d.charIdx + ' laps=' + d.laps + ' grad=' + AI.posValue(d.position.x, d.position.y) + ' pos=(' + tx + ',' + ty + ') land=' + GameMap.land[ty*128+tx] + ' spd=' + d.speedForward.toFixed(3) + ' falling=' + d.falling); }"
].join('\n');

const fn = new Function('courseName', 'trackId', src + '\nreturn (async () => {\n' + body + '\n})()');
fn(courseName, trackId).catch(e => {
  console.error('CRASH:', e.message);
  console.error(e.stack.split('\n').slice(0, 6).join('\n'));
});







