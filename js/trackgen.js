/* ============================================================
 * Süper Mario Kart Web - 程序化赛道工厂 (trackgen.js)
 * 生成原版缺失的15条GP赛道 + 4张对战课程：
 *   - 极坐标谐波闭环中心线（保证不自交）
 *   - 距离场栅格化 land 矩阵（无抗锯齿误差）
 *   - canvas 直接绘制 base/edge/sky 贴图（无需外部素材）
 *   - 问号面板/金币/管道/Thwomp 沿线布点
 * 数据全部在代码内，离线可用；音乐按主题复用已有ogg
 * ============================================================ */
'use strict';

/* ---------- 主题配置 ----------
 * offroad: 路肩外地块类型; outerEdge: 更远处(到地图边)类型
 * voidTheme=true 时路肩即坠落(OUTER) */
const TRACKGEN_THEMES = {
  circuit: { name:'mario circuit', road:'#8888a8', border:'#d8b06a',
    groundA:'#e8c890', groundB:'#dcb87c', edge:'#c89858',
    offroad:2 /*SLOW*/, outerEdge:2, voidTheme:false,
    matNormal:3 /*STONE*/, matSlow:0 /*DIRT沙*/, matOuter:0,
    skyBack:['#3860c8','#7898e8'], skyFront:['#98b8f0','#d8e8ff'],
    deco:'seams' },
  donut: { name:'donut plains', road:'#b08850', border:'#4f9030',
    groundA:'#68b848', groundB:'#58a83c', edge:'#886838',
    offroad:2, outerEdge:2, voidTheme:false,
    matNormal:0 /*DIRT土*/, matSlow:1 /*GRASS草*/, matOuter:1,
    skyBack:['#3878d8','#88b8f8'], skyFront:['#a8d0ff','#e8f4ff'],
    deco:'none' },
  ghost: { name:'ghost valley', road:'#a07848', border:'#584028',
    groundA:'#181820', groundB:'#101018', edge:'#684828',
    offroad:3 /*OUTER坠落*/, outerEdge:3, voidTheme:true,
    matNormal:2 /*SPOOKY_WOOD*/, matSlow:2, matOuter:6 /*VOID*/,
    skyBack:['#202840','#384868'], skyFront:['#485878','#7080a0'],
    deco:'planks' },
  bowser: { name:'bowser castle', road:'#909098', border:'#c04818',
    groundA:'#301810', groundB:'#402018', edge:'#787088',
    offroad:3 /*岩浆坠落*/, outerEdge:3, voidTheme:true,
    matNormal:3 /*STONE*/, matSlow:5 /*LAVA*/, matOuter:5,
    skyBack:['#481818','#883828'], skyFront:['#a04828','#d87838'],
    deco:'bricks', wallType:'thwomp' },
  choco: { name:'choco island', road:'#8a6840', border:'#6a4828',
    groundA:'#7a5535', groundB:'#6a4528', edge:'#5a3c20',
    offroad:2 /*巧克力泥SLOW*/, outerEdge:2, voidTheme:false,
    matNormal:0, matSlow:0, matOuter:0,
    skyBack:['#5878a0','#98a8b8'], skyFront:['#b8c0c8','#e0e0dc'],
    deco:'none' },
  koopa: { name:'koopa beach', road:'#e8cc90', border:'#e0a860',
    groundA:'#38a8e0', groundB:'#2890d0', edge:'#c08848',
    offroad:2 /*沙滩SLOW*/, outerEdge:3 /*海OUTER*/, voidTheme:false,
    matNormal:0 /*沙*/, matSlow:0, matOuter:4 /*WATER*/,
    skyBack:['#2898e8','#70c0f8'], skyFront:['#98d8ff','#e0f4ff'],
    deco:'none' },
  vanilla: { name:'vanilla lake', road:'#c8dce8', border:'#88a8c0',
    groundA:'#e8f0f8', groundB:'#d0e0ee', edge:'#a0b8cc',
    offroad:2 /*雪SLOW*/, outerEdge:2, voidTheme:false,
    matNormal:3 /*冰面STONE*/, matSlow:0, matOuter:0,
    skyBack:['#6890c0','#a8c0dd'], skyFront:['#c8dcee','#f0f6fc'],
    deco:'ice' },
  rainbow: { name:'rainbow road', road:'#8888c8', border:'#302048',
    groundA:'#080810', groundB:'#000008', edge:'#403058',
    offroad:3 /*深渊*/, outerEdge:3, voidTheme:true,
    matNormal:7 /*RAINBOW*/, matSlow:7, matOuter:6,
    skyBack:['#000010','#181030'], skyFront:['#282048','#483868'],
    deco:'rainbow', wallType:'superthwomp' },
  battle: { name:'battle', road:'#a8a8b8', border:'#606070',
    groundA:'#384048', groundB:'#303840', edge:'#808090',
    offroad:1 /*BLOCK*/, outerEdge:1, voidTheme:false,
    matNormal:3, matSlow:3, matOuter:3,
    skyBack:['#283048','#485878'], skyFront:['#687898','#98a8c8'],
    deco:'none' },
};

/* 音乐主题映射（复用已有ogg） */
const TRACKGEN_MUSIC = {
  circuit:'mario_circuit_2', donut:'donut_plains_1', ghost:'ghost_valley_1',
  bowser:'bowser_castle_1', rainbow:'rainbow_road', choco:'donut_plains_1',
  koopa:'donut_plains_1', vanilla:'mario_circuit_2',
};

/* ---------- 15条GP赛道规格 ----------
 * 极坐标谐波闭环: r(θ)=rx*(1+Σ amp_k*sin(kθ+φk)), ry同理独立谐波
 * startTheta选右端点(θ≈0)使发车朝向接近向上(-π/2) */
const TRACKGEN_SPECS = {
  mario_circuit_1: { theme:'circuit', name:'mario circuit 1',
    cx:512, cy:512, rx:330, ry:240, rot:-4, harm:[[1,0.10,20]],
    width:56, pipes:[[300,300],[730,560]], panelsEvery:150 },
  choco_island_1: { theme:'choco', name:'choco island 1',
    cx:512, cy:512, rx:340, ry:230, rot:8, harm:[[2,0.22,40],[1,-0.06,0]],
    width:54, panelsEvery:140 },
  ghost_valley_2: { theme:'ghost', name:'ghost valley 2',
    cx:512, cy:512, rx:350, ry:235, rot:14, harm:[[3,0.14,10]],
    width:48, panelsEvery:130, gaps:true },
  donut_plains_2: { theme:'donut', name:'donut plains 2',
    cx:512, cy:500, rx:355, ry:225, rot:-10, harm:[[1,-0.16,30],[2,0.08,0]],
    width:56, panelsEvery:145 },
  bowser_castle_2: { theme:'bowser', name:'bowser castle 2',
    cx:512, cy:512, rx:330, ry:245, rot:6, harm:[[4,0.11,15]],
    width:50, panelsEvery:135,
    thwomps:[[512,290],[380,650],[660,640]] },
  mario_circuit_3: { theme:'circuit', name:'mario circuit 3',
    cx:512, cy:505, rx:365, ry:215, rot:-16, harm:[[2,-0.24,70],[1,0.05,0]],
    width:54, pipes:[[280,420],[750,430]], panelsEvery:150 },
  koopa_beach_1: { theme:'koopa', name:'koopa beach 1',
    cx:512, cy:512, rx:295, ry:275, rot:0, harm:[[1,0.05,0],[3,0.04,50]],
    width:58, panelsEvery:140 },
  choco_island_2: { theme:'choco', name:'choco island 2',
    cx:512, cy:512, rx:345, ry:225, rot:22, harm:[[3,-0.17,25]],
    width:52, panelsEvery:135 },
  vanilla_lake_1: { theme:'vanilla', name:'vanilla lake 1',
    cx:512, cy:512, rx:350, ry:230, rot:-6, harm:[[2,0.26,10]],
    width:54, panelsEvery:140,
    pipes:[[512,270],[512,745]] },
  bowser_castle_3: { theme:'bowser', name:'bowser castle 3',
    cx:512, cy:512, rx:335, ry:240, rot:-12, harm:[[5,0.09,30],[1,0.05,0]],
    width:48, panelsEvery:130,
    thwomps:[[512,300],[330,560],[700,565]] },
  mario_circuit_4: { theme:'circuit', name:'mario circuit 4',
    cx:512, cy:505, rx:370, ry:220, rot:10, harm:[[1,0.20,60],[2,0.07,0]],
    width:56, pipes:[[300,330],[735,600],[512,742]], panelsEvery:155 },
  donut_plains_3: { theme:'donut', name:'donut plains 3',
    cx:512, cy:510, rx:360, ry:230, rot:18, harm:[[2,0.14,-40],[1,-0.08,0]],
    width:54, panelsEvery:145,
    blocks:[[210,300,72,72],[760,560,72,72]] },
  koopa_beach_2: { theme:'koopa', name:'koopa beach 2',
    cx:512, cy:512, rx:340, ry:240, rot:-20, harm:[[4,-0.12,20]],
    width:54, panelsEvery:140 },
  ghost_valley_3: { theme:'ghost', name:'ghost valley 3',
    cx:512, cy:512, rx:360, ry:225, rot:30, harm:[[3,0.19,-15]],
    width:44, panelsEvery:125, gaps:true },
  vanilla_lake_2: { theme:'vanilla', name:'vanilla lake 2',
    cx:512, cy:508, rx:355, ry:228, rot:4, harm:[[1,-0.24,110]],
    width:52, panelsEvery:140,
    pipes:[[350,290],[680,700]] },

  /* ---- 原版5条：全部程序化重制（谐波组合与上方15条明显不同） ---- */
  donut_plains_1: { theme:'donut', name:'donut plains 1',
    cx:512, cy:495, rx:345, ry:250, rot:-24, harm:[[1,0.12,-70],[2,-0.06,15]],
    width:58, panelsEvery:150 },
  mario_circuit_2: { theme:'circuit', name:'mario circuit 2',
    cx:512, cy:505, rx:330, ry:255, rot:-8, harm:[[3,0.10,-60],[1,0.07,140]],
    width:56, panelsEvery:150,
    pipes:[[820,430],[782,660],[600,752],[400,745],[232,600],[205,380],[382,268],[642,255]] },
  ghost_valley_1: { theme:'ghost', name:'ghost valley 1',
    cx:512, cy:512, rx:335, ry:245, rot:36, harm:[[4,0.16,80],[2,-0.07,-100]],
    width:46, panelsEvery:128, gaps:true },
  bowser_castle_1: { theme:'bowser', name:'bowser castle 1',
    cx:512, cy:508, rx:340, ry:235, rot:14, harm:[[6,0.08,-45],[1,0.06,90]],
    width:50, panelsEvery:132,
    thwomps:[[500,278],[340,660],[692,632]] },
  rainbow_road: { theme:'rainbow', name:'rainbow road',
    cx:512, cy:512, rx:360, ry:240, rot:-28, harm:[[2,0.30,-130],[5,0.07,55],[1,-0.09,200]],
    width:50, panelsEvery:160, gaps:true },
};

/* ---------- 4张对战课程规格（瓦片坐标128格） ----------
 * arena: TRACK区域矩形, walls: 内部BLOCK障碍 */
const TRACKGEN_BATTLES = {
  battle_course_1: { name:'battle course 1',
    arena:[[20,20,88,88]],
    walls:[[60,24,8,8],[24,60,8,8],[96,60,8,8],[60,96,8,8]] },
  battle_course_2: { name:'battle course 2',
    arena:[[16,36,96,56]],
    walls:[[40,36,6,22],[82,70,6,22],[61,50,6,28]] },
  battle_course_3: { name:'battle course 3',
    arena:[[40,16,48,96],[16,40,96,48]],
    walls:[[56,44,16,8],[56,76,16,8]] },
  battle_course_4: { name:'battle course 4',
    arena:[[20,20,88,88]],
    walls:[[48,48,32,32],[24,24,10,10],[94,24,10,10],[24,94,10,10],[94,94,10,10]] },
};

/* ================= 采样与距离场 ================= */
/* 极坐标谐波闭环 → 密集中心线采样点(行进方向使起点切线朝上) */
function trackGenSamples(def) {
  const pts = [];
  const rot = (def.rot || 0) * Math.PI / 180;
  const N = 720;
  // θ从+ε递减扫一整圈: 右端点出发逆时针(屏幕系)→切线朝上
  const harms = def.harm || [];
  for (let i = 0; i <= N; i++) {
    const th = -i / N * Math.PI * 2;
    let fr = 1, fy = 1;
    for (const [k, amp, ph] of harms) {
      const p = (ph || 0) * Math.PI / 180;
      fr += amp * Math.sin(k * th + p);
      fy += amp * Math.sin(k * th + p);
    }
    let x = Math.cos(th) * def.rx * fr;
    let y = Math.sin(th) * def.ry * fy;
    if (rot) { const c = Math.cos(rot), s = Math.sin(rot);
      const nx = x * c - y * s, ny = x * s + y * c; x = nx; y = ny; }
    pts.push({ x: def.cx + x, y: def.cy + y });
  }
  return pts;
}

/* 点到折线最短距离 */
function trackGenDist(x, y, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i].x, ay = pts[i].y;
    const bx = pts[i + 1].x - ax, by = pts[i + 1].y - ay;
    const l2 = bx * bx + by * by;
    let t = l2 > 0 ? ((x - ax) * bx + (y - ay) * by) / l2 : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    const dx = x - (ax + bx * t), dy = y - (ay + by * t);
    const d2 = dx * dx + dy * dy;
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

/* 距离场栅格化 GP赛道 land 矩阵 */
function trackGenLand(def, extraBlocks = []) {
  const th = TRACKGEN_THEMES[def.theme];
  const pts = trackGenSamples(def);
  const w = def.width;
  const land = new Uint8Array(128 * 128);
  for (let ty = 0; ty < 128; ty++) {
    for (let tx = 0; tx < 128; tx++) {
      const d = trackGenDist(tx * 8 + 4, ty * 8 + 4, pts);
      let v;
      if (d <= w) v = 0;                                    // TRACK
      else if (d <= w + 40) v = th.offroad;                 // 路肩带（视觉+材质+出生缓冲）
      else v = 3;                                           // 其余一律OUTER：
      // 说明：若外场是可行驶SLOW，BFS会从终点带两侧绕行导致圈数梯度泄漏；
      // 统一坠落制（同Ghost Valley/Bowser/Rainbow）保证梯度只沿环路传播。
      land[ty * 128 + tx] = v;
    }
  }
  // 非坠落主题：地图边缘2格强制BLOCK防出界
  if (!th.voidTheme) {
    for (let t = 0; t < 128; t++)
      for (let b = 0; b < 2; b++) {
        land[b * 128 + t] = 1; land[(127 - b) * 128 + t] = 1;
        land[t * 128 + b] = 1; land[t * 128 + (127 - b)] = 1;
      }
  }
  // 特征障碍块（extraBlocks=终点两侧封路柱，防BFS横向泄漏）
  for (const [x, y, bw, bh] of [...(def.blocks || []), ...extraBlocks])
    for (let ty = y >> 3, ey = (y + bh) >> 3; ty < ey && ty < 128; ty++)
      for (let tx = x >> 3, ex = (x + bw) >> 3; tx < ex && tx < 128; tx++)
        land[ty * 128 + tx] = 1;
  return { land, pts };
}

/* 对战场地 land：全BLOCK挖出arena再盖墙 */
function battleGenLand(def) {
  const land = new Uint8Array(128 * 128).fill(1);
  for (const [tx, ty, tw, thh] of def.arena)
    for (let y = ty, ye = ty + thh; y < ye && y < 127; y++)
      for (let x = tx, xe = tx + tw; x < xe && x < 127; x++)
        land[y * 128 + x] = 0;
  for (const [tx, ty, tw, thh] of def.walls)
    for (let y = ty, ye = ty + thh; y < ye && y < 127; y++)
      for (let x = tx, xe = tx + tw; x < xe && x < 127; x++)
        if (x >= 0 && y >= 0) land[y * 128 + x] = 1;
  return land;
}

/* ================= 贴图绘制 ================= */
function trackGenDrawGround(ctx, th) {
  ctx.fillStyle = th.groundB;
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.fillStyle = th.groundA;
  for (let gy = 0; gy < 32; gy++)
    for (let gx = 0; gx < 32; gx++)
      if ((gx + gy) % 2 === 0) ctx.fillRect(gx * 32, gy * 32, 32, 32);
}

function trackGenPathTo(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

function trackGenDrawDeco(ctx, def, th, pts) {
  if (th.deco === 'planks' || th.deco === 'bricks') {
    ctx.strokeStyle = th.deco === 'planks' ? 'rgba(40,24,12,0.85)' : 'rgba(40,40,48,0.7)';
    ctx.lineWidth = 3;
    const step = th.deco === 'planks' ? 14 : 26;
    for (let i = 0; i < pts.length - 1; i += step) {
      const p = pts[i];
      const q = pts[Math.min(pts.length - 1, i + 1)];
      const dx = q.x - p.x, dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len, py = dx / len;   // 法向
      ctx.beginPath();
      ctx.moveTo(p.x - px * def.width, p.y - py * def.width);
      ctx.lineTo(p.x + px * def.width, p.y + py * def.width);
      ctx.stroke();
    }
  } else if (th.deco === 'ice') {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < pts.length - 1; i += 34) {
      const p = pts[i];
      ctx.beginPath();
      ctx.moveTo(p.x - 18, p.y - 10);
      ctx.lineTo(p.x + 14, p.y + 12);
      ctx.stroke();
    }
  }
}

/* GP赛道 base画布 */
function trackGenDrawBase(def, land, extraBlocks = []) {
  const th = TRACKGEN_THEMES[def.theme];
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 1024;
  const ctx = cv.getContext('2d');
  trackGenDrawGround(ctx, th);
  const pts = trackGenSamples(def);
  // 路肩描边
  trackGenPathTo(ctx, pts);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = th.border;
  ctx.lineWidth = (def.width + 14) * 2;
  ctx.stroke();
  // 路面
  trackGenPathTo(ctx, pts);
  ctx.strokeStyle = th.road;
  ctx.lineWidth = def.width * 2;
  ctx.stroke();
  // 彩虹分段上色
  if (th.deco === 'rainbow') {
    ctx.lineCap = 'round';
    for (let i = 0; i < pts.length - 1; i += 8) {
      const hue = (i * 4) % 360;
      ctx.strokeStyle = 'hsl(' + hue + ',95%,60%)';
      ctx.lineWidth = def.width * 2 - 6;
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }
  trackGenDrawDeco(ctx, def, th, pts);
  // 起点黑白格横带（垂直于向上行进方向=水平条）
  const s0 = pts[0];
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < Math.ceil((def.width * 2) / 16); col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? '#ffffff' : '#111111';
      ctx.fillRect(s0.x - def.width + col * 16, s0.y - 12 + row * 12, 16, 12);
    }
  // 障碍块
  ctx.fillStyle = '#000000';
  for (const [x, y, bw, bh] of [...(def.blocks || []), ...extraBlocks]) {
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x, y, bw, 8);
    ctx.fillStyle = '#000000';
  }
  return cv;
}

/* 对战场地 base画布 */
function battleGenDrawBase(def, land) {
  const th = TRACKGEN_THEMES.battle;
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 1024;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, 1024, 1024);
  // 场内棋盘
  for (const [tx, ty, tw, thh] of def.arena)
    for (let y = ty; y < ty + thh; y++)
      for (let x = tx; x < tx + tw; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? th.groundA : th.groundB;
        ctx.fillRect(x * 8, y * 8, 8, 8);
      }
  // 墙块（黑体+灰顶）
  const drawWall = (x, y, w, h) => {
    ctx.fillStyle = '#14141c';
    ctx.fillRect(x * 8, y * 8, w * 8, h * 8);
    ctx.fillStyle = '#3c3c50';
    ctx.fillRect(x * 8, y * 8, w * 8, 6);
    ctx.strokeStyle = '#585874';
    ctx.lineWidth = 2;
    ctx.strokeRect(x * 8 + 1, y * 8 + 1, w * 8 - 2, h * 8 - 2);
  };
  // 地图边界墙
  drawWall(0, 0, 128, 2); drawWall(0, 126, 128, 2);
  drawWall(0, 0, 2, 128); drawWall(126, 0, 2, 128);
  for (const [tx, ty, tw, thh] of def.walls) drawWall(tx, ty, tw, thh);
  return cv;
}

/* 天空两层 */
function trackGenDrawSky(th) {
  const mk = (w, c0, c1) => {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = 32;
    const ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 32);
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, 32);
    return cv;
  };
  return { back: mk(1536, th.skyBack[0], th.skyBack[1]),
           front: mk(2560, th.skyFront[0], th.skyFront[1]) };
}

/* 8×8边缘纯色 */
function trackGenDrawEdge(th) {
  const cv = document.createElement('canvas');
  cv.width = 8; cv.height = 8;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = th.edge;
  ctx.fillRect(0, 0, 8, 8);
  return cv;
}

/* 地板物件布点：沿中心线按弧长间隔交替问号面板/金币 */
function trackGenFloorObjects(def, pts) {
  const objs = [];
  let acc = 0, flip = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc >= (def.panelsEvery || 140)) {
      acc = 0;
      const px = Math.round(pts[i].x / 8) * 8, py = Math.round(pts[i].y / 8) * 8;
      if (flip % 2 === 0)
        objs.push({ type: 1 /*QUESTION_PANEL*/, px, py, orient: 0, sw: 16, sh: 16, state: 2, timer: 0 });
      else
        objs.push({ type: 3 /*COIN*/, px, py, orient: 0, sw: 8, sh: 8, state: 2, timer: 0 });
      flip++;
    }
  }
  return objs;
}

/* 墙物体：管道/Thwomp */
function trackGenWallObjects(def) {
  const th = TRACKGEN_THEMES[def.theme];
  const objs = [];
  (def.pipes || []).forEach(([x, y], i) =>
    objs.push({ type: i % 2 === 0 ? 2 : 3, x: x / 1024, y: y / 1024, height: 0, phase: Math.random() * 5 }));
  (def.thwomps || []).forEach(([x, y]) =>
    objs.push({ type: 0, x: x / 1024, y: y / 1024, height: 40, phase: Math.random() * 5 }));
  if (def.gaps && th.wallType === 'superthwomp')
    objs.push({ type: 1, x: 0.5, y: 0.5, height: 40, phase: Math.random() * 5 });
  return objs;
}

/* 战斗场地地板：密集问号面板网格（避开墙体2格范围） */
function battleGenFloorObjects(def) {
  const objs = [];
  const blocked = (tx, ty) => {
    for (const [wx, wy, ww, wh] of def.walls)
      if (tx >= wx - 2 && tx < wx + ww + 2 && ty >= wy - 2 && ty < wy + wh + 2) return true;
    return false;
  };
  for (const [ax, ay, aw, ah] of def.arena)
    for (let ty = ay + 4; ty < ay + ah - 4; ty += 8)
      for (let tx = ax + 4; tx < ax + aw - 4; tx += 8)
        if (!blocked(tx, ty))
          objs.push({ type: 1, px: tx * 8, py: ty * 8, orient: 0, sw: 16, sh: 16, state: 2, timer: 0 });
  return objs;
}




