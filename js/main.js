/* ============================================================
 * Süper Mario Kart Web - 主入口
 * ============================================================ */
'use strict';

const Game = {
  canvas: null, ctx: null,
  state: null, ccIndex: 1, playerChar: 0,

  /* 全黑瞬间的真正切换+装载（原版 $0160==$8000 时刻换state并init） */
  rawSetState(s) {
    this.state = s;
    if (s.init) s.init();
  },
  /* 即时硬切：仅保留给比赛内部流程（RaceLoading.init→RaceStart、
   * 红绿灯结束→Race/Battle、Race.over→RaceEnd 等），菜单一律走 transitionTo */
  setState(s) {
    this.rawSetState(s);
  },
  aspectMode: 'fit_crt',   // 'fit_crt' (4:3), 'fill' (16:9 estirado), 'fit_native' (8:7 / 512x448)
  isFullscreen: false,

  /* 请求式切屏：交Fader淡出→全黑切换→自动淡入（对应原版设$32挂起） */
  transitionTo(s) {
    Fader.request(s);
  },

  scaleCanvas() {
    const c = this.canvas;
    if (!c) return;
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    let targetW = winW;
    let targetH = winH;

    if (this.aspectMode === 'fill') {
      // Estirar a pantalla completa 100% (sin barras negras)
      targetW = winW;
      targetH = winH;
    } else {
      // 4:3 (aspecto CRT clásico de SNES en TV) o 512:448 nativo
      const ratio = (this.aspectMode === 'fit_native') ? (512 / 448) : (4 / 3);
      if (winW / winH > ratio) {
        // La pantalla es más ancha: el alto ocupa el 100% de la ventana
        targetH = winH;
        targetW = Math.round(winH * ratio);
      } else {
        // La pantalla es más alta: el ancho ocupa el 100% de la ventana
        targetW = winW;
        targetH = Math.round(winW / ratio);
      }
    }

    c.style.width = targetW + 'px';
    c.style.height = targetH + 'px';
    if (this.ctx) this.ctx.imageSmoothingEnabled = false;
  },

  toggleFullscreen() {
    const doc = document;
    const elem = document.documentElement;
    const isFull = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
    if (!isFull) {
      const req = elem.requestFullscreen || elem.webkitRequestFullscreen || elem.mozRequestFullScreen || elem.msRequestFullscreen;
      if (req) {
        req.call(elem).then(() => {
          this.scaleCanvas();
        }).catch(err => {
          console.warn('Fullscreen bloqueado por navegador:', err);
        });
      }
    } else {
      const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
      if (exit) {
        exit.call(doc).then(() => {
          this.scaleCanvas();
        }).catch(() => {});
      }
    }
  },

  toggleAspectMode() {
    if (this.aspectMode === 'fit_crt') this.aspectMode = 'fill';
    else if (this.aspectMode === 'fill') this.aspectMode = 'fit_native';
    else this.aspectMode = 'fit_crt';

    this.scaleCanvas();
    const btn = document.getElementById('btnToggleAspect');
    if (btn) {
      if (this.aspectMode === 'fit_crt') {
        btn.textContent = '📺';
        btn.title = 'Formato de Pantalla: 4:3 (CRT SNES)';
      } else if (this.aspectMode === 'fill') {
        btn.textContent = '↔️';
        btn.title = 'Formato de Pantalla: 16:9 (Panorámica Total)';
      } else {
        btn.textContent = '🕹️';
        btn.title = 'Formato de Pantalla: 8:7 (Píxel Nativo SNES)';
      }
    }
  },

  updateFullscreenUI() {
    const doc = document;
    const isFull = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
    this.isFullscreen = isFull;
    const btnIcon = document.getElementById('btnFullscreenToggle');
    if (btnIcon) {
      btnIcon.textContent = isFull ? '🗗' : '⛶';
      btnIcon.title = isFull ? 'Salir de Pantalla Completa (F)' : 'Pantalla Completa (F)';
    }
    const btn = document.getElementById('btnToggleFullscreen');
    if (btn) {
      btn.textContent = isFull ? '🗗 SALIR PANTALLA COMPLETA' : '⛶ PANTALLA COMPLETA';
    }
    if (isFull) {
      document.body.classList.add('is-fullscreen');
    } else {
      document.body.classList.remove('is-fullscreen');
    }
    this.scaleCanvas();
  }
};

async function boot() {
  const canvas = document.getElementById('game');
  Game.canvas = canvas;
  Game.ctx = canvas.getContext('2d');
  Game.ctx.imageSmoothingEnabled = false;
  Game.scaleCanvas();

  window.addEventListener('resize', () => Game.scaleCanvas());

  // Listeners de cambio de pantalla completa del navegador
  ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(ev => {
    document.addEventListener(ev, () => Game.updateFullscreenUI());
  });

  // Doble click en el canvas para alternar pantalla completa
  canvas.addEventListener('dblclick', () => Game.toggleFullscreen());

  // Atajos de teclado para pantalla completa: F o F11
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'f' || e.key === 'F' || e.key === 'F11') {
      if (e.key === 'F11') e.preventDefault();
      const modal = document.getElementById('selfieModal');
      const isModalOpen = modal && !modal.classList.contains('hidden');
      if (!isModalOpen) {
        e.preventDefault();
        Game.toggleFullscreen();
      }
    }
  });

  // Clic restaura audio (política de navegadores)
  window.addEventListener('pointerdown', () => Sound.resume());
  Input.init();
  Sound.init();

  // ---- 公共资源预加载（本地开源素材，署名见 OPEN_SOURCE.md） ----
  const jobs = [];
  const I = (n, f) => jobs.push(Assets.loadImage(n, f));
  for (const ch of CHARACTERS) I(ch.file.replace('drivers/', ''), ch.file);
  I('invisible', 'drivers/invisible.png');
  I('letters', 'gui/letters.png');
  I('letters_alpha', 'gui/letters_alpha.png');
  I('digits', 'gui/digits.png');
  I('items', 'gui/items.png');
  I('coin', 'misc/coin.png');
  I('lakitu', 'misc/lakitu.png');
  I('shadow', 'misc/shadow.png');
  I('particles', 'misc/particles.png');
  I('floor_misc', 'objects/floor/misc.png');
  I('question_panel', 'objects/floor/question_panel.png');
  I('wall_misc', 'objects/wall/misc.png');
  I('menu_bg', 'menu/start/background.png');
  I('player_selection', 'gui/player_selection.png');
  I('title_logo', 'menu/start/background.png');   // 标题logo区域(6,16,234,76)同图

  // ---- 音频预载（sfx + 菜单音乐；赛道音乐在 Race.init 按需载入） ----
  const A = (n, f) => jobs.push(Assets.loadAudio(n, f, Sound.ctx));
  const sfxList = ['engine','racestart','itemreel','item','hit','star','grow','coin',
    'jump','landing','skid','menuselect','menumove','goal','finallap','fall',
    'lightning','throw','redshell','thud','thudpipe','brake','boost','spinout',
    'shrink','lakituwarning','win','lose'];
  for (const s of sfxList) A('sfx_' + s, 'sfx/' + s + '.ogg');
  A('music_menu', 'music/menu_title_screen.ogg');
  A('music_playerselect', 'music/menu_player_circuit.ogg');
  A('music_opening', 'music/circuit_opening.ogg');

  await Promise.all(jobs);

  // 菜单背景切片（menu/start/background.png 即 512x224 整幅）
  Assets.images['menu_bg_slice'] = Assets.slice('menu_bg', { x: 0, y: 0, w: 512, h: 224 });

  Text.init();
  Gui.init();
  initItemSprites();
  M7.prepareSprites();
  View.init();
  if (typeof FaceDriver !== 'undefined') FaceDriver.init();
  if (typeof SelfieSetup !== 'undefined') SelfieSetup.initUI();

  Game.setState(new BootState());
  requestAnimationFrame(loop);
}

let lastT = 0;
function loop(t) {
  const dt = Math.min((t - lastT) / 1000 || 0.016, 1 / 20);
  lastT = t;

  if (Game.state) {
    // 全局错误罩：任何帧内异常都显示在画面上并保持循环存活，
    // 避免一处抛错导致整个游戏无声冻结、无法定位。
    try {
      Fader.tick();   // 渐变推进先于状态更新；全黑瞬间在此完成真正切屏+装载
      Game.state.update(dt);
      if (Game.state.draw) Game.state.draw(Game.ctx);
    } catch (err) {
      Game.frameError = (Game.frameError === err.message ? Game.frameError
        : err.message + '\n' + String(err.stack || '').split('\n')[1]);
      console.error('[frame error]', err);
    }
    // 黑场overlay：盖在state画面之上、错误框之下（原版INIDISP暗化语义）
    Fader.draw(Game.ctx);
    if (Game.frameError) {
      Game.ctx.save();
      Game.ctx.fillStyle = 'rgba(0,0,0,0.75)';
      Game.ctx.fillRect(0, 0, 512, 90);
      Game.ctx.fillStyle = '#ff6060';
      Game.ctx.font = 'bold 13px monospace';
      Game.ctx.textAlign = 'left';
      const lines = String(Game.frameError).split('\n');
      lines.forEach((ln, i) => Game.ctx.fillText(ln.slice(0, 70), 8, 20 + i * 16));
      Game.ctx.restore();
    }
    // 把本帧按下的键分发给当前状态（菜单导航等）；渐变进行中吞输入（原版两级门控）
    if (!Fader.gateInput()) {
      Input.drainPressed(k => {
        if (Game.state.key) Game.state.key(k);
      });
    } else {
      Input.endFrame();
    }
  }
  requestAnimationFrame(loop);
}

boot();
