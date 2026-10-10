/* ============================================================
 * Süper Mario Kart Web - 资源加载器
 * 素材位于本目录 assets/ 下（开源项目原创素材本地化，署名见 OPEN_SOURCE.md）。
 * ============================================================ */
'use strict';

const ASSET_ROOT = 'assets/';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const Assets = {
  images: {},     // name -> HTMLCanvasElement（可切片）
  texts: {},      // name -> string
  audio: {},      // name -> AudioBuffer
  loaded: 0, total: 0,

  img(name) { return this.images[name]; },
  txt(name) { return this.texts[name]; },

  loadImage(name, file) {
    this.total++;
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement('canvas');
        c.width = im.width; c.height = im.height;
        c.getContext('2d').drawImage(im, 0, 0);
        this.images[name] = c;
        this.loaded++;
        resolve();
      };
      im.onerror = () => reject(new Error('image fail: ' + file));
      // file:// 下真实 png 画入 canvas 后 getImageData 会抛 SecurityError（画布污染）
      // 需要像素采样的赛道贴图优先走预置 data-URI（不污染画布）
      if (typeof window !== 'undefined' && window.CIRCUIT_IMAGES && window.CIRCUIT_IMAGES[file]) {
        im.src = window.CIRCUIT_IMAGES[file];
      } else {
        im.src = ASSET_ROOT + file;
      }
    });
  },

  loadText(name, file) {
    this.total++;
    // file:// 协议下 fetch 被禁：优先使用 circuit_txt.js 固化数据
    // 数据结构为嵌套表：CIRCUIT_TEXTS['circuit/<dir>/']['base.txt']
    if (typeof window !== 'undefined' && window.CIRCUIT_TEXTS) {
      const slash = file.lastIndexOf('/');
      if (slash > 0) {
        const dirKey = file.slice(0, slash + 1);
        const fileName = file.slice(slash + 1);
        const table = window.CIRCUIT_TEXTS[dirKey];
        if (table && table[fileName] !== undefined) {
          this.texts[name] = table[fileName];
          this.loaded++;
          return Promise.resolve();
        }
      }
    }
    // file:// 下 fetch 会【同步】抛错，包进 Promise 才能被 catch 接住
    return Promise.resolve()
      .then(() => fetch(ASSET_ROOT + file))
      .then(r => r.text())
      .then(t => { this.texts[name] = t; this.loaded++; })
      .catch(e => { throw new Error('text fail: ' + file); });
  },

  loadAudio(name, file, ctx) {
    this.total++;
    // 同上：同步抛错转 rejection
    return Promise.resolve()
      .then(() => fetch(ASSET_ROOT + file))
      .then(r => r.arrayBuffer())
      .then(ab => ctx ? ctx.decodeAudioData(ab) : ab)
      .then(buf => { this.audio[name] = buf; this.loaded++; })
      .catch(e => { console.warn('audio skip:', file); this.loaded++; });
  },

  /* 切片：从已加载图片中取出矩形区域为新canvas */
  slice(name, rect) {
    const src = this.images[name];
    const c = document.createElement('canvas');
    c.width = rect.w; c.height = rect.h;
    if (src)   // 源缺失时返回透明画布（仅测试桩会走到；浏览器运行时必然已预载）
      c.getContext('2d').drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    return c;
  }
};
