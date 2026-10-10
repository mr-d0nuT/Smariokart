/* 渲染冒烟测试：桩ctx执行所有绘制路径 + 全赛道加载验证 */
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
function fakeCanvas() {
  return { width: 8, height: 8, style: {}, getContext: () => fakeCtx() };
}
global.document = { createElement: () => fakeCanvas(), getElementById: () => fakeCanvas() };
global.window = { addEventListener() {}, innerWidth: 512, innerHeight: 448 };
global.Image = class {
  set src(v) { this.width = 32; this.height = 32; setTimeout(() => this.onload && this.onload(), 0); }
};
global.fetch = async (url) => {
  const p = path.join(__dirname, url);
  const buf = fs.readFileSync(p);
  return {
    text: async () => buf.toString('utf8'),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  };
};
global.performance = require('perf_hooks').performance;

let failed = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL'), name, detail || '');
  if (!cond) failed++;
}

const files = ['assets.js', 'audio.js', 'mode7.js', 'map.js', 'animator.js',
               'ai.js', 'driver.js', 'items.js', 'gui.js', 'trackgen.js', 'states.js'];
let src = '';
for (const f of files) src += fs.readFileSync(path.join(__dirname, 'js', f), 'utf8') + '\n';
src = src.replace('boot();', '');
src += '\nvar Game = { ccIndex: 1, playerChar: 0, gp: null, mode: null,\n  setState() {}, rawSetState() {}, transitionTo() {} };\n';   // main.js的Game桩
const body = fs.readFileSync(path.join(__dirname, 'render_body.js'), 'utf8');

const fn = new Function('check', 'getFailed', src + '\nreturn (async () => {\n' + body + '\n})()');
fn(check, () => failed).then(n => {
  console.log(n === 0 ? 'ALL RENDER TESTS PASSED' : n + ' TESTS FAILED');
  process.exit(n === 0 ? 0 : 1);
}).catch(e => {
  console.error('TEST CRASH:', e.message);
  console.error(e.stack.split('\n').slice(0, 8).join('\n'));
  process.exit(1);
});



