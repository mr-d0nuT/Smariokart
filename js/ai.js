/* ============================================================
 * Süper Mario Kart Web - 梯度下降AI
 * 直接加载C++版预计算的 gradient.txt / position.txt
 * ============================================================ */
'use strict';

const AI = {
  gradient: null, position: null,
  lapCheck: 0, maxValue: 0,

  /* ===== 阶段3-C4：原版 8-bit atan2 与 64×64 角度表（移植 $81:F722 / $81:E4B3）=====
   * 基表 256 字节原存 ROM($C6:1F46)，此处以数学等价的反正切曲线生成：
   * base[r] = round(atan(r/256) · 64 / (π/2))，r∈[0,255] → 角度单位 $40=90°。 */
  atanBase: null,      // Uint8Array(256)
  angleTable64: null,  // Uint8Array(64*64)

  clearCourse() {
    this.gradient = null;
    this.position = null;
    this.lapCheck = 0;
    this.maxValue = 0;
  },

  buildAngleTables() {
    if (this.atanBase) return;
    const base = new Uint8Array(256);
    for (let r = 0; r < 256; r++)
      base[r] = Math.round(Math.atan(r / 256) * 128 / Math.PI);
    this.atanBase = base;

    // $81:E4B3：64×64 角度表（col≥row 用 atan2(row,col)；col<row 用镜像 $40-atan2(col,row)）
    const t = new Uint8Array(64 * 64);
    const NEG = [1, 0, 0, 1, 0, 1, 1, 0];        // 原版 negate_flags
    const OFF = [0x40, 0x40, 0xC0, 0xC0, 0x00, 0x80, 0x00, 0x80]; // 原版 quadrant_offsets
    const a2 = (x_in, y_in) => {
      if (y_in === 0) return x_in === 0 ? 0 : (x_in < 0 ? 0xC0 : 0x40);
      let q = 0, ay = y_in;
      if (y_in < 0) { ay = -ay; q++; }
      if (x_in === 0) return (q & 1) ? 0x80 : 0x00;
      let ax = x_in;
      if (x_in < 0) { ax = -ax; q += 2; }
      let larger, smaller;
      if (ax >= ay) { larger = ax; smaller = ay; }
      else { larger = ay; smaller = ax; q |= 4; }
      while (larger >= 0x100) { larger >>= 1; smaller >>= 1; }
      let ratio = larger ? Math.floor(smaller * 256 / larger) : 0;
      if (ratio > 255) ratio = 255;
      let a8 = base[ratio];
      if (NEG[q]) a8 = (-a8) & 0xFF;
      return (a8 + OFF[q]) & 0xFF;
    };
    let idx = 0;
    for (let row = 0; row < 64; row++)
      for (let col = 0; col < 64; col++) {
        t[idx++] = (col >= row) ? a2(row, col)
                                : (0x40 - a2(col, row)) & 0xFF;
      }
    this.angleTable64 = t;
  },

  /* 目标角量化为原版 8-bit 角度再转回弧度（AI 转向的硬件级阶梯感） */
  quantizeAngle(rad) {
    this.buildAngleTables();
    const a8 = Math.round((rad % (2 * Math.PI)) / (2 * Math.PI) * 256) & 0xFF;
    return a8 / 256 * 2 * Math.PI;
  },

  load() {
    const g = Assets.txt('gradient_txt').trim().split(/\s+/);
    const p = Assets.txt('position_txt').trim().split(/\s+/);
    this.gradient = new Int32Array(128 * 128);
    this.position = new Int32Array(128 * 128);
    for (let i = 0; i < 128 * 128; i++) {
      this.gradient[i] = +g[i];
      this.position[i] = +p[i];
    }
    // position.txt 最后一行是 GRADIENT_LAP_CHECK
    this.lapCheck = +p[128 * 128];
    this.maxValue = this.lapCheck + 10;
  },

  /* ---------- 运行时梯度生成（移植gradientdescent.cpp else分支） ----------
   * 用于程序化生成的赛道：从land矩阵+终点线BFS求最短路梯度 */
  WALL_PENALTY_MAX: 4096,
  NB: [[0,-1],[-1,0],[0,1],[1,0],[1,-1],[1,1],[-1,1],[-1,-1]],

  weightLand(land) {
    switch (land) {
      case Land.ZIPPER: case Land.OTHER: return 1;
      case Land.TRACK: return 10;
      case Land.RAMP_H: case Land.RAMP_V: return 50;
      case Land.OIL_SLICK: case Land.SLOW: return 100;
      default: return 500000;   // OUTER/BLOCK等
    }
  },

  generate(landMatrix, stretchedGoal) {
    const W = 128, N = W * W;
    this.gradient = new Int32Array(N).fill(-2);
    this.position = new Int32Array(N).fill(-1);
    const wallPenalty = new Int32Array(N);
    let frontier = [];

    // 墙壁与惩罚初始化
    for (let row = 0; row < W; row++) {
      for (let col = 0; col < W; col++) {
        const i = row * W + col;
        const land = landMatrix[i];
        if (land === Land.BLOCK || row === 0 || row === W - 1 || col === 0 || col === W - 1) {
          this.gradient[i] = -1;
          wallPenalty[i] = this.WALL_PENALTY_MAX;
          frontier.push([col, row]);
        } else if (land === Land.SLOW || land === Land.OUTER) {
          wallPenalty[i] = this.WALL_PENALTY_MAX;
          frontier.push([col, row]);
        }
      }
    }
    // 惩罚扩散3轮
    let currentPenalty = this.WALL_PENALTY_MAX;
    const FACTOR = 2, ITERS = 3;
    for (let pen = 0; pen < ITERS; pen++) {
      const nextFrontier = [];
      for (const [col, row] of frontier) {
        const penalty = wallPenalty[row * W + col];
        if (penalty !== currentPenalty) continue;
        for (const [dx, dy] of this.NB) {
          const prow = row + dy, pcol = col + dx;
          if (prow >= 0 && prow < W && pcol >= 0 && pcol < W &&
              wallPenalty[prow * W + pcol] === 0) {
            wallPenalty[prow * W + pcol] = penalty / FACTOR;
            nextFrontier.push([pcol, prow]);
          }
        }
      }
      frontier = nextFrontier;
      currentPenalty /= FACTOR;
    }

    // 终点线播种
    const gl = stretchedGoal;
    const gx0 = Math.round(gl.x * W), gy0 = Math.round(gl.y * W);
    const gw = Math.max(1, Math.round(gl.w * W)), gh = Math.max(1, Math.round(gl.h * W));
    let lapCheckPos = null;
    frontier = [];
    for (let irow = 0; irow < gh; irow++) {
      for (let icol = 0; icol < gw; icol++) {
        const row = gy0 + irow, col = gx0 + icol;
        if (row < 1 || row >= W - 1 || col < 1 || col >= W - 1) continue;
        this.gradient[row * W + col] = 0;
        this.position[row * W + col] = 0;
        if (landMatrix[(row + 1) * W + col] === Land.TRACK) {
          const wgt = this.weightLand(Land.TRACK) + wallPenalty[(row + 1) * W + col];
          this.gradient[(row + 1) * W + col] = wgt;
          this.position[(row + 1) * W + col] = 1;
          frontier.push([col, row + 1, wgt, 1]);
        }
        if ((irow === 0) && landMatrix[(row - 1) * W + col] === Land.TRACK)
          lapCheckPos = [col, row - 1];
      }
    }

    // BFS全图填充
    while (frontier.length) {
      const nextFrontier = [];
      for (const [col, row, pw, pp] of frontier) {
        for (const [dx, dy] of this.NB) {
          const nrow = row + dy, ncol = col + dx;
          if (nrow < 0 || nrow >= W || ncol < 0 || ncol >= W) continue;
          const ni = nrow * W + ncol;
          const weight = pw + this.weightLand(landMatrix[ni]) + wallPenalty[ni];
          const position = pp + 1;
          if (this.gradient[ni] === -2 || this.gradient[ni] > weight) {
            this.gradient[ni] = weight;
            this.position[ni] = position;
            let found = false;
            for (const e of nextFrontier) {
              if (e[0] === ncol && e[1] === nrow) { e[2] = weight; e[3] = position; found = true; break; }
            }
            if (!found) nextFrontier.push([ncol, nrow, weight, position]);
          }
        }
      }
      frontier = nextFrontier;
    }

    // lapCheck = 终点正上方格(绕环一周后到达)的位置值-10。
    // 该值即正向过线时梯度的跳变量，减10留余量保证 laps++ 检测可靠。
    let maxPos = 0;
    for (let i = 0; i < N; i++) if (this.position[i] > maxPos) maxPos = this.position[i];
    const lapPosVal = lapCheckPos ? this.position[lapCheckPos[1] * W + lapCheckPos[0]] : -1;
    this.lapCheck = lapPosVal > 50 ? (lapPosVal - 10) : Math.max(50, maxPos - 10);
    this.maxValue = this.lapCheck + 10;
  },

  posValue(x, y) {
    if (!this.position) return -1;   // Battle Course 没有圈速梯度
    const col = Math.min(127, Math.max(0, x * 128 | 0));
    const row = Math.min(127, Math.max(0, y * 128 | 0));
    return this.position[row * 128 + col];
  },

  /* 下一步方向（忠实移植 getNextDirection） */
  getNextDirection(x, y) {
    if (!this.gradient) return { x: 0, y: 0 };   // Battle AI 走追击逻辑，不走梯度
    const row = Math.min(126, Math.max(1, y * 128 | 0));
    const col = Math.min(126, Math.max(1, x * 128 | 0));
    let best = this.gradient[row * 128 + col];
    if (best === 0) return { x: 0, y: -1 / 128 };   // 终点线：向上
    const NB = [[0,-1],[-1,0],[0,1],[1,0],[1,-1],[1,1],[-1,1],[-1,-1]];
    let bestV = -1, bi = 0;
    for (let k = 0; k < 8; k++) {
      const v = this.gradient[(row + NB[k][1]) * 128 + (col + NB[k][0])];
      if (bestV === -1 || (v < bestV && v !== -1 && !(v === 0 && NB[k][1] === 1))) {
        bestV = v; bi = k;
      }
    }
    return { x: NB[bi][0] / 128, y: NB[bi][1] / 128 };
  }
};





