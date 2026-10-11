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
    // Lake佬钓鱼救援原版切片（两帧飞行动画）
    this.lakituRescue = [
      Assets.slice('lakitu', { x: 1, y: 34, w: 40, h: 32 }),
      Assets.slice('lakitu', { x: 42, y: 34, w: 40, h: 32 })
    ];
  },

  reset() {
    this.time = 0; this.coins = 0; this.rank = 1;
    this.itemIcon = 0; this.roulette = { active: false, t: 0, finalItem: 0 };
    if (this._reelSound) {
      Sound.stop(this._reelSound);
      this._reelSound = null;
    }
    this.lapMsg = null; this.wrongDir = false;
    this.wrongAlarmTimer = 0;
  },
  setItem(pu) {
    if (!this.roulette.active) this.itemIcon = pu;
  },
  startRoulette(finalItem) {
    if (this._reelSound) {
      Sound.stop(this._reelSound);
      this._reelSound = null;
    }
    this._reelSound = Sound.play('sfx_itemreel', { loop: true });
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
        if (this._reelSound) {
          Sound.stop(this._reelSound);
          this._reelSound = null;
        }
        this.itemIcon = this.roulette.finalItem;
        Sound.play('sfx_item');
      }
    }
    if (this.lapMsg) {
      this.lapMsg.t -= dt;
      if (this.lapMsg.t <= 0) this.lapMsg = null;
    }

    // Alarma rítmica de sentido contrario / Wrong Way
    if (this.wrongDir) {
      this.wrongAlarmTimer = (this.wrongAlarmTimer || 0) - dt;
      if (this.wrongAlarmTimer <= 0) {
        Sound.play('sfx_lakituwarning', { volume: 0.85 });
        this.wrongAlarmTimer = 0.55;
      }
    } else {
      this.wrongAlarmTimer = 0;
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

  drawItemBox(ctx) {
    const boxW = 56, boxH = 38;
    const boxX = Math.round((512 - boxW) / 2); // Exactamente centrado arriba como en Super Mario Kart original
    const boxY = 6;

    // Marco estilo Super Mario Kart original (fondo negro + bisel dorado retro)
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.fillRect(boxX, boxY, boxW, boxH);

    ctx.strokeStyle = '#e8c020'; // Dorado retro SNES
    ctx.lineWidth = 2.5;
    ctx.strokeRect(boxX + 1, boxY + 1, boxW - 2, boxH - 2);

    ctx.strokeStyle = '#885808'; // Sombra biselada interior
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX + 3, boxY + 3, boxW - 6, boxH - 6);

    let drawIcon = 0;
    if (this.roulette.active) {
      // Ciclo rápido y emocionante de objetos (16 cambios por segundo)
      const cycleItems = [1, 2, 3, 4, 5, 6, 7];
      if (this.roulette.t < 0.22) {
        // En los últimos instantes desacelera y fija el objeto aleatorio final
        drawIcon = this.roulette.finalItem;
      } else {
        const step = Math.floor((2.0 - this.roulette.t) * 16);
        drawIcon = cycleItems[step % cycleItems.length];
      }
    } else if (this.itemIcon && this.itemIcon > 0) {
      drawIcon = this.itemIcon;
    }

    if (drawIcon > 0 && this.itemIcons[drawIcon]) {
      ctx.drawImage(this.itemIcons[drawIcon], boxX + 4, boxY + 3, boxW - 8, boxH - 6);
    }
    ctx.restore();
  },

  draw(ctx) {
    const splitY = (typeof M7 !== 'undefined' && M7.SPLIT_Y) ? M7.SPLIT_Y : 320;

    // 计时器（右上）
    this.drawTimer(ctx);

    // 道具槽（中央上方：ruleta ciclando objetos como el original）
    this.drawItemBox(ctx);

    // 金币（赛道屏左下，正好在分割线上方）
    ctx.drawImage(this.coinImg, 8, splitY - 32, 24, 24);
    Text.write(ctx, String(this.coins), 36, splitY - 28, 3, '#ffe060');

    // 排名（赛道屏右下）
    const ranks = ['1st','2nd','3rd','4th','5th','6th','7th','8th'];
    Text.write(ctx, ranks[Math.min(7, this.rank - 1)], 504, splitY - 28, 3, '#ffffff', 'right');

    // 圈数消息（Lake佬举牌）
    if (this.lapMsg) {
      const a = Math.min(1, this.lapMsg.t);
      ctx.globalAlpha = a;
      const sign = this.lapMsg.text === 'finish!' ? this.lakituFinish : this.lakituLapSign;
      ctx.drawImage(sign, 216, 70, 80, 64);
      Text.write(ctx, this.lapMsg.text, 256, 150, 3, '#ffd040', 'center');
      ctx.globalAlpha = 1;
    }

    // 逆行警告（Cartel arcade retro con destello e impacto visual）
    if (this.wrongDir) {
      const flash = (this.time * 4 | 0) % 2 === 0;
      ctx.save();
      // Lakitu con el cartel de marcha atrás
      const lakSign = this.lakituLapSign;
      if (lakSign) {
        ctx.drawImage(lakSign, 256 - 28, 28, 56, 45);
      }
      const bw = 260, bh = 46, bx = 256 - bw / 2, by = 76;
      // Fondo rojo con sombra
      ctx.fillStyle = flash ? 'rgba(220, 20, 20, 0.95)' : 'rgba(140, 10, 10, 0.90)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = flash ? '#ffd700' : '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeRect(bx, by, bw, bh);

      // Franjas de precaución amarillas
      ctx.fillStyle = '#ffd700';
      ctx.fillRect(bx, by, 8, bh);
      ctx.fillRect(bx + bw - 8, by, 8, bh);

      Text.ui(ctx, '⛔ WRONG WAY! ⛔', 256, by + 4, 18, flash ? '#ffffff' : '#ffd700', 'center');
      Text.ui(ctx, '¡SENTIDO CONTRARIO!', 256, by + 26, 11, '#ffffff', 'center');
      ctx.restore();
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