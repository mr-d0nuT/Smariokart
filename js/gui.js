/* ============================================================
 * Süper Mario Kart Web - GUI/HUD
 * 移植 textutils(8x8位图字体) / timer / itemIndicator / 排名
 * ============================================================ */
'use strict';

const Text = {
  cells: [], alpha: [], shadow: [],
  // 字符序: a-z 0-9 . ( ) ? ! ' " - > <
  CHAR_MAP(c) {
    if (c >= 'a' && c <= 'z') return c.charCodeAt(0) - 97;
    if (c >= '0' && c <= '9') return 26 + +c;
    switch (c) {
      case '.': return 36; case '(': return 37; case ')': return 38;
      case '?': return 39; case '!': return 40; case "'": return 41;
      case '"': return 42; case '-': return 43; case '>': return 44;
      case '<': return 45; default: return 39;
    }
  },
  init() {
    for (let i = 0; i < 46; i++) {
      const col = i % 13, row = (i / 13) | 0;
      const x = 1 + col * 9, y = 1 + row * 9;
      this.cells.push(Assets.slice('letters', { x, y, w: 8, h: 8 }));
      this.alpha.push(Assets.slice('letters_alpha', { x, y, w: 8, h: 8 }));
      this.shadow.push(Assets.slice('letters', { x, y: y + 31, w: 8, h: 8 }));
    }
  },
  _tintCache: {},
  /* 把alpha字形染成指定颜色（缓存） */
  tint(i, color) {
    const key = i + '_' + color;
    if (this._tintCache[key]) return this._tintCache[key];
    const c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    const cx = c.getContext('2d');
    cx.drawImage(this.alpha[i], 0, 0);
    cx.globalCompositeOperation = 'source-in';
    cx.fillStyle = color;
    cx.fillRect(0, 0, 8, 8);
    this._tintCache[key] = c;
    return c;
  },
  /* 带颜色描边文字 */
  write(ctx, text, x, y, scale, color = '#ffffff', align = 'left') {
    text = String(text).toLowerCase();
    const w = text.length * 9 * scale;
    if (align === 'center') x -= w / 2;
    else if (align === 'right') x -= w;
    for (const ch of text) {
      if (ch !== ' ') {
        const i = this.CHAR_MAP(ch);
        ctx.drawImage(this.shadow[i], x + scale, y + scale, 8 * scale, 8 * scale);
        ctx.drawImage(this.tint(i, color), x, y, 8 * scale, 8 * scale);
      }
      x += 9 * scale;
    }
  },
  /* Bug1：菜单/开屏用系统字体高清晰渲染（位图字体仅保留给HUD）。
   * px为像素字号；x/y为左上角（align=center时x为中点）。带黑色投影。 */
  ui(ctx, text, x, y, px, color = '#ffffff', align = 'left') {
    text = String(text);
    ctx.save();
    ctx.font = 'bold ' + px + 'px monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = align === 'center' ? 'center' : (align === 'right' ? 'right' : 'left');
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillText(text, x + Math.max(1, px / 16), y + Math.max(1, px / 16));
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  },
};

const Gui = {
  time: 0,
  coins: 0,
  rank: 1,
  itemIcon: 0,
  roulette: { active: false, t: 0, finalItem: 0 },
  lapMsg: null,          // {text, t}
  wrongDir: false,

  digits: [], comas: [],
  init() {
    for (let i = 0; i < 10; i++)
      this.digits.push(Assets.slice('digits', { x: i * 9, y: 0, w: 8, h: 14 }));
    this.comas.push(Assets.slice('digits', { x: 90, y: 0, w: 8, h: 14 }));   // :
    this.comas.push(Assets.slice('digits', { x: 99, y: 0, w: 8, h: 14 }));   // .
    this.itemIcons = [];
    for (let i = 0; i < 8; i++)
      this.itemIcons.push(Assets.slice('items', { x: i * 27, y: 0, w: 26, h: 18 }));
    this.coinImg = Assets.slice('coin', { x: 0, y: 0, w: 16, h: 16 });
    // Lake佬贴图切片（坐标来自lakitu.cpp）
    this.lakituLights = [];
    for (let i = 0; i < 3; i++)
      this.lakituLights.push(Assets.slice('lakitu', { x: 1 + i * 41, y: 1, w: 40, h: 32 }));
    this.lakituLapSign = Assets.slice('lakitu', { x: 3, y: 68, w: 40, h: 32 });
    this.lakituFinish = Assets.slice('lakitu', { x: 89, y: 34, w: 40, h: 32 });
  },

  reset() {
    this.time = 0; this.coins = 0; this.rank = 1;
    this.itemIcon = 0; this.roulette = { active: false, t: 0, finalItem: 0 };
    this.lapMsg = null; this.wrongDir = false;
  },
  setItem(pu) {
    if (!this.roulette.active) this.itemIcon = pu;
  },
  startRoulette(finalItem) {
    this.roulette = { active: true, t: 2.0, finalItem };
  },
  showLap(lap) {
    this.lapMsg = { text: lap > NUM_LAPS ? 'finish!' : 'lap ' + lap, t: 2.5 };
  },

  update(dt) {
    this.time += dt;
    if (this.roulette.active) {
      this.roulette.t -= dt;
      if (this.roulette.t <= 0) {
        this.roulette.active = false;
        this.itemIcon = this.roulette.finalItem;
        Sound.play('sfx_item');
      }
    }
    if (this.lapMsg) {
      this.lapMsg.t -= dt;
      if (this.lapMsg.t <= 0) this.lapMsg = null;
    }
  },

  drawTimer(ctx) {
    const ms = this.time * 1000 | 0;
    const min = (ms / 60000) | 0, sec = ((ms % 60000) / 1000) | 0, cs = ((ms % 1000) / 10) | 0;
    const seq = [
      { d: (min / 10) | 0 }, { d: min % 10 }, { c: 0 },
      { d: (sec / 10) | 0 }, { d: sec % 10 }, { c: 1 },
      { d: (cs / 10) | 0 }, { d: cs % 10 }
    ];
    let x = 512 - 8 * (16 + 2) - 4, y = 6;
    for (const s of seq) {
      const img = s.c !== undefined ? this.comas[s.c] : this.digits[s.d];
      ctx.drawImage(img, x, y, 16, 28);
      x += 18;
    }
  },

  draw(ctx) {
    // 计时器
    this.drawTimer(ctx);
    // 金币（左下）
    ctx.drawImage(this.coinImg, 8, 448 - 34, 24, 24);
    Text.write(ctx, String(this.coins), 38, 448 - 30, 3, '#ffe060');
    // 道具槽（左上）
    const iconIdx = this.roulette.active
      ? (((this.time * 10) | 0) % 7) + 1
      : this.itemIcon % 8;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(6, 6, 56, 40);
    ctx.drawImage(this.itemIcons[iconIdx], 8, 8, 52, 36);
    // 排名（右下）
    const ranks = ['1st','2nd','3rd','4th','5th','6th','7th','8th'];
    Text.write(ctx, ranks[Math.min(7, this.rank - 1)], 504, 216, 3, '#ffffff', 'right');
    // 圈数消息（Lake佬举牌）
    if (this.lapMsg) {
      const a = Math.min(1, this.lapMsg.t);
      ctx.globalAlpha = a;
      const sign = this.lapMsg.text === 'finish!' ? this.lakituFinish : this.lakituLapSign;
      ctx.drawImage(sign, 216, 70, 80, 64);
      Text.write(ctx, this.lapMsg.text, 256, 150, 3, '#ffd040', 'center');
      ctx.globalAlpha = 1;
    }
    // 逆行警告
    if (this.wrongDir && ((this.time * 3 | 0) % 2 === 0)) {
      Text.write(ctx, 'wrong way!', 256, 120, 3, '#ff5050', 'center');
    }
  },
  /* 气球对战HUD：顶部倒计时 + 双侧气球计数 */
  drawBattle(ctx, race) {
    // 倒计时
    const tl = Math.max(0, race.timeLeft);
    const mm = (tl / 60) | 0, ss = Math.ceil(tl % 60) % 60;
    const urgent = tl < 30 && ((tl * 2 | 0) % 2 === 0);
    Text.ui(ctx, mm + ':' + String(ss).padStart(2, '0'), 256, 8, 22,
            urgent ? '#ff5050' : '#ffffff', 'center');
    // 玩家气球（左上）
    this.drawBalloonRow(ctx, 10, 12, 'YOU', race.player);
    // 最强对手（右上）
    let rival = null;
    for (const d of race.drivers)
      if (d !== race.player && (!rival || d.balloons > rival.balloons)) rival = d;
    if (rival) this.drawBalloonRow(ctx, 502 - 150, 12, rival.char.name.toUpperCase(), rival, true);
  },

  drawBalloonRow(ctx, x, y, label, d, rightAlign = false) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 4, y - 4, 154, 40);
    ctx.restore();
    Text.ui(ctx, label, rightAlign ? x + 150 : x, y, 13, d.balloons <= 0 ? '#666672' : '#ffe060');
    for (let b = 0; b < 3; b++) {
      const bx = (rightAlign ? x + 138 : x + 6) + b * 20 - (rightAlign ? 40 : 0);
      ctx.beginPath();
      ctx.arc(bx, y + 24, 8, 0, Math.PI * 2);
      if (b < d.balloons) {
        ctx.fillStyle = '#ff4050';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(bx - 2.5, y + 21, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    if (d.balloons <= 0)
      Text.ui(ctx, 'OUT', rightAlign ? x + 150 : x, y + 16, 11, '#ff7050', rightAlign ? 'right' : 'left');
  },
};