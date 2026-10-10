/* ============================================================
 * Süper Mario Kart Web - 地图系统
 * 移植 map.cpp / floorobject / wallobject 系列
 * ============================================================ */
'use strict';

// MapLand 枚举（与 base.txt 数字对应）
const Land = { TRACK:0, BLOCK:1, SLOW:2, OUTER:3, RAMP:4, OIL_SLICK:5,
               RAMP_H:6, RAMP_V:7, ZIPPER:8, OTHER:9 };
const Material = { DIRT:0, GRASS:1, SPOOKY_WOOD:2, STONE:3, WATER:4, LAVA:5, VOID:6, RAINBOW:7 };

const FloorType = { ZIPPER:0, QUESTION_PANEL:1, OIL_SLICK:2, COIN:3, RAMP_H:4, RAMP_V:5 };
const WallType = { NORMAL_THWOMP:0, SUPER_THWOMP:1, GREEN_PIPE:2, ORANGE_PIPE:3 };

const NUM_LAPS = 5;

const GameMap = {
  // 注：原版上电WRAM填0x55且其行为依赖未初始化内存读取(SMK $81:E46A)；JS侧所有缓冲均显式初始化，无此语义，故不模拟。
  land: new Uint8Array(128 * 128),
  matNormal: Material.DIRT, matSlow: Material.DIRT, matOuter: Material.DIRT,
  stretchedGoal: null, centeredGoal: null, aiFarVision: 16,
  floorObjects: [], wallObjects: [],
  courseName: '',
  courseCanvas: null, courseSrc: null, edgeSrc: null,
  skyBack: null, skyFront: null,
  minimapCanvas: null,
  _courseDirty: false,

  getLand(x, y) {
    if (x < 0 || x > 1 || y < 0 || y > 1) return Land.OUTER;
    return this.land[(y * 128 | 0) * 128 + (x * 128 | 0)];
  },
  getMaterial(x, y) {
    switch (this.getLand(x, y)) {
      case Land.SLOW: case Land.BLOCK: return this.matSlow;
      case Land.OUTER: return this.matOuter;
      default: return this.matNormal;
    }
  },
  inGoal(x, y) {
    const g = this.stretchedGoal;
    return x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h;
  },

  /* ---------- 资产赛道载入（本地 assets/circuit/<dir>，来自上游开源项目） ---------- */
  async load(courseDir) {
    this.courseName = courseDir;
    this._battleFlag = false;
    this._startPath = null;
    const dir = 'circuit/' + courseDir + '/';
    await Assets.loadImage('base', dir + 'base.png');
    await Assets.loadImage('edge', dir + 'edge.png');
    await Assets.loadImage('sky_back', dir + 'sky_back.png');
    await Assets.loadImage('sky_front', dir + 'sky_front.png');
    await Assets.loadText('base_txt', dir + 'base.txt');
    await Assets.loadText('objects_txt', dir + 'objects.txt');
    await Assets.loadText('position_txt', dir + 'position.txt');
    await Assets.loadText('gradient_txt', dir + 'gradient.txt');

    // land 矩阵（base.txt为无空格连续数字，逐字符解析）
    // ':' 字符 = SPECIAL_13H(mario circuit 2特跳地块) = 10
    const rawTxt = Assets.txt('base_txt').replace(/\s+/g, '');
    for (let i = 0; i < 128 * 128; i++) {
      const v = rawTxt.charCodeAt(i) - 48;
      this.land[i] = (v >= 0 && v <= 10) ? v : 0;
    }

    // objects.txt 解析
    const o = Assets.txt('objects_txt').trim().split(/\s+/);
    let p = 0;
    const next = () => o[p++];
    this.matNormal = +next(); this.matSlow = +next(); this.matOuter = +next();
    this.stretchedGoal = { x:+next()/1024, y:+next()/1024, w:+next()/1024, h:+next()/1024 };
    this.centeredGoal  = { x:+next()/1024, y:+next()/1024, w:+next()/1024, h:+next()/1024 };
    this.aiFarVision = +next();

    // 地板物件
    this.floorObjects = [];
    const numFloor = +next();
    for (let i = 0; i < numFloor; i++) {
      const type = +next(), px = +next(), py = +next();
      const orient = +next(), sx = +next(), sy = +next();
      this.floorObjects.push({
        type, px, py, orient, sw: sx, sh: sy,
        state: 2 /*ACTIVE*/, timer: 0
      });
    }
    // 墙物体
    this.wallObjects = [];
    const numWall = +next();
    for (let i = 0; i < numWall; i++) {
      const type = +next(), cx = +next(), cy = +next();
      this.wallObjects.push({
        type, x: cx / 1024, y: cy / 1024,
        height: (type <= 1) ? 40 : 0,   // thwomp 悬空
        phase: Math.random() * 5
      });
    }

    this.baseImg = null;
    this.genSkyBack = null; this.genSkyFront = null; this.genEdgeSrc = null;
    this.finalizeLoaded();
    AI.load();
  },

  /* 载入收尾（资产/生成共用）：物件地块注入+画布采样+小地图 */
  finalizeLoaded() {
    // 课程画布（含物件贴图）
    this.courseCanvas = document.createElement('canvas');
    this.courseCanvas.width = 1024; this.courseCanvas.height = 1024;
    const cctx = this.courseCanvas.getContext('2d');
    cctx.drawImage(this.baseImg || Assets.img('base'), 0, 0);
    for (const fo of this.floorObjects) this.drawFloorObject(cctx, fo);
    // 物件地块类型（拉链/油渍/坡道/问号/金币）——移植 FloorObject::applyAllChanges
    for (const fo of this.floorObjects) {
      if (fo.type === FloorType.QUESTION_PANEL || fo.type === FloorType.COIN)
        this.setLandRegion(fo, fo.state === 2 ? Land.OTHER : Land.TRACK);
      else
        this.setLandRegion(fo, [Land.ZIPPER, 0, Land.OIL_SLICK, Land.OTHER,
                                Land.RAMP_H, Land.RAMP_V][fo.type]);
    }
    this.courseSrc = M7.sourceData(this.courseCanvas);
    this.edgeSrc = this.genEdgeSrc || M7.sourceData(Assets.img('edge'));
    this.skyBack = this.genSkyBack || Assets.img('sky_back');
    this.skyFront = this.genSkyFront || Assets.img('sky_front');

    this.buildMinimap();
    this.isBattle = !!this._battleFlag;
  },

  /* ---------- 程序化赛道载入（trackgen.js 的15条GP+4对战） ---------- */
  async loadGenerated(id) {
    const def = TRACKGEN_BATTLES[id] || TRACKGEN_SPECS[id];
    const isBattle = !!TRACKGEN_BATTLES[id];
    const th = TRACKGEN_THEMES[def.theme || 'battle'];
    this.courseName = id;
    this._battleFlag = isBattle;
    this.matNormal = th.matNormal; this.matSlow = th.matSlow; this.matOuter = th.matOuter;
    this.aiFarVision = def.aiFarVision || 12;

    let land;
    let baseCv;
    if (isBattle) {
      this._startPath = null;
      land = battleGenLand(def);
      baseCv = battleGenDrawBase(def, land);
      // 对战无终点线：放到场地外的哑矩形防NaN（圈数逻辑被isBattle短路）
      this.stretchedGoal = { x: -1, y: -1, w: 0.001, h: 0.001 };
      this.centeredGoal = { x: -1, y: -1, w: 0.001, h: 0.001 };
      this.floorObjects = battleGenFloorObjects(def);
      this.wallObjects = [];
    } else {
      const r = trackGenLand(def);
      this._startPath = r.pts;
      land = r.land;
      const s0 = r.pts[0];
      const sgx = Math.round((s0.x - 96) / 8), sgy = Math.round((s0.y - 24) / 8);
      const sgw = Math.round(192 / 8), sgh = Math.max(1, Math.round(12 / 8));
      // 封路柱：终点带左右外侧竖条(BLOCK)，防止AI/BFS沿路肩绕过终点线
      const extraBlocks = [
        [(sgx - 2) * 8, (sgy - 3) * 8, 8, (sgh + 6) * 8],
        [(sgx + sgw + 1) * 8, (sgy - 3) * 8, 8, (sgh + 6) * 8]
      ];
      land = trackGenLand(def, extraBlocks).land;
      baseCv = trackGenDrawBase(def, land, extraBlocks);
      this.stretchedGoal = { x: (s0.x - 96) / 1024, y: (s0.y - 24) / 1024,
                             w: 192 / 1024, h: 12 / 1024 };
      this.centeredGoal = { x: (s0.x - 64) / 1024, y: (s0.y - 18) / 1024,
                            w: 128 / 1024, h: 10 / 1024 };
      this.floorObjects = trackGenFloorObjects(def, r.pts);
      this.wallObjects = trackGenWallObjects(def);
    }
    this.land = land;
    this.baseImg = baseCv;
    const sky = trackGenDrawSky(th);
    this.genSkyBack = sky.back; this.genSkyFront = sky.front;
    this.genEdgeSrc = M7.sourceData(trackGenDrawEdge(th));

    this.finalizeLoaded();
    if (!isBattle) AI.generate(this.land, this.stretchedGoal);
    else {
      // Battle Course 没有起终点/圈数梯度；显式清空，避免继承上一场 GP 的数据。
      AI.clearCourse();
      this.lapCheck = 0;
    }
  },

  setLandRegion(fo, land) {
    if (land === undefined || land === null) return;
    const x0 = fo.px / 8 | 0, y0 = fo.py / 8 | 0;
    const w = Math.max(1, Math.round(fo.sw / 8)), h = Math.max(1, Math.round(fo.sh / 8));
    for (let y = y0; y < y0 + h && y < 128; y++)
      for (let x = x0; x < x0 + w && x < 128; x++)
        this.land[y * 128 + x] = land;
  },

  /* 把地板物件贴图画到课程画布上 */
  drawFloorObject(cctx, fo) {
    let img = null;
    switch (fo.type) {
      case FloorType.ZIPPER:
        img = Assets.slice('floor_misc', { x:0, y:0, w:16, h:16 }); break;
      case FloorType.QUESTION_PANEL:
        if (fo.state === 2) img = Assets.slice('question_panel', { x:fo.orient*16, y:0, w:16, h:16 });
        break;
      case FloorType.OIL_SLICK:
        img = Assets.slice('floor_misc', { x:0, y:16, w:16, h:16 }); break;
      case FloorType.COIN:
        if (fo.state === 2) img = Assets.slice('floor_misc', { x:0, y:32, w:8, h:8 });
        break;
      case FloorType.RAMP_H:
        img = Assets.slice('floor_misc', { x:0, y:40, w:8, h:8 }); break;
      case FloorType.RAMP_V:
        img = Assets.slice('floor_misc', { x:32, y:40, w:8, h:8 }); break;
    }
    // 先还原底图再画（支持状态变化）
    const baseImg = this.baseImg;
    if (baseImg) cctx.drawImage(baseImg, fo.px, fo.py, fo.sw, fo.sh, fo.px, fo.py, fo.sw, fo.sh);
    if (img) cctx.drawImage(img, fo.px, fo.py);
  },

  /* 物件状态变化后刷新采样数据 */
  markCourseDirty() { this._courseDirty = true; },
  refreshCourseIfNeeded() {
    if (!this._courseDirty) return;
    this._courseDirty = false;
    const cctx = this.courseCanvas.getContext('2d');
    for (const fo of this.floorObjects)
      if (fo.type === FloorType.COIN || fo.type === FloorType.QUESTION_PANEL) {
        this.drawFloorObject(cctx, fo);
        this.setLandRegion(fo, fo.state === 2 ? Land.OTHER : Land.TRACK);
      }
    this.courseSrc = M7.sourceData(this.courseCanvas);
  },

  /* 物件逻辑更新：thwomp升降 / 金币重生 */
  updateObjects(dt) {
    for (const wo of this.wallObjects) {
      if (wo.type <= 1) {   // thwomp
        wo.phase += dt;
        const cyc = wo.phase % 6;
        if (wo.type === 1) wo.phase += dt * 0.0001; // super略快(简化)
        if (cyc < 3) wo.height = 40;
        else if (cyc < 3.15) wo.height = Math.max(0, 40 * (1 - (cyc - 3) / 0.15));
        else wo.height = 0;
      }
    }
    for (const fo of this.floorObjects) {
      if (fo.state === 3 /*INACTIVE*/) {
        fo.timer -= dt;
        if (fo.timer <= 0) {
          fo.state = 2;
          if (fo.type === FloorType.COIN || fo.type === FloorType.QUESTION_PANEL)
            this.markCourseDirty();
        }
      }
    }
  },

  reactivateQuestionPanels() {
    for (const fo of this.floorObjects)
      if (fo.type === FloorType.QUESTION_PANEL && fo.state === 3) {
        fo.state = 2; this.markCourseDirty();
      }
  },

  /* ---------- 小地图（非透视mode7，一次性生成） ---------- */
  buildMinimap() {
    const w = 512, h = Math.round(448 * M7.MINIMAP_HEIGHT_PCT);  // 224
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const id = cv.getContext('2d').createImageData(w, h);
    const fovHalf = Math.PI / 32;
    const min = (6.5 - 1.05) / Math.cos(fovHalf);
    const max = 6.65 / Math.cos(fovHalf);
    M7.render(id, w, h, { x: 0.5, y: 6.5 }, 3 * Math.PI / 2, fovHalf,
              min, max, false, this.courseSrc, this.edgeSrc);
    cv.getContext('2d').putImageData(id, 0, 0);
    this.minimapCanvas = cv;
  },

  /* 小地图梯形坐标映射（忠实移植 mapCoordinates） */
  mapCoordinates(x, y) {
    const bottomX = 20/512, bottomY = 438/448, topX = 57/512, topY = 252/448;
    const mlX = topX + (bottomX - topX) * y;
    const mlY = topY + (bottomY - topY) * y;
    const mrX = 1 - mlX;
    return { x: mlX + (mrX - mlX) * x, y: mlY };
  },

  /* 发车位置（忠实移植 getPlayerInitialPosition）
   * Bug5修复：生成赛道终点带后方路面可能不足24*8px长，导致后排车
   * 落在路肩/坠落区。增加吸附：出生点不在可行驶地块时，螺旋搜索
   * 最近的可行驶(TRACK/OTHER)格。 */
  getPlayerInitialPosition(position) {
    // 程序化赛道的起跑直线可旋转且会弯曲，不能套用资产赛道固定 y 方向的排位公式。
    // 沿中心线从终点反向量出纵向间距，再沿局部法线错开左右车位。
    if (this._startPath && this._startPath.length > 1) {
      const pts = this._startPath;
      const longitudinal = 28 + 24 * (position - 1);
      let remaining = longitudinal;
      let bx = pts[pts.length - 1].x, by = pts[pts.length - 1].y;
      let angle = -Math.PI / 2;

      for (let i = pts.length - 2; i >= 0; i--) {
        const a = pts[i], b = pts[i + 1];
        const sx = a.x - b.x, sy = a.y - b.y;
        const len = Math.hypot(sx, sy);
        if (len <= 1e-6) continue;
        // 正向切线由当前点指向终点（数组下标递增方向）。
        angle = Math.atan2(b.y - a.y, b.x - a.x);
        if (remaining <= len) {
          const t = remaining / len;
          bx = b.x + sx * t;
          by = b.y + sy * t;
          break;
        }
        remaining -= len;
        bx = a.x; by = a.y;
      }

      const lane = position % 2 ? 16 : -16;
      const px = bx - Math.sin(angle) * lane;
      const py = by + Math.cos(angle) * lane;
      return { x: px / 1024, y: py / 1024, angle };
    }

    const gx = (this.centeredGoal.x + this.centeredGoal.w / 2) * 1024;
    const gy = (this.centeredGoal.y + this.centeredGoal.h) * 1024;
    const dx = gx < 512 ? 16 * (2 * (position % 2) - 1) : 16 * (1 - 2 * (position % 2));
    const dy = 28 + 24 * (position - 1);
    let px = Math.floor((gx + dx) / 8) * 8 / 1024;
    let py = (gy + dy) / 1024;
    // 吸附检查
    const drivable = v => v === Land.TRACK || v === Land.OTHER || v === Land.SLOW ||
                          v === Land.RAMP_H || v === Land.RAMP_V;
    const okSpot = (tx, ty) => {
      if (!drivable(this.land[ty * 128 + tx])) return false;
      return drivable(this.land[ty * 128 + tx - 1]) && drivable(this.land[ty * 128 + tx + 1]) &&
             drivable(this.land[(ty - 1) * 128 + tx]) && drivable(this.land[(ty + 1) * 128 + tx]);
    };
    const cx0 = Math.floor(px * 128), cy0 = Math.floor(py * 128);
    if (!okSpot(cx0, cy0)) {
      const cx = Math.round(px * 128), cy = Math.round(py * 128);
      let best = null, bestD = Infinity;
      for (let r = 1; r <= 14 && !best; r++) {
        for (let oy = -r; oy <= r && !best; oy++) {
          for (let ox = -r; ox <= r && !best; ox++) {
            if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;   // 只看环上
            const tx = cx + ox, ty = cy + oy;
            if (tx < 3 || tx > 124 || ty < 3 || ty > 124) continue;
            // 候选格及其四邻都必须可行驶（远离OUTER边界，防出生即坠）
            const ok = drivable(this.land[ty * 128 + tx]) &&
              drivable(this.land[ty * 128 + tx - 1]) && drivable(this.land[ty * 128 + tx + 1]) &&
              drivable(this.land[(ty - 1) * 128 + tx]) && drivable(this.land[(ty + 1) * 128 + tx]);
            if (ok) {
              const d2 = ox * ox + oy * oy;
              if (d2 < bestD) { bestD = d2; best = [tx, ty]; }
            }
          }
        }
      }
      if (best) { px = (best[0] + 0.5) / 128; py = (best[1] + 0.5) / 128; }
    }
    return { x: px, y: py, angle: -Math.PI / 2 };
  }
};



