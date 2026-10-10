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
  /* 请求式切屏：交Fader淡出→全黑切换→自动淡入（对应原版设$32挂起） */
  transitionTo(s) {
    Fader.request(s);
  },

  scaleCanvas() {
    const c = this.canvas;
    const ratio = 512 / 448;
    let w = window.innerWidth, h = window.innerHeight;
    if (w / h > ratio) w = h * ratio; else h = w / ratio;
    // Bug1修复：整数倍缩放必须宽和高都放得下（此前只按宽度floor(1920/512)=3，
    // 但448*3=1344>1080 高度溢出，导致回退小数缩放而整体模糊）
    const s = Math.min(Math.floor(w / 512), Math.floor(h / 448));
    if (s >= 1) {
      // 整数倍：像素完美清晰
      c.style.width = 512 * s + 'px';
      c.style.height = 448 * s + 'px';
    } else {
      // 放不下整数倍才用小数缩放（铺满可用区域）
      c.style.width = Math.floor(w) + 'px';
      c.style.height = Math.floor(h) + 'px';
    }
    if (this.ctx) this.ctx.imageSmoothingEnabled = false;
  }
};

async function boot() {
  const canvas = document.getElementById('game');
  Game.canvas = canvas;
  Game.ctx = canvas.getContext('2d');
  Game.ctx.imageSmoothingEnabled = false;
  Game.scaleCanvas();
  window.addEventListener('resize', () => Game.scaleCanvas());
  // 点击也恢复音频（浏览器手势策略）
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
