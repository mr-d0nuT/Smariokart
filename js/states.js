/* ============================================================
 * Süper Mario Kart Web - 状态机与渲染管线
 * 标题/选人/选赛道/Lake佬开场/比赛/结算/暂停
 * ============================================================ */
'use strict';

/* ---------------- 全赛道注册表（20条GP + 4对战） ----------------
 * 带 dir 的5条使用上游开源项目原版素材(assets/circuit/<dir>)；
 * 其余15条由 trackgen.js 程序化生成 */
const RACE_TRACKS = {
  mario_circuit_1: { name: 'mario circuit 1', theme: 'circuit' },
  donut_plains_1:  { name: 'donut plains 1',  dir: 'donut_plains_1' },
  ghost_valley_1:  { name: 'ghost valley 1',  dir: 'ghost_valley_1' },
  bowser_castle_1: { name: 'bowser castle 1', dir: 'bowser_castle_1' },
  mario_circuit_2: { name: 'mario circuit 2', dir: 'mario_circuit_2' },
  choco_island_1:  { name: 'choco island 1',  theme: 'choco' },
  ghost_valley_2:  { name: 'ghost valley 2',  theme: 'ghost' },
  donut_plains_2:  { name: 'donut plains 2',  theme: 'donut' },
  bowser_castle_2: { name: 'bowser castle 2', theme: 'bowser' },
  mario_circuit_3: { name: 'mario circuit 3', theme: 'circuit' },
  koopa_beach_1:   { name: 'koopa beach 1',   theme: 'koopa' },
  choco_island_2:  { name: 'choco island 2',  theme: 'choco' },
  vanilla_lake_1:  { name: 'vanilla lake 1',  theme: 'vanilla' },
  bowser_castle_3: { name: 'bowser castle 3', theme: 'bowser' },
  mario_circuit_4: { name: 'mario circuit 4', theme: 'circuit' },
  donut_plains_3:  { name: 'donut plains 3',  theme: 'donut' },
  koopa_beach_2:   { name: 'koopa beach 2',   theme: 'koopa' },
  ghost_valley_3:  { name: 'ghost valley 3',  theme: 'ghost' },
  vanilla_lake_2:  { name: 'vanilla lake 2',  theme: 'vanilla' },
  rainbow_road:    { name: 'rainbow road',    theme: 'rainbow' }
};
const CUPS = [
  { name: 'mushroom cup', color: '#ffd040',
    tracks: ['mario_circuit_1','donut_plains_1','ghost_valley_1','bowser_castle_1','mario_circuit_2'] },
  { name: 'flower cup', color: '#ff90c0',
    tracks: ['choco_island_1','ghost_valley_2','donut_plains_2','bowser_castle_2','mario_circuit_3'] },
  { name: 'star cup', color: '#9ad0ff',
    tracks: ['koopa_beach_1','choco_island_2','vanilla_lake_1','bowser_castle_3','mario_circuit_4'] },
  { name: 'special cup', color: '#c0a0ff',
    tracks: ['donut_plains_3','koopa_beach_2','ghost_valley_3','vanilla_lake_2','rainbow_road'] }
];
const BATTLE_COURSE_IDS = ['battle_course_1','battle_course_2','battle_course_3','battle_course_4'];
const GP_POINTS = [9, 6, 3, 1, 0, 0, 0, 0];   // 原版积分
const CC_MULT = [1.75, 2.1, 2.7];
/* C++ 重写采用上下双屏构图：上半屏赛道、下半屏完整地图。
 * mk-main 的原版布局研究不能直接套到这条渲染管线，否则地图和车手会进入两套坐标系。 */
const AUTHENTIC_LAYOUT = false;

/* ---------------- 渐变编排器（还原原版 $80:B181 fade引擎 + $32挂起state语义） ----------------
 * 切屏=请求挂起→亮度逐帧降到0（全黑）→此刻才真正切state并init装载→自动淡入。
 * 步长$0060/帧(8.8定点)=0.375级/帧，单程40帧≈0.67s；亮度0..15对应INIDISP 4bit */
const Fader = {
  mode: 'idle',        // idle | out | in
  level: 15,           // 亮度 0..15（15=完全可见）
  pending: null,       // 待切换的目标state
  STEP: 0.375,         // 原版 $0060/帧(8.8定点)=0.375级/帧 → 全程40帧
  request(s) {         // 对应原版设 $32 挂起
    if (this.pending || this.mode === 'out') return;
    this.pending = s;
    this.mode = 'out';
  },
  tick() {
    if (this.mode === 'out') {
      this.level -= this.STEP;
      if (this.level <= 0) {
        this.level = 0; this.mode = 'in';
        const s = this.pending; this.pending = null;
        if (s) Game.rawSetState(s);      // 全黑瞬间真正切换+init装载
      }
    } else if (this.mode === 'in') {
      this.level = Math.min(15, this.level + this.STEP);
      if (this.level >= 15) { this.level = 15; this.mode = 'idle'; }
    }
  },
  draw(ctx) {           // 黑场overlay，画在state之后、错误框之前
    if (this.mode !== 'idle' || this.level < 15) {
      const a = 1 - this.level / 15;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,' + Math.min(1, Math.max(0, a)) + ')';
      ctx.fillRect(0, 0, 512, 448);
      ctx.restore();
    }
  },
  gateInput() { return this.pending !== null || this.mode !== 'idle' || this.level < 14.9; }
};

/* ---------------- 输入 ---------------- */
const Input = {
  held: {}, pressedSet: new Set(), rawPressedSet: new Set(),
  init() {
    window.addEventListener('keydown', e => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
      this.rawPressedSet.add(e.key.toLowerCase());   // 原始键记录：供无动作映射的键使用（选人屏取消Z等）
      // Bug2/4/5修复：一个物理键可映射多个动作（↑=菜单up+比赛accel）
      const ks = this.map(e.key) || [];
      for (const k of ks) {
        if (!this.held[k]) this.pressedSet.add(k);
        this.held[k] = true;
      }
      Sound.init();
      Sound.resume();
    });
    window.addEventListener('keyup', e => {
      const ks = this.map(e.key) || [];
      for (const k of ks) this.held[k] = false;
    });
  },
  drainPressed(fn) {
    for (const k of this.pressedSet) fn(k);
    this.pressedSet.clear();
    this.rawPressedSet.clear();
  },
  /* 原始物理键查询（不经动作映射；本帧内有效，随drain/endFrame清空） */
  rawPressed(rawKey) { return this.rawPressedSet.has(rawKey); },
  /* 返回动作名数组（一个键承担多个职责）：
   * ↑/↓ 在菜单里是上下导航(up/down)，在比赛中是油门/刹车(accel/brake)
   * E=道具向前掷 Q=道具向后放 */
  map(k) {
    switch (k.toLowerCase()) {
      case 'arrowleft': case 'a': return ['left'];
      case 'arrowright': case 'd': return ['right'];
      case 'w': case 'x': case 'arrowup': return ['accel', 'up'];
      case 's': case 'z': case 'arrowdown': return ['brake', 'down'];
      case 'c': case 'shift': return ['drift'];
      case 'r': return ['r', 'restart'];
      case 'e': case 'q': case ' ': return ['item', 'itemfront'];
      case 'm': return ['m', 'mute'];
      case 'enter': return ['accept'];
      case 'escape': return ['back'];
      default: return null;
    }
  },
  down(k) { return !!this.held[k]; },
  pressed(k) { return this.pressedSet.has(k); },
  endFrame() { this.pressedSet.clear(); this.rawPressedSet.clear(); }
};

/* ---------------- 比赛视图渲染管线 ---------------- */
const View = {
  circuitImageData: null, circuitCanvas: null,

  init() {
    this.circuitCanvas = document.createElement('canvas');
    this.circuitCanvas.width = 512;
    this.circuitCanvas.height = Math.round(448 * (M7.CIRCUIT_HEIGHT_PCT || (276 / 448)));
    this.circuitImageData = this.circuitCanvas.getContext('2d')
      .createImageData(512, this.circuitCanvas.height);
  },

  drawSky(ctx, modAngle) {
    const skyH = M7.SKY_HEIGHT || 44;
    const layers = [
      { img: GameMap.skyBack, front: false },
      { img: GameMap.skyFront, front: true }
    ];
    for (const L of layers) {
      const w = L.img.width / 2, hFull = L.img.height;
      const h = Math.max(1, Math.floor(hFull * 20 / 32));
      const ySrc = hFull - h;
      const sx0 = M7.skySampleX(modAngle, w, L.front);
      let dx = 0;
      let sx = sx0;
      while (dx < 512) {
        const avail = Math.min(w - sx, 512 - dx);
        if (avail <= 0) break;
        ctx.drawImage(L.img, sx, ySrc, avail, h, dx, 0, avail * (skyH / h) + 1, skyH);
        dx += avail * (skyH / h);
        sx = 0;
      }
    }
  },

  drawCircuit(ctx, camPos, camAngle, mosaic = 0) {
    const skyH = M7.SKY_HEIGHT || 44;
    if (M7.useFixed !== false) {
      const table = M7.buildRowTable(512, this.circuitCanvas.height,
        camPos, camAngle, M7.FOV_HALF, M7.CLIP_NEAR, M7.CLIP_FAR, true);
      M7.renderFixed(this.circuitImageData, 512, this.circuitCanvas.height,
                     table, GameMap.courseSrc, GameMap.edgeSrc, mosaic);
    } else {
      M7.render(this.circuitImageData, 512, this.circuitCanvas.height,
                camPos, camAngle, M7.FOV_HALF, M7.CLIP_NEAR, M7.CLIP_FAR,
                true, GameMap.courseSrc, GameMap.edgeSrc);
    }
    this.circuitCanvas.getContext('2d').putImageData(this.circuitImageData, 0, 0);
    ctx.drawImage(this.circuitCanvas, 0, skyH);
  },

  /* 收集并按远近排序绘制所有投影精灵
   * showPlayerKart=false 时不画屏幕中央底部的固定玩家车（开场镜头用，
   * 对应C++ racestart.cpp::draw 不调用 player->getDrawables） */
  drawSprites(ctx, camDriver, race, showPlayerKart = true) {
    const list = [];
    const skyH = M7.SKY_HEIGHT || 44;
    const circuitH = this.circuitCanvas ? this.circuitCanvas.height : 276;
    const project = (pos) => {
      return M7.mapToScreen(camDriver.position, camDriver.posAngle, pos);
    };
    const place = (scr, w, h, heightUnits, zscale) => {
      return {
        x: scr.x * 512,
        y: scr.y * circuitH + skyH - heightUnits * zscale,
        w, h
      };
    };

    // 墙物体（管道/thwomp）
    for (const wo of GameMap.wallObjects) {
      const pr = project(wo);
      if (!pr.ok) continue;
      const zscale = Math.min(M7.spriteScale(Math.max(0.008, pr.z)), 3.2);
      const sw = 24 * M7.CIRCUIT_HEIGHT_PCT * zscale;
      const sh = 32 * M7.CIRCUIT_HEIGHT_PCT * zscale;
      const rect = place(pr, sw, sh, wo.height, zscale);
      const ws = M7.wallSprites;
      const img = wo.type === WallType.GREEN_PIPE ? ws.pipeGreen
                : wo.type === WallType.ORANGE_PIPE ? ws.pipeOrange
                : wo.type === WallType.NORMAL_THWOMP ? ws.thwomp
                : ws.thwompSuper;
      list.push({ z: pr.z, draw: () => ctx.drawImage(img, rect.x - sw/2, rect.y - sh, sw, sh) });
    }

    // 道具
    for (const item of race.items) {
      const pr = project(item.position);
      if (!pr.ok) continue;
      const zscale = Math.min(M7.spriteScale(Math.max(0.008, pr.z)), 3.2);
      const sw = 16 * M7.CIRCUIT_HEIGHT_PCT * zscale;
      const rect = place(pr, sw, sw, item.height, zscale);
      const img = item.sprite();
      list.push({ z: pr.z, draw: () => ctx.drawImage(img, rect.x - sw/2, rect.y - sw, sw, sw) });
    }

    // 特效
    for (const fx of race.effects) {
      const pr = project(fx.pos);
      if (!pr.ok) continue;
      const zscale = Math.min(M7.spriteScale(Math.max(0.008, pr.z)), 3.2);
      const sw = 24 * M7.CIRCUIT_HEIGHT_PCT * zscale;
      const rect = place(pr, sw, sw * 0.66, 0, zscale);
      const frame = fx.frames[Math.min(fx.frames.length - 1, (fx.t * 15 | 0) % fx.frames.length)];
      list.push({ z: pr.z, draw: () => { ctx.globalAlpha = clamp(fx.life * 2, 0, 1); ctx.drawImage(frame, rect.x - sw/2, rect.y - sw*0.66, sw, sw*0.66); ctx.globalAlpha = 1; } });
    }

    // 对手车手
    for (const d of race.drivers) {
      if (d === camDriver || d.has(DS.INVISIBLE)) continue;
      const pr = project(d.position);
      if (!pr.ok) continue;
      const zscale = Math.min(M7.spriteScale(Math.max(0.008, pr.z)), 3.2);
      const sw = 32 * M7.CIRCUIT_HEIGHT_PCT * zscale;
      const relAngle = camDriver.posAngle - d.posAngle;
      const vf = d.animator.viewFrame(relAngle);
      const rect = place(pr, sw, sw, d.height, zscale);
      list.push({
        z: pr.z,
        draw: () => {
          // 接地投影：椭圆随高度升高变淡，消除悬空感
          ctx.save();
          ctx.globalAlpha = clamp(0.35 - d.height * 0.03, 0.08, 0.35);
          ctx.fillStyle = '#000';
          ctx.beginPath();
          ctx.ellipse(rect.x, rect.y - 2, sw * 0.34, sw * 0.14, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          ctx.save();
          ctx.translate(rect.x, rect.y);
          if (vf.mirror) ctx.scale(-1, 1);
          if (d.animator.starTime > 0) ctx.filter = `hue-rotate(${(d.animator.starTime * 720) % 360}deg) saturate(2)`;
          ctx.drawImage(d.animator.driving[vf.frame], -sw/2, -sw, sw, sw);
          ctx.restore();
        }
      });
    }

    // 玩家自己（开场镜头时跳过——Bug6：否则选的角色会一直贴在屏幕中央跟着镜头飞）
    if (showPlayerKart) {
      const pz = M7.CAM_2_PLAYER_DST / 1024;
      list.push({
        z: pz,
        draw: () => {
          const scale = 2;
          const px = 256, py = (M7.SPLIT_Y || 320) - 34;
          camDriver.animator.drawParticles(ctx, px, py, scale,
            GameMap.getMaterial(camDriver.position.x, camDriver.position.y),
            camDriver.speedForward > camDriver.vehicle.maxNormalLinearSpeed / 4 && camDriver.height === 0);
          camDriver.animator.draw(ctx, px, py, scale, {
            speedTurn: camDriver.speedTurn, height: camDriver.height
          });

          // Rescate de Lakitu en su nube con caña de pescar al caer al agua o al vacío
          if (camDriver.falling && camDriver._fallT > 0.35) {
            const T = camDriver._fallT;
            const kartHop = (camDriver.height || 0) * 2.5;
            const lakituY = py - kartHop - 58;
            const bobLakitu = Math.sin(T * 14) * 2.5;
            const fIdx = Math.floor(T * 6) % 2;
            const lakImg = (Gui.lakituRescue && Gui.lakituRescue[fIdx]) || Gui.lakituLapSign;
            if (lakImg) {
              ctx.save();
              // Línea de pescar blanca/negra desde la caña de Lakitu hasta el enganche del kart
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.moveTo(px - 14, lakituY + 14 + bobLakitu);
              ctx.lineTo(px, py - kartHop - 14);
              ctx.stroke();

              ctx.strokeStyle = '#000000';
              ctx.lineWidth = 0.8;
              ctx.stroke();

              // Lakitu volando en su nube con la caña de pescar
              ctx.drawImage(lakImg, px - 38, lakituY + bobLakitu, 68, 54);
              ctx.restore();
            }
          }
        }
      });
    }

    list.sort((a, b) => b.z - a.z);
    for (const it of list) it.draw();
  },

  drawMinimap(ctx, race) {
    const splitY = (typeof M7 !== 'undefined' && M7.SPLIT_Y) ? M7.SPLIT_Y : 320;
    const mapH = 448 - splitY;

    // Fondo del minimapa
    ctx.fillStyle = '#080812';
    ctx.fillRect(0, splitY, 512, mapH);

    // Dibujar el minimapa renderizado
    if (GameMap.minimapCanvas) {
      ctx.drawImage(GameMap.minimapCanvas, 0, splitY, 512, mapH);
    }

    // Línea divisoria elegante estilo Super Mario Kart
    ctx.fillStyle = '#f8d020';
    ctx.fillRect(0, splitY - 2, 512, 2);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, splitY, 512, 1);

    const drawDrivers = () => {
      const drivers = [...race.drivers].sort((a, b) => a.position.y - b.position.y);
      for (const d of drivers) {
        if (d.has(DS.INVISIBLE)) continue;
        const mc = GameMap.mapCoordinates(d.position.x, d.position.y);
        const vf = d.animator.viewFrame(d.posAngle + d.speedTurn * 0.2 + Math.PI / 2);
        const s2 = 12;
        ctx.save();
        ctx.translate(mc.x * 512, mc.y * 448);
        if (d.isRealPlayer && typeof FaceDriver !== 'undefined' && FaceDriver.active && FaceDriver.minimapIcon) {
          ctx.drawImage(FaceDriver.minimapIcon, -s2 / 2, -s2 * 0.9, s2, s2);
        } else {
          if (vf.mirror) ctx.scale(-1, 1);
          ctx.drawImage(d.animator.driving[vf.frame], -s2 / 2, -s2 * 0.9, s2, s2);
        }
        ctx.restore();
      }
    };

    drawDrivers();
  }
};

/* ---------------- 比赛 ---------------- */
class Race {
  constructor(trackId, ccIndex, playerChar, opts = {}) {
    const meta = RACE_TRACKS[trackId] || { name: trackId };
    this.trackId = trackId;
    this.trackName = meta.name;
    this.musicDir = meta.dir || TRACKGEN_MUSIC[meta.theme] || 'mario_circuit_2';   // 音乐目录（生成赛道按主题映射）
    this.isGen = !meta.dir;                    // 无dir=trackgen.js 程序化生成
    this.isBattle = !!opts.battle;
    this.attract = !!opts.attract;             // attract演示：玩家车由AI代驾
    this.ccIndex = ccIndex;
    this.playerChar = playerChar;
    this.drivers = [];
    this.items = [];
    this.effects = [];
    this.time = 0;
    this.timeLeft = 180;                       // 气球对战倒计时
    this.flash = 0;
    this.over = false;
    this.ready = false;
    Object.defineProperty(this, 'circuit', { get() { return { name: this.trackName }; } });
  }

  async init() {
    if (this.isGen) {
      await GameMap.loadGenerated(this.trackId);
    } else {
      await GameMap.load(RACE_TRACKS[this.trackId].dir);
      await Assets.loadAudio('music_circuit', 'circuit/' + this.musicDir + '/music.ogg', Sound.ctx);
      await Assets.loadAudio('music_finallap', 'circuit/' + this.musicDir + '/final_lap.ogg', Sound.ctx);
    }
    GameMap._battleFlag = this.isBattle;
    GameMap.isBattle = this.isBattle;
    // file:// 回退：告知Sound当前赛道的音乐文件位置（生成赛道按主题映射）
    const mDir = this.musicDir;
    window.__circuitMusic = 'circuit/' + mDir + '/music.ogg';
    window.__circuitFinalMusic = 'circuit/' + mDir + '/final_lap.ogg';
    if (!this.isGen) { /* 资产赛道已在上方预载Buffer */ }
    if (this.isGen) {
      await Assets.loadAudio('music_circuit', window.__circuitMusic, Sound.ctx);
      await Assets.loadAudio('music_finallap', window.__circuitFinalMusic, Sound.ctx);
    }
    // 阶段3-C1：排量缩放作用于全部车辆（此前AI恒为100cc物理），
    // 玩家额外乘 vmbatlle start.cpp 的 PCM（50cc×1.15/100cc×1.09/150cc×1.055）
    const PCM = [1.15, 1.09, 1.055][this.ccIndex];
    for (let i = 0; i < 8; i++) {
      const isPlayer = i === this.playerChar;
      const d = new Driver(i, isPlayer ? 'player' : 'ai', this.ccIndex, isPlayer);
      const vt = VEHICLE_TYPES[d.char.type];
      d.vehicle = makeVehicle(vt.m, vt.t, vt.s, vt.w, vt.convex,
                              CC_MULT[this.ccIndex] * (isPlayer ? PCM : 1));
      this.drivers.push(d);
    }
    // 发车排位：GP后续比赛按上场名次，首场/常规赛玩家第8位发车追赶
    let slots;
    if (typeof Game !== 'undefined' && Game.gp && Game.gp.lastRanking && Game.gp.raceIdx > 0) {
      slots = [...Game.gp.lastRanking];
    } else {
      const order = [...Array(8).keys()];
      const aiSlots = order.filter(i => i !== this.playerChar);
      for (let i = aiSlots.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [aiSlots[i], aiSlots[j]] = [aiSlots[j], aiSlots[i]];
      }
      slots = [...aiSlots, this.playerChar];   // 玩家第8位发车
    }
    if (this.isBattle) {
      // 对战出生：8辆绕场心椭圆均匀分布朝向圆心，开局全体2秒无敌
      let ax0 = 128, ay0 = 128, ax1 = 0, ay1 = 0;
      for (const [tx, ty, tw, thh] of TRACKGEN_BATTLES[this.trackId].arena) {
        ax0 = Math.min(ax0, tx); ay0 = Math.min(ay0, ty);
        ax1 = Math.max(ax1, tx + tw); ay1 = Math.max(ay1, ty + thh);
      }
      const cxT = (ax0 + ax1) / 2 / 128, cyT = (ay0 + ay1) / 2 / 128;
      const rxT = (ax1 - ax0) / 2 / 128 * 0.55, ryT = (ay1 - ay0) / 2 / 128 * 0.55;
      slots.forEach((charIdx, pos) => {
        const d = this.drivers[charIdx];
        const ang = (pos / 8) * Math.PI * 2 + Math.PI / 8;
        const px = cxT + Math.cos(ang) * rxT, py = cyT + Math.sin(ang) * ryT;
        d.setPositionAndReset({ x: px, y: py }, ang + Math.PI);   // 朝向圆心
        d.pushState(DS.SHIELD, GameClock.now() + 2);
      });
    } else {
      slots.forEach((charIdx, pos) => {
        const d = this.drivers[charIdx];
        const p = GameMap.getPlayerInitialPosition(pos + 1);
        d.setPositionAndReset(p, Number.isFinite(p.angle) ? p.angle : -Math.PI / 2);
        d.lastGradient = AI.posValue(p.x, p.y);   // 初始梯度：排名按发车位
      });
    }
    this.ranking = slots.map(ci => this.drivers[ci]);
    this.ranking.forEach((d, i) => d.rank = i);
    this.player = this.drivers[this.playerChar];
    // attract演示分支（发车之后）：玩家车交给AI驾驶，AttractState用空输入驱动全场
    if (this.attract) this.player.controlType = 'ai';
    // Bug8修复：比赛开始前重置GUI计时器（否则换赛道/重开时计时累加）
    Gui.reset();
    this.ready = true;
  }

  driverAtRank(r) { return this.ranking[r] || null; }
  driverAheadOf(d) {
    const i = this.ranking.indexOf(d);
    return i > 0 ? this.ranking[i - 1] : null;
  }
  onLap(laps) {
    Gui.showLap(laps);
    Sound.play('sfx_lakituwarning');
    if (laps === NUM_LAPS) {
      Sound.stopMusic();
      Sound.playMusic('music_finallap');
      Sound.play('sfx_finallap');
    }
  }
  onFinish(d) {
    d.finishTime = this.time;
    if (d.isRealPlayer && !this.attract) {     // attract演示不进结算流程，到点直接回标题
      this.over = true;
      Sound.stopMusic();
      Sound.play('sfx_goal');
      setTimeout(() => Sound.play(d.rank <= 2 ? 'sfx_win' : 'sfx_lose'), 800);
    }
  }
  onRescue() {
    Sound.playMusic('music_circuit');
    Gui.lapMsg = { text: 'ok! go!', t: 1.5 };
  }
  addSparkles(pos) {
    this.effects.push({ pos: { x: pos.x, y: pos.y }, frames: M7.sparkleFrames, t: 0, life: 0.35 });
  }

  updateRanks() {
    if (this.isBattle) {
      // 气球多者在前，平局比击破数
      this.ranking = [...this.drivers].sort((a, b) =>
        b.balloons - a.balloons || b.hitsDealt - a.hitsDealt);
      this.ranking.forEach((d, i) => d.rank = i);
      return;
    }
    const unfinished = this.drivers.filter(d => !d.finished)
      .sort((a, b) => b.laps - a.laps || a.lastGradient - b.lastGradient);
    const finished = this.drivers.filter(d => d.finished)
      .sort((a, b) => a.finishTime - b.finishTime);
    this.ranking = [...finished, ...unfinished];
    this.ranking.forEach((d, i) => d.rank = i);
    Gui.rank = this.player.rank + 1;
    Gui.coins = this.player.coins;
    Gui.wrongDir = !this.isBattle && !this.player.goingForwards &&
                   this.player.canDrive() && this.player.speedForward > 0.02;
  }

  update(dt, input) {
    this.time += dt;
    // Bug8修复：Gui.update从未被调用→右上角计时器不走
    Gui.update(dt);
    GameMap.updateObjects(dt);
    GameMap.refreshCourseIfNeeded();

    for (const d of this.drivers) {
      d.update(dt, d === this.player ? input : {}, this);
      if (d.controlType === 'ai' && d.powerUp !== PowerUp.NONE &&
          d.canDrive() && Math.random() < dt * 0.25) {
        useItem(d, this, d.rank > 3);
      }
      interactFloorObjects(d, this);
    }

    // 车手间碰撞与物理推挤（彻底杜绝穿模，真实弹开与体积互斥）
    const HITBOX_TILES = 1.35;   // 1.35格 ≈ 11像素 (两车接触距离，发车格间距为5格不会误碰)
    const HITBOX_SQ = HITBOX_TILES * HITBOX_TILES;
    for (let i = 0; i < this.drivers.length; i++) {
      for (let j = i + 1; j < this.drivers.length; j++) {
        const a = this.drivers[i], b = this.drivers[j];
        if (a.falling || b.falling) continue;
        if (Math.abs(a.height - b.height) > 6) continue;
        const dx = (b.position.x - a.position.x) * 128;
        const dy = (b.position.y - a.position.y) * 128;
        const distSq = dx * dx + dy * dy;
        if (distSq > HITBOX_SQ) continue;
        const dist = Math.max(Math.sqrt(distSq), 1e-4);
        const nx = dx / dist; // a 指向 b 的单位法向量
        const ny = dy / dist;

        // 星星无敌碰撞判定（受击者原地打转，不被击飞甩出赛道）
        if (a.isImmune() && !b.isImmune()) {
          b.applyHit();
          this.addSparkles(b.position);
          if (a.isRealPlayer || b.isRealPlayer) Sound.play('sfx_hit');
          continue;
        }
        if (b.isImmune() && !a.isImmune()) {
          a.applyHit();
          this.addSparkles(a.position);
          if (a.isRealPlayer || b.isRealPlayer) Sound.play('sfx_hit');
          continue;
        }

        // 真实弹性碰撞与体积物理分离（直接修正重叠坐标，彻底防止相交穿模）
        const overlap = (HITBOX_TILES - dist) / 128;
        const wA = (a.vehicle && a.vehicle.weight) ? a.vehicle.weight : 1;
        const wB = (b.vehicle && b.vehicle.weight) ? b.vehicle.weight : 1;
        const totalW = wA + wB;
        const ratioA = wB / totalW;
        const ratioB = wA / totalW;

        a.position.x -= nx * overlap * ratioA;
        a.position.y -= ny * overlap * ratioA;
        b.position.x += nx * overlap * ratioB;
        b.position.y += ny * overlap * ratioB;

        // 碰撞弹性冲量反弹
        const relSpeed = Math.max(0.04, Math.hypot(a.speedForward, b.speedForward));
        const impulse = 0.022 + relSpeed * 0.22;
        a.collisionMomentum.x -= nx * impulse * ratioA;
        a.collisionMomentum.y -= ny * impulse * ratioA;
        b.collisionMomentum.x += nx * impulse * ratioB;
        b.collisionMomentum.y += ny * impulse * ratioB;

        a.speedForward *= 0.88;
        b.speedForward *= 0.88;

        if (a.isRealPlayer || b.isRealPlayer) {
          const nowCol = GameClock.now();
          if (!this._lastBumpSound || nowCol - this._lastBumpSound > 0.22) {
            Sound.play('sfx_thudpipe');
            this._lastBumpSound = nowCol;
          }
        }
      }
    }

    // 墙物体碰撞（管道/Thwomp压扁）
    // Bug反馈修复：此前用3.5格的巨型判定圈且每帧重复applySmash/addCoin——
    // Thwomp落地期间把角色连续刷新成UNCONTROLLED（旋转卡死）+每帧扣3币+每帧
    // 播thud音效（刺耳噪声）；管道未碰到就隔空扣币。改为真实半径+单次触发。
    const nowW = GameClock.now();
    for (const d of this.drivers) {
      if (d.balloons !== undefined && d.balloons <= 0) continue;   // 对战幽灵免疫
      for (let wi = 0; wi < GameMap.wallObjects.length; wi++) {
        const wo = GameMap.wallObjects[wi];
        const dx = (d.position.x - wo.x) * 128, dy = (d.position.y - wo.y) * 128;
        const d2 = dx * dx + dy * dy;
        if (wo.type <= 1) {
          // Thwomp：砸地(height<=10)且有下落/砸中冷却才判定，半径1.1格
          if (wo.height > 10) continue;
          if (d2 > 1.1 * 1.1) continue;
          if (!d._smashCd) d._smashCd = 0;
          if (nowW < d._smashCd) continue;            // 同一次压扁只结算一次
          d._smashCd = nowW + 1.6;                    // 结算后1.6秒不再被砸
          // 击退：从Thwomp中心向外弹开，避免卡在其正下方反复受击
          const m = Math.hypot(dx, dy) || 1;
          d.vectorialSpeed.x += dx / m * 0.09;
          d.vectorialSpeed.y += dy / m * 0.09;
          d.applySmash();
        } else {
          // 管道：实体碰撞障碍物（像墙壁一样弹性反弹，绝不打转旋转）
          const pipeRadius = 2.2;
          const dist = Math.hypot(dx, dy);
          if (dist > pipeRadius) continue;
          if (d.isImmune()) continue;                 // 星星无敌直接冲破管道免撞
          const nx = dist > 1e-4 ? dx / dist : 1;
          const ny = dist > 1e-4 ? dy / dist : 0;
          // Separación física: expulsar el kart fuera de la tubería de forma sólida
          const overlap = pipeRadius - dist;
          d.position.x += nx * (overlap / 128);
          d.position.y += ny * (overlap / 128);
          // Impulso elástico de rebote sólido contra pared
          d.collisionMomentum.x += nx * 0.09;
          d.collisionMomentum.y += ny * 0.09;
          d.speedForward = Math.min(d.speedForward * 0.2, 0.02);
          d.popState(DS.SPEED_UP);
          d.popState(DS.MORE_SPEED_UP);

          if (!d._pipeCd) d._pipeCd = {};
          if (nowW >= (d._pipeCd[wi] || 0)) {
            d._pipeCd[wi] = nowW + 0.6;
            Sound.play('sfx_thudpipe');
            d.addCoin(-1);
          }
        }
      }
    }

    for (const item of this.items) item.update(dt, this);
    itemCollisions(this);
    for (const fx of this.effects) { fx.t += dt; fx.life -= dt; }
    this.effects = this.effects.filter(f => f.life > 0);

    this.updateRanks();

    if (this.flash > 0) this.flash -= dt;
    if (this.mosaicT > 0) this.mosaicT -= dt;

    // 气球对战结束判定：倒计时归零 / 玩家气球全破 / 只剩一人有气球
    if (this.isBattle && !this.over) {
      this.timeLeft -= dt;
      const alive = this.drivers.filter(d => d.balloons > 0);
      if (this.timeLeft <= 0 || this.player.balloons <= 0 || alive.length <= 1) {
        this.over = true;
        this.endTimer = 2;
        Sound.stopMusic();
        Sound.play(this.player.balloons > 0 ? 'sfx_win' : 'sfx_lose');
      }
    }

    // 玩家完赛：切AI继续开，几秒后进结算
    if (this.over && this.player.controlType === 'player') {
      this.player.controlType = 'ai';
      this.endTimer = 4;
    }
    if (this.over && this.endTimer !== undefined) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) Game.setState(new RaceEndState(this));
    }
  }

  draw(ctx, camDriver, showPlayerKart = true) {
    const modAngle = normAngle(camDriver.posAngle);
    View.drawSky(ctx, modAngle);
    const camPos = {
      x: camDriver.position.x - Math.cos(camDriver.posAngle) * (M7.CAM_2_PLAYER_DST / 1024),
      y: camDriver.position.y - Math.sin(camDriver.posAngle) * (M7.CAM_2_PLAYER_DST / 1024)
    };
    View.drawCircuit(ctx, camPos, camDriver.posAngle, this.mosaicT || 0);
    View.drawSprites(ctx, camDriver, this, showPlayerKart);
    View.drawMinimap(ctx, this);
    if (this.isBattle) Gui.drawBattle(ctx, this);
    else Gui.draw(ctx);
    if (this.flash > 0) {
      ctx.globalAlpha = this.flash;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 512, 448);
      ctx.globalAlpha = 1;
    }
  }
}

/* ---------------- 各状态 ---------------- */
/* 开机节奏（shells-flow.md §6 常量表）：纯黑126f(2.1s) → INIT 40f → 纯黑40f，
 * 满206帧(≈3.43s)才转标题并起菜单音乐（此段原版无logo，全程黑屏填充）。
 * accept跳过：直接把计时推到转场点；_done守卫保证转场/音乐只触发一次 */
class BootState {
  constructor() { this.t = 0; this._done = false; }
  update(dt) {
    this.t += dt;
    if (!this._done && this.t >= 206 / 60) {   // 126f黑A + 40f INIT + 40f黑B
      this._done = true;
      Game.transitionTo(new TitleState());
      Sound.playMusic('music_menu');
    }
  }
  draw(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 512, 448);
  }
  key(k) {
    // Cualquier tecla avanza directamente al título
    this.t = Math.max(this.t, 206 / 60);
  }
}

class TitleState {
  /* 原版首屏（移植start.cpp）：背景横向滚动 + SUPER MARIO KART大logo + 车队巡游
   * 三大纯正街机模式：GP大奖赛 / MatchRace单挑 / Battle气球对战 */
  init() {
    this.idx = 0;
    this.options = ['mario kart gp', 'match race', 'battle'];
    this.modes = ['gp', 'race', 'battle'];
    this.scroll = 0;                 // 背景滚动位置（整图像素）
    this._age = 0;                   // 界面年龄帧：输入门控 + logo脉动节拍
    this.idle = 0;                   // 无输入计时：≥1602帧(26.7s)进attract演示
    // 巡游车队：8辆卡丁车 {x:0~1横向进度, lane:0~1纵向, speed:x每秒位移, spriteIdx}
    this.drivers = CHARACTERS.map((c, i) => ({
      x: i / 8 + Math.random() * 0.08,
      lane: 0.62 + Math.random() * 0.18,
      speed: 0.04 + Math.random() * 0.05,
      spriteIdx: i
    }));
    // 右侧视角精灵预生成一次：minimapFrame(0)=getMinimapSprite(0)
    this.driverFrames = CHARACTERS.map((c, i) => {
      const anim = new Animator(c.file.replace('drivers/', ''));
      if (i === Game.playerChar && typeof FaceDriver !== 'undefined' && FaceDriver.active) {
        FaceDriver.applyToAnimator(anim, i);
      }
      const mf = anim.minimapFrame(0);
      return { img: anim.driving[mf.frame], mirror: mf.mirror };
    });
    // Garantizar que la música de la pantalla de inicio suene siempre
    if (Sound.musicName !== 'music_menu' || !Sound.music) {
      Sound.playMusic('music_menu');
    }
  }
  update(dt) {
    this._age++;
    this.idle++;
    this.scroll += 60 * dt;          // BACKGROUND_PPS=60 像素/秒向左
    for (const d of this.drivers) {
      d.x += d.speed * dt;           // 巡游车队从左往右开
      if (d.x > 1.05) {              // 驶出右边界后回到左侧重新入场
        d.x = -0.05;
        d.lane = 0.62 + Math.random() * 0.18;
        d.speed = 0.04 + Math.random() * 0.05;
      }
    }
    // idle超时进attract演示（原版$1040≥$0642=1602帧≈26.7s）：随机赛道+随机角色、
    // 沿用当前排量，Race.init把玩家车改成AI代驾后由AttractState驱动（见下）
    if (this.idle >= 1602 && !this._attract) {
      this._attract = true;
      Sound.stopMusic();
      Game.mode = 'attract';
      const ids = Object.keys(RACE_TRACKS);
      const trackId = ids[(Math.random() * ids.length) | 0];
      Game.playerChar = (Math.random() * CHARACTERS.length) | 0;
      Game.setState(new RaceLoadingState(trackId, false, true));
    }
  }
  draw(ctx) {
    /* 背景：background.png x∈[246,758]的开屏滚动图（512x224，内容左右无缝可平铺）。
     * off=scroll对512取模，双绘制实现无缝回卷——窗口永不越界滑入结算图区域 */
    const bg = Assets.images.menu_bg;
    if (bg) {
      const off = ((this.scroll % 512) + 512) % 512;
      ctx.drawImage(bg, 246 + off, 16, 512 - off, 224, 0, 0, 512 - off, 448);
      if (off > 0) ctx.drawImage(bg, 246, 16, off, 224, 512 - off, 0, off, 448);
    } else {
      ctx.fillStyle = '#123';
      ctx.fillRect(0, 0, 512, 448);
    }

    /* 巡游车队：从左往右巡游；按lane(y)从小到大排序绘制（远→近）。
     * 尺寸/锚点忠实移植start.cpp：getMinimapSprite(0, scale/1.9)，精灵内部sScale=2，
     * scale=画布高448/背景ROI高224=2 → 边长=32×2×(2/1.9)≈67.4px（原版尺寸）；
     * setOrigin(0,0)顶部锚点；每0.05进度交替下沉0.0025×画布高的行驶颠簸 */
    const KART = 64 / 1.9 * 2;                     // ≈67.4px
    const parade = [...this.drivers].sort((a, b) => a.lane - b.lane);
    for (const d of parade) {
      const f = this.driverFrames[d.spriteIdx];
      if (!f || !f.img) continue;
      const bobY = ((d.x * 20 | 0) % 2 === 0 ? 0.0025 : 0) * 448;  // ≈1.12px
      ctx.save();
      if (f.mirror) {          // 复刻原版scale(-1,1)：绕左缘翻转，占位[p.x-w, p.x]
        ctx.translate(d.x * 512 + KART, d.lane * 448 + bobY);
        ctx.scale(-1, 1);
      } else {
        ctx.translate(d.x * 512, d.lane * 448 + bobY);
      }
      ctx.drawImage(f.img, 0, 0, KART, KART);
      ctx.restore();
    }

    /* 标题logo：同图切片(6,16,234,76)放大2倍=468x152，水平居中、y=52px。
     * 保持不透明稳定绘制；此前每5帧切换 alpha 会造成明显闪烁。 */
    const lg = Assets.images.title_logo;
    if (lg) {
      ctx.drawImage(lg, 6, 16, 234, 76, 256 - 234, 52, 468, 152);
    }

    /* 菜单UI：黑色半透明面板 + 金色边框 + 3大经典模式 */
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(78, 206, 356, 172);
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(78, 206, 356, 172);

    const hints = [
      '4 cups · 20 tracks · grand prix',
      'single race · all 20 tracks',
      'balloon battle · 4 arenas'
    ];
    this.options.forEach((o, i) => {
      const sel = i === this.idx;
      Text.ui(ctx, (sel ? '▶ ' : '') + o.toUpperCase(), 256, 222 + i * 48, 19,
              sel ? '#ffe060' : '#c0c0c0', 'center');
      if (sel) Text.ui(ctx, hints[i], 256, 246 + i * 48, 11, '#8ab4ff', 'center');
    });

    // 提示行
    Text.ui(ctx, this._age > 80 ? '↑↓ SELECT · ENTER CONFIRM · [M] AUDIO' : 'WAIT...',
            256, 396, 13, '#aaaaaa', 'center');
  }
  key(k) {
    this.idle = 0;                     // 任意按键清零attract计时
    if (k === 'm' || k === 'mute') { Sound.toggleMute(); return; }
    if (this._age <= 40) return;       // Breve umbral de entrada inicial
    const len = this.options.length;
    if (k === 'up') { this.idx = (this.idx + len - 1) % len; Sound.play('sfx_menumove'); }
    if (k === 'down') { this.idx = (this.idx + 1) % len; Sound.play('sfx_menumove'); }
    if (k === 'accept') {
      Sound.play('sfx_menuselect');
      Game.mode = this.modes[this.idx];
      Game.gp = null;
      Game.transitionTo(new CCSelectState());
    }
  }
}

/* 排量选择（原版50/100/150cc） */
class CCSelectState {
  init() {
    this.idx = Game.ccIndex || 1;
    this.options = ['50cc', '100cc', '150cc'];
    this.scroll = Math.floor(Math.random()*524);   // 背景滚动位置：每次进入随机起始
  }
  update(dt) { this.scroll += 60 * dt; }           // 背景向左滚动60px/s（同TitleState）
  draw(ctx) {
    /* 背景：menu_bg x∈[246,758]的开屏滚动图（512x224），off取模+双绘制无缝回卷 */
    const img = Assets.img('menu_bg');
    const off = ((this.scroll % 512) + 512) % 512;
    ctx.drawImage(img, 246 + off, 16, 512 - off, 224, 0, 0, 512 - off, 448);
    if (off > 0) ctx.drawImage(img, 246, 16, off, 224, 512 - off, 0, off, 448);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(106, 140, 300, 180);
    Text.ui(ctx, 'SELECT ENGINE CLASS', 256, 70, 22, '#ffe060', 'center');
    this.options.forEach((o, i) => {
      const sel = i === this.idx;
      Text.ui(ctx, (sel ? '▶ ' : '') + o, 256, 168 + i * 40, 24,
              sel ? '#ffe060' : '#c0c0c0', 'center');
    });
    Text.ui(ctx, '↑↓ select · enter confirm · esc back', 256, 396, 13, '#aaaaaa', 'center');
  }
  key(k) {
    if (k === 'up') { this.idx = (this.idx + 2) % 3; Sound.play('sfx_menumove'); }
    if (k === 'down') { this.idx = (this.idx + 1) % 3; Sound.play('sfx_menumove'); }
    if (k === 'accept') {
      Sound.play('sfx_menuselect');
      Game.ccIndex = this.idx;
      Game.transitionTo(new CharacterSelectState());
    }
    if (k === 'back') Game.transitionTo(new TitleState());
  }
}

/* ---------------- 选人界面（原版规则重写，shells-flow.md §4） ----------------
 * 两段式确认状态机 confirm：0浏览 → 1锁定(入场卡丁车动画) → 2定人(64帧settle定格)；
 * 第1段可取消（esc=back 或 键盘Z，对应原版X边沿仅状态1可退回0，$85:9487）。
 * 原版彩蛋「Y按住+A边沿=锁定toggle」（$84:F4E6，Battle禁用）依赖Y键位，
 * JS键位无Y映射，保留注释不实现。 */
class CharacterSelectState {
  init() {
    this.idx = 0;
    this.frame = 0;                    // 帧计数（移植framesSinceOrigin，动画按帧驱动）
    this.confirm = 0;                  // 0浏览 / 1锁定 / 2定人
    this.settle = 0;                   // 定人后定格计数（原版$96计满$40=64帧才转场）
    this._enterT = 0;                  // 选中卡丁车入场动画进度 0→1
    this._acc1 = 0;                    // 跑马灯滚动累加器（原版$60+=$00B0≈41px/s）
    this.angles = new Array(8).fill(0); // 每格卡丁车当前旋转角
    Sound.playMusic('music_playerselect');
  }
  update(dt) {
    this.frame++;
    this._acc1 = (this._acc1 + 41 * dt) % 256;   // 跑马灯恒速滚动（NMI侧语义，settle期也走）
    if (this.confirm === 2) {
      // 定格期：忽略输入、冻结角度/浮动动画，settle每帧-1归零后转场（原版$85:965B）
      this.settle--;
      if (this.settle <= 0 && !this._leaving) {
        this._leaving = true;
        Game.transitionTo(Game.mode === 'battle' ? new BattleSelectState()
                        : Game.mode === 'gp' ? new CupSelectState()
                        : new TrackSelectState());
      }
      return;
    }
    if (this.confirm === 1) {
      // 锁定态：光标冻结，选中卡丁车播入场动画（约40帧滑入）
      this._enterT = Math.min(1, this._enterT + dt * 1.5);
      // 取消回浏览态：esc(back)或键盘Z（原始键检测；Z会派生brake/down动作需吞掉防串扰）
      if (Input.pressed('back') || Input.rawPressed('z')) {
        this.confirm = 0;
        Sound.play('sfx_menumove');
        Input.pressedSet.delete('back');
        Input.pressedSet.delete('down');
        Input.pressedSet.delete('brake');
      } else if (Input.pressed('accept')) {
        // 第2按accept正式定人（confirm 1→2），启动64帧settle计数
        this.confirm = 2;
        this.settle = 64;
        Game.playerChar = this.idx;
      }
      return;
    }
    // 浏览态角度动画：选中的以2.5/s转向π/2（侧面视角），未选中的以4.5/s转回0
    for (let i = 0; i < 8; i++) {
      if (i === this.idx) this.angles[i] = Math.min(Math.PI / 2, this.angles[i] + 2.5 * dt);
      else this.angles[i] = Math.max(0, this.angles[i] - 4.5 * dt);
    }
  }
  /* 忠实移植 playerselection.cpp::draw 的精确布局（Bug3修复） */
  draw(ctx) {
    const bg = Assets.img('player_selection');
    const frames = this.frame;
    // ---- 每格：格子底板 + 卡丁车精灵 ----
    for (let i = 0; i < 8; i++) {
      const col = i % 4, row = (i / 4) | 0;
      // 格子origin归一化坐标（BACKGROUND_WIDTH=256, BACKGROUND_HEIGHT=224）
      const orgX = (37 + col * 48), orgY = (64 + row * 64);   // 256x224像素坐标
      // 格子底板 tile(281,146,38,35)：左上角锚点 origin+(0,14)，尺寸38×35×scale(=2)
      if (bg) ctx.drawImage(bg, 281, 146, 38, 35,
        orgX * 2, (orgY + 14) * 2, 38 * 2, 35 * 2);
      // 卡丁车精灵64px：中心底部锚点 origin+(19/256,49/224)
      // （C++ sprite.setOrigin(width/2,height)，getMinimapSprite内部+π/2后查表）
      const anim = this._anims || (this._anims = CHARACTERS.map((c, ci) => {
        const a = new Animator(c.file.replace('drivers/', ''));
        if (typeof FaceDriver !== 'undefined' && FaceDriver.active && (ci === this.idx || ci === Game.playerChar)) {
          FaceDriver.applyToAnimator(a, ci);
        }
        return a;
      }));
      const vf = anim[i].minimapFrame(this.angles[i]);   // 与C++ getMinimapSprite 同语义
      const kart = anim[i].driving[vf.frame];
      const px = (orgX + 19) * 2, py = (orgY + 49) * 2;
      // 上下浮动：(frames/10)%3==(5*i)%3 且浏览态非选中 → 上移1×scale(=2px)；定格期冻结
      const bob = (this.confirm === 0 &&
        (((frames / 10) | 0) % 3 === (5 * i) % 3 && i !== this.idx)) ? -2 : 0;
      // 入场动画：锁定/定人格的卡丁车从格子底部滑入站位，y偏移(1-_enterT)*40
      const enterOff = (i === this.idx && this.confirm >= 1) ? (1 - this._enterT) * 40 : 0;
      ctx.save();
      ctx.translate(px, py + bob + enterOff);
      if (vf.mirror) ctx.scale(-1, 1);
      ctx.drawImage(kart, -32, -64, 64, 64);
      ctx.restore();
    }
    // ---- 滚动横幅 slice(272,24,256,16)，ABS锚点(80/256,24/224)=(160,48)起512×32 ----
    // 跑马灯速度改累加器驱动：上条41px/s（原版$60+=$00B0 8.8定点≈0.69px/帧；
    // 素材仅此一条条带，下条71px/s无对应切片故不实现）
    if (bg) {
      ctx.drawImage(bg, 272, 24, 256, 16,
        160 + (80 - this._acc1) * 2, 48, 512, 32);
    }
    // ---- 带孔边框背景最后绘制盖全场 ----
    if (bg) ctx.drawImage(bg, 0, 0, 256, 224, 0, 0, 512, 448);
    // ---- 1P标记 (352,57,16,8)：origin+(11/256,0)，6帧/拍闪烁（原版$98节拍++到6归零） ----
    if ((frames % 12) < 6) {
      const col = this.idx % 4, row = (this.idx / 4) | 0;
      if (bg) ctx.drawImage(bg, 352, 57, 16, 8,
        (37 + col * 48 + 11) * 2, (64 + row * 64) * 2, 32, 16);
    }
    // 角色名+提示（高清晰系统字体）
    const hasCustom = typeof FaceDriver !== 'undefined' && FaceDriver.active;
    const isCustom = hasCustom && (this.idx === FaceDriver.charIdx || this.idx === Game.playerChar);
    const dName = isCustom ? FaceDriver.pilotName : CHARACTERS[this.idx].name.toUpperCase();
    Text.ui(ctx, dName, 256, 376, 20, isCustom ? '#50ff50' : '#ffe060', 'center');
    if (isCustom) {
      Text.ui(ctx, '📸 CARA PERSONALIZADA (SELFIE ACTIVA)', 256, 400, 12, '#50ff50', 'center');
    }
    Text.ui(ctx, 'flechas elegir · enter confirmar · [F] selfie · esc/z cancelar',
            256, 428, 11, '#aaaaaa', 'center');
  }
  key(k) {
    if (this.confirm === 2) return;    // 已定格：忽略一切输入
    if (this.confirm === 1) return;    // 锁定态输入统一在update()里做边沿检测（含键盘Z）
    if (Input.rawPressed('f')) {
      if (typeof SelfieSetup !== 'undefined') {
        SelfieSetup.open(() => { this._anims = null; });
        return;
      }
    }
    // 浏览态：网格移动（现有逻辑）
    const col = this.idx % 4, row = (this.idx / 4) | 0;
    const prevIdx = this.idx;
    if (k === 'left') { this.idx = row * 4 + (col + 3) % 4; Sound.play('sfx_menumove'); }
    else if (k === 'right') { this.idx = row * 4 + (col + 1) % 4; Sound.play('sfx_menumove'); }
    else if (k === 'up' || k === 'down') { this.idx = ((row + 1) % 2) * 4 + col; Sound.play('sfx_menumove'); }
    else if (k === 'accept') {
      // 第1按：锁人 + sfx + 启动卡丁车入场动画（confirm 0→1）
      this.confirm = 1;
      this._enterT = 0;
      Sound.play('sfx_menuselect');
    } else if (k === 'back') Game.transitionTo(new CCSelectState());
  }
}

/* ---------------- 杯赛选择（GP） ---------------- */
class CupSelectState {
  init() { this.idx = 0; }
  update(dt) {}
  draw(ctx) {
    ctx.fillStyle = '#101028';
    ctx.fillRect(0, 0, 512, 448);
    Text.ui(ctx, 'SELECT CUP', 256, 36, 26, '#ffe060', 'center');
    CUPS.forEach((cup, i) => {
      const sel = i === this.idx;
      const y = 92 + i * 62;
      Text.ui(ctx, (sel ? '> ' : '') + cup.name.toUpperCase(), 256, y, 22,
              sel ? cup.color : '#909098', 'center');
      if (sel)
        Text.ui(ctx, cup.tracks.map(t => RACE_TRACKS[t].name).join('  ·  '),
                256, y + 28, 11, '#8ab4ff', 'center');
    });
    Text.ui(ctx, 'up/down select · enter start · esc back', 256, 408, 13, '#aaaaaa', 'center');
  }
  key(k) {
    if (k === 'up') { this.idx = (this.idx + 3) % 4; Sound.play('sfx_menumove'); }
    if (k === 'down') { this.idx = (this.idx + 1) % 4; Sound.play('sfx_menumove'); }
    if (k === 'accept') {
      Sound.play('sfx_menuselect');
      Sound.stopMusic();
      Game.gp = { cupIdx: this.idx, raceIdx: 0, points: new Array(8).fill(0), gains: null };
      Game.transitionTo(new RaceLoadingState(CUPS[this.idx].tracks[0]));
    }
    if (k === 'back') Game.transitionTo(new CharacterSelectState());
  }
}

/* ---------------- 单挑赛道选择（20条按杯分组） ---------------- */
class TrackSelectState {
  init() { this.cupIdx = 0; this.itemIdx = 0; }
  get trackId() { return CUPS[this.cupIdx].tracks[this.itemIdx]; }
  update(dt) {}
  draw(ctx) {
    ctx.fillStyle = '#101028';
    ctx.fillRect(0, 0, 512, 448);
    Text.ui(ctx, 'SELECT TRACK', 256, 30, 24, '#ffe060', 'center');
    CUPS.forEach((cup, ci) => {
      const groupSel = ci === this.cupIdx;
      const bx = 26 + ci * 122;
      ctx.fillStyle = groupSel ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.03)';
      ctx.fillRect(bx, 74, 114, 300);
      Text.ui(ctx, cup.name.toUpperCase(), bx + 57, 82, 12,
              groupSel ? cup.color : '#70707a', 'center');
      cup.tracks.forEach((tid, ti) => {
        const sel = groupSel && ti === this.itemIdx;
        Text.ui(ctx, (sel ? '>' : '') + RACE_TRACKS[tid].name, bx + 10, 108 + ti * 50, 13,
                sel ? '#ffe060' : (groupSel ? '#d0d0d8' : '#606068'));
      });
    });
    const cur = RACE_TRACKS[this.trackId];
    Text.ui(ctx, 'theme: ' + cur.theme + ' · generated',
            256, 392, 12, '#8ab4ff', 'center');
    Text.ui(ctx, 'left/right switch cup · up/down select · enter race · esc back', 256, 416, 12, '#aaaaaa', 'center');
  }
  key(k) {
    if (k === 'left') { this.cupIdx = (this.cupIdx + 3) % 4; this.itemIdx = Math.min(this.itemIdx, 4); Sound.play('sfx_menumove'); }
    if (k === 'right') { this.cupIdx = (this.cupIdx + 1) % 4; this.itemIdx = Math.min(this.itemIdx, 4); Sound.play('sfx_menumove'); }
    if (k === 'up') { this.itemIdx = (this.itemIdx + 4) % 5; Sound.play('sfx_menumove'); }
    if (k === 'down') { this.itemIdx = (this.itemIdx + 1) % 5; Sound.play('sfx_menumove'); }
    if (k === 'accept') {
      Sound.play('sfx_menuselect');
      Sound.stopMusic();
      Game.transitionTo(new RaceLoadingState(this.trackId));
    }
    if (k === 'back') Game.transitionTo(new CharacterSelectState());
  }
}

/* ---------------- 对战场地选择 ---------------- */
class BattleSelectState {
  init() { this.idx = 0; }
  update(dt) {}
  drawMiniArena(ctx, bid, x, y, sel) {
    const def = TRACKGEN_BATTLES[bid];
    let ax0 = 128, ay0 = 128, ax1 = 0, ay1 = 0;
    for (const r of def.arena) { ax0 = Math.min(ax0, r[0]); ay0 = Math.min(ay0, r[1]); ax1 = Math.max(ax1, r[0] + r[2]); ay1 = Math.max(ay1, r[1] + r[3]); }
    const sc = 1.6;
    const sx = x + 100 - (ax1 - ax0) * sc / 2, sy = y + 46 - (ay1 - ay0) * sc / 2;
    ctx.fillStyle = sel ? '#5a5a78' : '#33334a';
    ctx.fillRect(sx, sy, (ax1 - ax0) * sc, (ay1 - ay0) * sc);
    ctx.fillStyle = '#8888a8';
    for (const w of def.walls) ctx.fillRect(sx + w[0] * sc, sy + w[1] * sc, w[2] * sc, w[3] * sc);
  }
  draw(ctx) {
    ctx.fillStyle = '#14141c';
    ctx.fillRect(0, 0, 512, 448);
    Text.ui(ctx, 'BALLOON BATTLE', 256, 34, 26, '#ff7050', 'center');
    Text.ui(ctx, '3 balloons each · pop rivals to win · 180s limit', 256, 68, 13, '#8ab4ff', 'center');
    BATTLE_COURSE_IDS.forEach((bid, i) => {
      const sel = i === this.idx;
      const x = 40 + (i % 2) * 220, y = 100 + ((i / 2) | 0) * 150;
      ctx.fillStyle = sel ? 'rgba(255,112,80,0.18)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(x, y, 200, 140);
      ctx.strokeStyle = sel ? '#ff7050' : '#3c3c50';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, 200, 140);
      this.drawMiniArena(ctx, bid, x, y + 10, sel);
      Text.ui(ctx, bid.replace('_', ' ').toUpperCase(), x + 100, y + 106, 14,
              sel ? '#ffe060' : '#b0b0b8', 'center');
    });
    Text.ui(ctx, 'arrows select · enter battle · esc back', 256, 408, 13, '#aaaaaa', 'center');
  }
  key(k) {
    if (k === 'up' || k === 'left') { this.idx = (this.idx + 2) % 4; Sound.play('sfx_menumove'); }
    if (k === 'down' || k === 'right') { this.idx = (this.idx + 1) % 4; Sound.play('sfx_menumove'); }
    if (k === 'accept') {
      Sound.play('sfx_menuselect');
      Sound.stopMusic();
      Game.transitionTo(new RaceLoadingState(BATTLE_COURSE_IDS[this.idx], true));
    }
    if (k === 'back') Game.transitionTo(new CharacterSelectState());
  }
}

class RaceLoadingState {
  /* attract=true：载入完成后进AttractState演示而非RaceStartState开场 */
  constructor(trackId, battle = false, attract = false) {
    this.race = new Race(trackId, Game.ccIndex, Game.playerChar, { battle, attract });
  }
  init() {
    this.error = null;
    this.race.init().then(() => {
      if (this.race.attract) Game.setState(new AttractState(this.race));
      else Game.setState(new RaceStartState(this.race));
    }).catch(e => {
      // 错误可视化：不再无声弹回选择界面
      this.error = (e && e.message) ? e.message : String(e);
      console.error('[RaceLoading]', e);
    });
  }
  update(dt) { if (this.error && (this._et = (this._et || 0) + dt) > 8)
    Game.transitionTo(Game.mode === 'battle' ? new BattleSelectState() :
                  Game.mode === 'gp' ? new CupSelectState() :
                  Game.mode === 'attract' ? new TitleState() : new TrackSelectState()); }
  draw(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 512, 448);
    if (this.error) {
      Text.ui(ctx, 'LOAD FAILED', 256, 150, 26, '#ff5050', 'center');
      Text.ui(ctx, this.error.slice(0, 60), 256, 200, 13, '#ffaaaa', 'center');
      Text.ui(ctx, 'press enter to back', 256, 260, 12, '#aaaaaa', 'center');
      return;
    }
    Text.ui(ctx, 'LOADING...', 256, 212, 22, '#ffffff', 'center');
  }
  key(k) { if (this.error && k === 'accept')
    Game.transitionTo(Game.mode === 'battle' ? new BattleSelectState() :
                  Game.mode === 'gp' ? new CupSelectState() :
                  Game.mode === 'attract' ? new TitleState() : new TrackSelectState()); }
}

/* ---------------- attract演示（标题idle≥1602帧自动进入） ----------------
 * 复用整条比赛管线但跳过开场镜头/红绿灯：Race.init已把玩家车改为AI代驾，
 * 这里用空输入驱动全场。任意按键或20秒后经Fader淡出回标题（原版demo中START回标题） */
class AttractState {
  constructor(race) { this.race = race; this.t = 0; this._exit = false; }
  init() { Sound.playMusic('music_circuit'); }
  update(dt) {
    this.t += dt;
    this.race.update(dt, {});              // 全AI阵容：空输入即可
    // 20秒到点或比赛意外完结都退场，避免滑进结算界面
    if (this.t > 20 || this.race.over) this._exit = true;
    if (this._exit && !this._leaving) {
      this._leaving = true;
      Sound.stopMusic();
      Game.transitionTo(new TitleState());
    }
  }
  draw(ctx) {
    this.race.draw(ctx, this.race.player);
    if (((this.t * 10) | 0) % 2)           // 约5Hz闪烁DEMO PLAY角标
      Text.ui(ctx, 'DEMO PLAY', 256, 56, 20, '#ffe060', 'center');
  }
  key() { this._exit = true; }             // 任意按键退出demo回标题
}

/* Lake佬开场动画 + 红绿灯起步（移植 racestart.cpp） */
class RaceStartState {
  constructor(race) {
    this.race = race;
    this.t = 0;
    this.accTime = 0;
    this.phase = race.isBattle ? 'lights' : 'anim';   // 对战跳过镜头飞行
    this.lightTimer = 0;
    this.started = false;
  }
  init() {
    if (!this.race.isBattle) Sound.playMusic('music_opening');
    Sound.startEngine();
  }
  pseudoUpdate(dt) {
    // 开场镜头飞行——Bug反馈修复：原版硬编码坐标只适配少数赛道，
    // 生成赛道的发车区在别处导致预览时角色看起来悬空/错位。
    // 改为锚定实际发车位置p8的相对路径：环绕→侧扫→降落到位。
    const pp = this.pseudo;
    const t = this.t;
    if (!this._anchor) {
      const gp = GameMap.getPlayerInitialPosition(8);
      this._anchor = { x: gp.x, y: gp.y };
    }
    const A = this._anchor;
    if (t < 2.5) {
      // 高空环绕发车区
      const d = t / 2.5, ang = Math.PI * (0.9 - 0.8 * d);
      pp.position = {
        x: A.x + 0.28 * Math.cos(ang),
        y: A.y + 0.30 + 0.22 * Math.sin(ang)
      };
      pp.posAngle = ang + Math.PI / 2;
    } else if (t < 5) {
      // 侧面横扫（从终点线上方掠过排队车阵）
      const d = (t - 2.5) / 2.5;
      pp.position = {
        x: A.x + 0.45 * (1 - d),
        y: A.y + 0.16 + 0.10 * (1 - d)
      };
      pp.posAngle = Math.PI * 0.75 * (1 - d);
    } else if (t < 8.75) {
      // 对准车道中轴，从正前方向后降落
      const d = (t - 5) / 3.75;
      pp.position = {
        x: A.x + (this._ax !== undefined ? 0 : 0),
        y: A.y - 0.34 * (1 - d)
      };
      pp.posAngle = -Math.PI / 2;
    } else {
      // 到位：贴住玩家格，转正朝上
      pp.position = { x: A.x, y: A.y };
      pp.posAngle = -Math.PI / 2;
      if (t < 10) {
        const d = (t - 8.75) / 1.25;
        pp.posAngle = -Math.PI / 2 + Math.sin(d * Math.PI) * 0.6 * (1 - d);
      }
    }
    // pseudoPlayer加速（玩家按住油门才积累）
    const v = pp.vehicle;
    let acc = 0;
    if (Input.down('accel')) acc = simulateSpeedGraph(pp, acc);
    else acc += FRICTION * 6;
    pp.speedForward = Math.max(0, Math.min(pp.speedForward + acc * dt, v.maxSpeedUpLinearSpeed));
  }  update(dt) {
    this.t += dt;
    if (this.phase === 'anim') {
      if (!this.pseudo) {
        const d = new Driver(1, 'none', this.ccSafe(), false);
        d.vehicle = makeVehicle(0.15, 0.13, 0.10175, 1.0, false, CC_MULT[Game.ccIndex]);
        this.pseudo = d;
      }
      this.pseudoUpdate(dt);
      if (this.t >= 10 || Input.pressed('accept')) {
        this.phase = 'lights';
        this.lightTimer = 0;
        try { Sound.stopMusic(); Sound.play('sfx_racestart'); } catch (e) { console.error(e); }
      }
    } else if (this.phase === 'lights') {
      this.lightTimer += dt;
      // 每亮一盏灯播放提示音，帮助玩家把握火箭起步节奏
      const li2 = clamp(Math.floor(this.lightTimer / 0.85), 0, 2);
      if (li2 !== (this._lastLi || 0)) { this._lastLi = li2; Sound.play('sfx_menumove'); }
      // Bug7：红灯期按住油门累计accTime（松开清零，移植racestart.cpp）
      if (Input.down('accel')) this.accTime += dt;
      else this.accTime = 0;
      // 红灯延长到2.6秒（原版约2秒+Lake佬举牌时间），给玩家反应窗口
      // 兜底：本阶段任何异常都不允许卡死——强制进入比赛
      try {
      if (this.lightTimer >= 2.6 && !this.started) {
        this.started = true;
        Sound.play('sfx_goal');   // 起步GO音
        const p = this.race.player;
        // Bug反馈修复：起步平衡。此前AI直接给75~100%极速而玩家从0起步，
        // 第一弯就被甩开；火箭判定窗(1.5s)又比红灯(2.6s)短，全程按住必熄火。
        if (this.accTime >= 2.35) {
          p.applyHit();                                 // 全程死按油门：过热熄火
        } else if (this.accTime > 0.05) {
          p.speedForward = Math.max(this.pseudo.speedForward,
            p.vehicle.maxNormalLinearSpeed * 0.55);     // 火箭起步
          Sound.play('sfx_boost');
        } else {
          // 未按油门：也给基线速度，不再0速慢吞吞追不上
          p.speedForward = p.vehicle.maxNormalLinearSpeed * 0.45;
        }
        for (const d of this.race.drivers) {
          if (d === p) continue;
          const sp = (30 + Math.random() * 20) / 100;   // AI起步30~50%，低于玩家基线45%
          d.speedForward = sp * d.vehicle.maxNormalLinearSpeed;
          d.speedTurn = (Math.random() * 0.15) * d.vehicle.maxTurningAngularSpeed;
        }
        if (this.race.isBattle) {
          Sound.playMusic('music_playerselect');
          Game.setState(new BattleState(this.race));
        } else {
          Sound.playMusic('music_circuit');
          Game.setState(new RaceState(this.race));
        }
      }
      } catch (e) {
        // 兜底：红绿灯阶段异常不允许卡死，强制进入比赛
        console.error('[lights]', e);
        this.started = true;
        if (this.race.isBattle) { Sound.playMusic('music_playerselect'); Game.setState(new BattleState(this.race)); }
        else { Sound.playMusic('music_circuit'); Game.setState(new RaceState(this.race)); }
      }
    }
  }
  ccSafe() { return Game.ccIndex; }
  draw(ctx) {
    const cam = this.phase === 'anim' ? this.pseudo : this.race.player;
    // Bug6修复：开场镜头阶段不画屏幕中央固定的玩家卡丁车
    // （对应C++ racestart.cpp::draw 只画 getDriverDrawables，不调 player->getDrawables）
    this.race.draw(ctx, cam, this.phase !== 'anim');
    if (this.phase === 'anim' && this.t < 10) {
      const fade = clamp(1 - (this.t - 8) / 2, 0, 1);
      ctx.globalAlpha = fade;
      Text.ui(ctx, this.race.circuit.name.toUpperCase(), 26, 176, 20, '#ffe060');
      Text.ui(ctx, 'enter to skip >>', 26, 202, 12, '#aaaaaa');
      ctx.globalAlpha = 1;
    }
    if (this.phase === 'lights') {
      // Lake佬红绿灯（原版贴图），2.6秒分三盏，每盏约0.85秒
      const li = this.started ? 2 : clamp(Math.floor(this.lightTimer / 0.85), 0, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(206, 54, 100, 84);
      ctx.drawImage(Gui.lakituLights[li], 216, 58, 80, 64);
      if (this.started)
        Text.ui(ctx, 'GO!', 256, 128, 26, '#40ff50', 'center');
      if (Input.down('accel'))
        Text.ui(ctx, this.accTime < 2.35 ? 'BOOST!' : 'TOO LONG!',
                256, 162, 16, this.accTime < 2.35 ? '#40ff50' : '#ff5050', 'center');
      Text.ui(ctx, 'hold accel for rocket start · release before GO to avoid blowout',
              256, 196, 11, '#c8c8c8', 'center');
    }
  }
  key() {}
}

class RaceState {
  constructor(race) { this.race = race; }
  init() {}
  update(dt) {
    const p = this.race.player;
    const input = {
      accel: Input.down('accel'), brake: Input.down('brake'),
      left: Input.down('left'), right: Input.down('right'),
      drift: Input.down('drift')
    };
    if (Input.pressed('drift') && p.canDrive()) p.shortJump();
    const canUseItem = p.canDrive() && p.powerUp !== PowerUp.NONE && !Gui.roulette.active && GameClock.now() >= p.canUseItemAt;
    const isThrowBack = Input.down('brake') || Input.down('down');
    if ((Input.pressed('item') || Input.pressed('itemfront') || Input.pressed('itemback')) && canUseItem) {
      useItem(p, this.race, !isThrowBack);
    }
    this.race.update(dt, input);
    Sound.updateEngine(clamp(p.speedForward / p.vehicle.maxNormalLinearSpeed, 0, 2));
  }
  draw(ctx) {
    this.race.draw(ctx, this.race.player);
  }
  key(k) {
    if (k === 'm' || k === 'mute') { Sound.toggleMute(); return; }
    if (k === 'r' || k === 'restart') {
      Sound.stopEngine();
      Sound.stopMusic();
      Game.transitionTo(new RaceLoadingState(this.race.trackId, this.race.isBattle));
      return;
    }
    if (k === 'back') Game.setState(new PauseState(this.race));
  }
}

class PauseState {
  constructor(race) { this.race = race; }
  update(dt) {}
  draw(ctx) {
    this.race.draw(ctx, this.race.player);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, 512, 448);
    Text.ui(ctx, 'PAUSE', 256, 180, 34, '#ffe060', 'center');
    Text.ui(ctx, 'esc: resume · r: restart · m: audio', 256, 244, 14, '#cccccc', 'center');
    Text.ui(ctx, 'enter: quit race', 256, 268, 14, '#cccccc', 'center');
  }
  key(k) {
    if (k === 'm' || k === 'mute') { Sound.toggleMute(); return; }
    if (k === 'r' || k === 'restart') {
      Sound.stopEngine();
      Sound.stopMusic();
      Game.transitionTo(new RaceLoadingState(this.race.trackId, this.race.isBattle));
      return;
    }
    if (k === 'back') Game.setState(new RaceState(this.race));
    if (k === 'accept') {
      Sound.stopEngine();
      Sound.stopMusic();
      if (this.race.isBattle) Game.transitionTo(new BattleSelectState());
      else if (Game.mode === 'gp') Game.transitionTo(new CupSelectState());
      else Game.transitionTo(new TrackSelectState());
    }
  }
}

class RaceEndState {
  constructor(race) {
    this.race = race; this.t = 0;
    // GP模式：按本场排名结算积分（9/6/3/1/0...）
    this.gains = null;
    if (Game.gp && !race.isBattle) {
      this.gains = race.ranking.map(d => GP_POINTS[d.rank] || 0);
      race.ranking.forEach((d, i) => { Game.gp.points[d.charIdx] += this.gains[i]; });
      Game.gp.gains = this.gains;
      Game.gp.lastRanking = race.ranking.map(d => d.charIdx);
    }
  }
  init() { Sound.stopEngine(); }
  update(dt) { this.t += dt; }
  draw(ctx) {
    this.race.draw(ctx, this.race.player);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(64, 60, 384, 330);
    Text.ui(ctx, 'FINISH!', 256, 76, 30, '#ffe060', 'center');
    const ranks = ['1st','2nd','3rd','4th','5th','6th','7th','8th'];
    this.race.ranking.forEach((d, i) => {
      const y = 130 + i * 28;
      const me = d.isRealPlayer;
      Text.ui(ctx, ranks[i], 116, y, 14, me ? '#ffe060' : '#ffffff');
      const pName = (me && typeof FaceDriver !== 'undefined' && FaceDriver.active)
        ? FaceDriver.pilotName : (me ? 'YOU' : d.char.name.toUpperCase());
      Text.ui(ctx, pName, 180, y, 14, me ? '#ffe060' : '#bbbbbb');
      Text.ui(ctx, fmtT(d.finishTime || this.race.time), 340, y, 14, '#9ad0ff', 'right');
      if (this.gains && this.gains[i] > 0)
        Text.ui(ctx, '+' + this.gains[i] + 'pts', 452, y, 14, '#ffe060', 'right');
    });
    if (this.t > 1.5)
      Text.ui(ctx, 'enter: continue', 256, 372, 13, '#aaaaaa', 'center');
  }
  key(k) {
    if (k === 'accept' && this.t > 1.5) {
      if (Game.gp && Game.gp.points) Game.transitionTo(new GPStandingsState(this.race));
      else Game.transitionTo(new TrackSelectState());
    }
  }
}


/* ---------------- GP积分榜（每场之间） ---------------- */
class GPStandingsState {
  constructor(race) {
    this.race = race;
    this.gp = Game.gp;
  }
  init() { Sound.stopEngine(); }
  update(dt) { this.t = (this.t || 0) + dt; }
  draw(ctx) {
    ctx.fillStyle = '#101028';
    ctx.fillRect(0, 0, 512, 448);
    const cup = CUPS[this.gp.cupIdx];
    Text.ui(ctx, cup.name.toUpperCase() + '  ·  RACE ' + (this.gp.raceIdx) + '/5',
            256, 40, 22, cup.color, 'center');
    Text.ui(ctx, 'next: ' + RACE_TRACKS[cup.tracks[this.gp.raceIdx]].name,
            256, 76, 14, '#8ab4ff', 'center');
    // 按累计分排序
    const order = [...this.race.drivers].sort((a, b) =>
      this.gp.points[b.charIdx] - this.gp.points[a.charIdx]);
    order.forEach((d, i) => {
      const y = 116 + i * 30;
      const me = d.isRealPlayer;
      Text.ui(ctx, (i + 1) + '.', 90, y, 15, me ? '#ffe060' : '#c8c8c8');
      const pName = (me && typeof FaceDriver !== 'undefined' && FaceDriver.active)
        ? (FaceDriver.pilotName + ' (' + d.char.name + ')').toUpperCase()
        : (me ? 'YOU (' + d.char.name + ')' : d.char.name).toUpperCase();
      Text.ui(ctx, pName, 130, y, 15, me ? '#ffe060' : '#e8e8ee');
      Text.ui(ctx, String(this.gp.points[d.charIdx]) + ' pts', 420, y, 15, '#9ad0ff', 'right');
    });
    Text.ui(ctx, 'enter: next race', 256, 400, 13, '#aaaaaa', 'center');
  }
  key(k) {
    if (k !== 'accept') return;
    Sound.play('sfx_menuselect');
    const cup = CUPS[this.gp.cupIdx];
    if (this.gp.raceIdx < 4) {
      this.gp.raceIdx++;
      Game.transitionTo(new RaceLoadingState(cup.tracks[this.gp.raceIdx]));
    } else {
      Game.transitionTo(new CupTrophyState());
    }
  }
}

/* ---------------- 杯终奖杯结算 ---------------- */
class CupTrophyState {
  init() { Sound.stopEngine(); this.t = 0; }
  update(dt) { this.t += dt; }
  draw(ctx) {
    ctx.fillStyle = '#101028';
    ctx.fillRect(0, 0, 512, 448);
    const gp = Game.gp;
    const cup = CUPS[gp.cupIdx];
    const order = [...this._drivers()].sort((a, b) =>
      gp.points[b.charIdx] - gp.points[a.charIdx]);
    const myPlace = order.findIndex(d => d.isRealPlayer);
    const trophy = ['GOLD TROPHY', 'SILVER TROPHY', 'BRONZE TROPHY', '4TH PLACE'][Math.min(3, Math.max(0, myPlace))];
    const tcol = ['#ffd700', '#c0c0c8', '#cd7f32', '#9898a8'][Math.min(3, Math.max(0, myPlace))];
    Text.ui(ctx, cup.name.toUpperCase() + ' RESULT', 256, 56, 24, cup.color, 'center');
    Text.ui(ctx, trophy, 256, 96, 26, tcol, 'center');
    if (myPlace <= 2 && typeof FaceDriver !== 'undefined' && FaceDriver.active && FaceDriver.podiumFace) {
      ctx.drawImage(FaceDriver.podiumFace, 256 - 24, 118, 48, 48);
    }
    order.forEach((d, i) => {
      const y = (myPlace <= 2 && typeof FaceDriver !== 'undefined' && FaceDriver.active ? 180 : 160) + i * 28;
      const me = d.isRealPlayer;
      Text.ui(ctx, (i + 1) + '.', 110, y, 15, me ? '#ffe060' : '#c8c8c8');
      const pName = (me && typeof FaceDriver !== 'undefined' && FaceDriver.active)
        ? (FaceDriver.pilotName + ' (' + d.char.name + ')').toUpperCase()
        : (me ? 'YOU (' + d.char.name + ')' : d.char.name).toUpperCase();
      Text.ui(ctx, pName, 150, y, 15, me ? '#ffe060' : '#e8e8ee');
      Text.ui(ctx, String(gp.points[d.charIdx]) + ' pts', 410, y, 15, '#9ad0ff', 'right');
    });
    if (this.t > 1)
      Text.ui(ctx, 'enter: back to cups', 256, 412, 13, '#aaaaaa', 'center');
  }
  _drivers() { return this._cached || (this._cached = CHARACTERS.map((c, i) => ({ charIdx: i, char: c, name: c.name, balloons: 3, hitsDealt: 0, isRealPlayer: i === Game.playerChar }))); }
  key(k) {
    if (k === 'accept' && this.t > 1) {
      Game.gp = null;
      Sound.stopMusic();
      Game.transitionTo(new CupSelectState());
    }
  }
}

/* ---------------- 气球对战进行中 ---------------- */
class BattleState {
  constructor(race) { this.race = race; }
  init() {}
  update(dt) {
    const p = this.race.player;
    const input = {
      accel: Input.down('accel'), brake: Input.down('brake'),
      left: Input.down('left'), right: Input.down('right'),
      drift: Input.down('drift')
    };
    if (Input.pressed('drift') && p.canDrive()) p.shortJump();
    const canUseItem = p.canDrive() && p.powerUp !== PowerUp.NONE && !Gui.roulette.active && GameClock.now() >= p.canUseItemAt;
    const isThrowBack = Input.down('brake') || Input.down('down');
    if ((Input.pressed('item') || Input.pressed('itemfront') || Input.pressed('itemback')) && canUseItem) {
      useItem(p, this.race, !isThrowBack);
    }
    this.race.update(dt, input);
    Sound.updateEngine(clamp(p.speedForward / p.vehicle.maxNormalLinearSpeed, 0, 2));
    if (this.race.over) Game.setState(new BattleEndState(this.race));
  }
  draw(ctx) { this.race.draw(ctx, this.race.player); }
  key(k) {
    if (k === 'm' || k === 'mute') { Sound.toggleMute(); return; }
    if (k === 'r' || k === 'restart') {
      Sound.stopEngine();
      Sound.stopMusic();
      Game.transitionTo(new RaceLoadingState(this.race.trackId, this.race.isBattle));
      return;
    }
    if (k === 'back') Game.setState(new PauseState(this.race));
  }
}

/* ---------------- 对战结算 ---------------- */
class BattleEndState {
  constructor(race) { this.race = race; }
  init() { Sound.stopEngine(); this.t = 0; }
  update(dt) { this.t += dt; }
  draw(ctx) {
    this.race.draw(ctx, this.race.player);
    ctx.fillStyle = 'rgba(0,0,0,0.68)';
    ctx.fillRect(64, 60, 384, 330);
    const win = this.race.player.balloons > 0;
    Text.ui(ctx, win ? 'YOU WIN!' : 'GAME OVER', 256, 78, 30,
            win ? '#ffd700' : '#ff5050', 'center');
    const order = [...this.race.drivers].sort((a, b) =>
      b.balloons - a.balloons || b.hitsDealt - a.hitsDealt);
    order.forEach((d, i) => {
      const y = 132 + i * 28;
      const me = d.isRealPlayer;
      const dead = d.balloons <= 0;
      Text.ui(ctx, (me ? 'YOU (' + d.char.name + ')' : d.char.name).toUpperCase(),
              120, y, 14, me ? '#ffe060' : (dead ? '#666672' : '#e8e8ee'));
      // 气球图标
      for (let b = 0; b < 3; b++) {
        const bx = 330 + b * 20;
        ctx.beginPath();
        ctx.arc(bx, y + 7, 7, 0, Math.PI * 2);
        ctx.fillStyle = b < d.balloons ? '#ff4050' : 'rgba(255,255,255,0.12)';
        ctx.fill();
      }
      Text.ui(ctx, String(d.hitsDealt), 430, y, 13, '#9ad0ff', 'right');
    });
    Text.ui(ctx, 'balloons left · hits dealt', 330, 352, 10, '#8888a8', 'left');
    if (this.t > 1.2)
      Text.ui(ctx, 'enter: battle menu', 256, 372, 13, '#aaaaaa', 'center');
  }
  key(k) {
    if (k === 'accept' && this.t > 1.2) {
      Sound.stopMusic();
      Game.transitionTo(new BattleSelectState());
    }
  }
}

function fmtT(t) {
  if (t == null) return "--'--";
  const m = (t / 60) | 0, s = t % 60;
  return `${m}'${s.toFixed(2).padStart(5, '0')}`;
}













