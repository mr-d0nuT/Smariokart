/* 严格画布验证：模拟真实Canvas2D的参数校验，揪出浏览器才会暴露的错误 */
'use strict';
const fs = require('fs');
const path = require('path');

function validateNum(v, name) {
  if (typeof v === 'number' && !Number.isFinite(v))
    throw new Error('non-finite arg ' + name + '=' + v);
}

function makeValidCtx(log) {
  const base = {
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} })
  };
  return new Proxy({}, {
    get(t, k) {
      if (k in base) return base[k];
      if (!(k in t)) {
        t[k] = (...args) => {
          if (k === 'drawImage') {
            const img = args[0];
            if (!img || typeof img.width !== 'number')
              throw new Error('drawImage: invalid image type=' + typeof img +
                ' ctor=' + (img && img.constructor && img.constructor.name) +
                ' width=' + (img && img.width));
            // 9参形式校验源矩形
            if (args.length >= 9) {
              const [, sx, sy, sw, sh, dx, dy, dw, dh] = args;
              [sx, sy, sw, sh, dx, dy, dw, dh].forEach((v, i) => validateNum(v, 'd' + i));
              if (sw <= 0 || sh <= 0) throw new Error(`drawImage src rect ${sw}x${sh}`);
              if (!Number.isFinite(dw) || !Number.isFinite(dh)) throw new Error('dest non-finite');
            } else {
              const [, dx, dy, dw, dh] = args;
              [dx, dy].forEach((v, i) => validateNum(v, 'd' + i));
              if (dw !== undefined) {
                validateNum(dw, 'dw'); validateNum(dh, 'dh');
                if (dw <= 0 || dh <= 0) throw new Error(`drawImage dest ${dw}x${dh}`);
              }
            }
            log.drawImageCount++;
          } else {
            args.forEach((v, i) => validateNum(v, k + '#' + i));
          }
        };
      }
      return t[k];
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

global.document = {
  createElement: () => ({ width: 8, height: 8, style: {}, getContext: () => makeValidCtx({ drawImageCount: 0 }) }),
  getElementById: () => ({ width: 512, height: 448, getContext: () => makeValidCtx(log), style: {} })
};
global.window = { addEventListener() {}, innerWidth: 1920, innerHeight: 1080 };
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
const log = { drawImageCount: 0 };

const files = ['assets.js', 'audio.js', 'mode7.js', 'map.js', 'animator.js',
               'ai.js', 'driver.js', 'items.js', 'gui.js', 'trackgen.js', 'states.js'];
let src = '';
for (const f of files) src += fs.readFileSync(path.join(__dirname, 'js', f), 'utf8') + '\n';
src = src.replace('boot();', '');
src += '\nvar Game = { ccIndex: 1, playerChar: 0, gp: null, mode: null,\n  setState() {}, rawSetState() {}, transitionTo() {} };\n';
const body = fs.readFileSync(path.join(__dirname, 'strict_body.js'), 'utf8');

const fn = new Function('check', 'getFailed', 'log', src + '\nreturn (async () => {\n' + body + '\n})()');
fn(check, () => failed, log).then(n => {
  console.log(n === 0 ? 'ALL STRICT TESTS PASSED' : n + ' TESTS FAILED');
  process.exit(n === 0 ? 0 : 1);
}).catch(e => {
  console.error('CRASH FOUND:', e.message);
  console.error(e.stack.split('\n').slice(0, 8).join('\n'));
  process.exit(1);
});



