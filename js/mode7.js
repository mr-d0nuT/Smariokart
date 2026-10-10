/* ============================================================
 * Süper Mario Kart Web - Mode 7 渲染器
 * 忠实移植 map.cpp::mode7() 的逐像素透视采样
 * ============================================================ */
'use strict';

const M7 = {
  // Proporciones de pantalla: Pantalla de juego más alta y minimapa 3D compacto
  SPLIT_Y: 320,                       // Línea divisoria en y=320 (el juego ocupa el 71.4% de la altura de 448px)
  SKY_HEIGHT: 44,                     // Altura del cielo: 44px
  CIRCUIT_HEIGHT: 276,                // Altura del circuito Mode 7: 276px (¡50% más alto que los 184px anteriores!)
  MINIMAP_HEIGHT: 128,                // Altura del minimapa 3D: 128px (más pequeño y estilizado)
  SKY_HEIGHT_PCT: 44 / 448,
  CIRCUIT_HEIGHT_PCT: 276 / 448,
  MINIMAP_HEIGHT_PCT: 128 / 448,

  FOV_HALF: 0.5,
  CLIP_NEAR: 0.0005,
  CLIP_FAR: 0.045,
  CAM_2_PLAYER_DST: 46,

  /* 把canvas转为可直接采样的像素数据 */
  sourceData(canvas) {
    const ctx = canvas.getContext('2d');
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { data: d.data, w: canvas.width, h: canvas.height };
  },

  /* ================= 阶段2：定点仿射渲染核心（RESTORE_PLAN B1/B2） =================
   * 灵感来自 SNES PPU Mode7 的逐行矩阵机制（见 docs/research/ppu-mode7.md）：
   * 每扫描线一组 {A,C,X,Y}，像素采样公式（PPU 风格定点）：
   *   tex = ((A*(x-half) + X) >> 8, (C*(x-half) + Y) >> 8)
   * 与浮点路径共用同一近/远端几何，量化误差 ≤1 texel。 */

  /* 相机→逐行参数表。与 render() 的近远端点插值保持同一几何，保证观感连续。
   * 返回 {rows:Int32Array(dstH*4), halfX}：每行4元素 [A,C,X,Y] */
  buildRowTable(dstW, dstH, pos, angle, fovHalf, clipNear, clipFar, perspective) {
    const fovMin = angle - fovHalf, fovMax = angle + fovHalf;
    const cMinX = Math.cos(fovMin), cMinY = Math.sin(fovMin);
    const cMaxX = Math.cos(fovMax), cMaxY = Math.sin(fovMax);
    const far1x = pos.x + cMinX * clipFar, far1y = pos.y + cMinY * clipFar;
    const far2x = pos.x + cMaxX * clipFar, far2y = pos.y + cMaxY * clipFar;
    const near1x = pos.x + cMinX * clipNear, near1y = pos.y + cMinY * clipNear;
    const near2x = pos.x + cMaxX * clipNear, near2y = pos.y + cMaxY * clipNear;
    const rows = new Int32Array(dstH * 4);
    const half = dstW >> 1;
    for (let y = 0; y < dstH; y++) {
      const sampleDepth = (y + 1) / dstH;
      let sx0, sy0, dx, dy;
      if (perspective) {
        const inv = 1 / sampleDepth;
        sx0 = near1x + (far1x - near1x) * inv;
        sy0 = near1y + (far1y - near1y) * inv;
        dx = (near2x + (far2x - near2x) * inv) - sx0;
        dy = (near2y + (far2y - near2y) * inv) - sy0;
      } else {
        const t = 1 - sampleDepth;
        sx0 = near1x + (far1x - near1x) * t;
        sy0 = near1y + (far1y - near1y) * t;
        dx = (near2x + (far2x - near2x) * t) - sx0;
        dy = (near2y + (far2y - near2y) * t) - sy0;
      }
      // dx/dy 是整条扫描线从左到右的跨度；每像素步长必须再除以 dstW。
      // 旧实现直接把整行跨度当成单像素步长，导致横向放大约512倍：
      // 赛道被压成最左侧的一条窄线，其余像素都采样到地图外的纯色 edge。
      const stepX = dx / dstW, stepY = dy / dstW;
      // 以屏幕中心为原点：texel(h) = center + step*h
      const bx = (sx0 + stepX * half) * 1024;   // 世界[0,1]→1024 texel
      const by = (sy0 + stepY * half) * 1024;
      const A = Math.round(stepX * 1024 * 256); // 8.8 定点：每像素增量
      const C = Math.round(stepY * 1024 * 256);
      const o = y * 4;
      rows[o] = A; rows[o + 1] = C;
      // X/Y 存屏幕中心处 texel 坐标的 8.8 定点值（与 A/C 同域，采样时统一 >>8）
      rows[o + 2] = Math.round(bx * 256);
      rows[o + 3] = Math.round(by * 256);
    }
    return { rows, half };
  },

  /* 定点采样核：输入 buildRowTable 结果，输出与浮点路径同构的 ImageData。
   * mosaic>1 时按块采样复现原版 PPU 马赛克效果（雷击/缩小惩罚演出）。
   * 出界行为与浮点路径一致（图内 clamp / 图外 edge 平铺或黑）。 */
  renderFixed(dst, dstW, dstH, table, src, edge, mosaic = 0) {
    const out = dst.data;
    const sd = src.data, sw = src.w, sh = src.h;
    const ed = edge ? edge.data : null;
    const EDGE = 8;
    const { rows, half } = table;
    const M = Math.max(1, mosaic | 0);
    for (let y = 0; y < dstH; y += M) {
      const o = y * 4;
      const A = rows[o], C = rows[o + 1];
      const bh = Math.min(M, dstH - y);
      let tx = rows[o + 2] - A * half;   // 从 x=0 起算
      let ty = rows[o + 3] - C * half;
      for (let x = 0; x < dstW; x += M) {
        // 块中心采样（马赛克开启时整块共用一个 texel，模拟PPU马赛克合并感）
        const step = Math.round(A * Math.min(M, dstW - x) / 256);
        const mx = tx >> 8, my = ty >> 8;
        const inMap = mx >= 0 && mx < sw && my >= 0 && my < sh;
        let col0, col1, col2;
        if (inMap) {
          const q = (my * sw + mx) * 4;
          col0 = sd[q]; col1 = sd[q + 1]; col2 = sd[q + 2];
        } else if (ed) {
          const ex = ((mx % 8) + 8) % 8, ey = ((my % 8) + 8) % 8;
          const q = (ey * 8 + ex) * 4;
          col0 = ed[q]; col1 = ed[q + 1]; col2 = ed[q + 2];
        } else {
          col0 = col1 = col2 = 0;
        }
        const bw = Math.min(M, dstW - x);
        for (let yy = y, ye = Math.min(dstH, y + bh); yy < ye; yy++) {
          let pp = (yy * dstW + x) * 4;
          for (let i = 0; i < bw; i++, pp += 4) {
            out[pp] = col0; out[pp + 1] = col1; out[pp + 2] = col2; out[pp + 3] = 255;
          }
        }
        tx += A * bw; ty += C * bw;
        x += bw - 1;   // for 的 ++x 补偿
      }
      y += bh - 1;     // 外层 ++y 补偿
    }
  },

  dumpTable(table) {
    return JSON.stringify({ half: table.half, rows: Array.from(table.rows) });
  },
  loadTable(json) {
    const o = JSON.parse(json);
    return { half: o.half, rows: Int32Array.from(o.rows) };
  },

  /* Mode7 核心渲染：把地图采样写入 dst(ImageData)
   * pos:{x,y} 角度制弧度 fovHalf 近远裁剪 perspective透视开关 */
  render(dst, dstW, dstH, pos, angle, fovHalf, clipNear, clipFar,
         perspective, src, edge) {
    const out = dst.data;
    const fovMin = angle - fovHalf, fovMax = angle + fovHalf;
    const cMinX = Math.cos(fovMin), cMinY = Math.sin(fovMin);
    const cMaxX = Math.cos(fovMax), cMaxY = Math.sin(fovMax);

    const far1x = pos.x + cMinX * clipFar, far1y = pos.y + cMinY * clipFar;
    const far2x = pos.x + cMaxX * clipFar, far2y = pos.y + cMaxY * clipFar;
    const near1x = pos.x + cMinX * clipNear, near1y = pos.y + cMinY * clipNear;
    const near2x = pos.x + cMaxX * clipNear, near2y = pos.y + cMaxY * clipNear;

    const sd = src.data, sw = src.w, sh = src.h;
    const ed = edge ? edge.data : null;
    const EDGE = 8, MAPW = 1024;
    const edgeScale = MAPW / EDGE;   // 128

    for (let y = 0; y < dstH; y++) {
      const sampleDepth = (y + 1) / dstH;
      let sx0, sy0, dx, dy;
      if (perspective) {
        const inv = 1 / sampleDepth;
        sx0 = near1x + (far1x - near1x) * inv;
        sy0 = near1y + (far1y - near1y) * inv;
        dx = (near2x + (far2x - near2x) * inv) - sx0;
        dy = (near2y + (far2y - near2y) * inv) - sy0;
      } else {
        const t = 1 - sampleDepth;
        sx0 = near1x + (far1x - near1x) * t;
        sy0 = near1y + (far1y - near1y) * t;
        dx = (near2x + (far2x - near2x) * t) - sx0;
        dy = (near2y + (far2y - near2y) * t) - sy0;
      }
      let o = y * dstW * 4;
      for (let x = 0; x < dstW; x++) {
        const sw2 = x / dstW;
        const mx = sx0 + dx * sw2;
        const my = sy0 + dy * sw2;
        if (mx >= 0 && mx <= 1 && my >= 0 && my <= 1) {
          const px = Math.min(sw - 1, (mx * sw) | 0);
          const py = Math.min(sh - 1, (my * sh) | 0);
          const p = (py * sw + px) * 4;
          out[o] = sd[p]; out[o + 1] = sd[p + 1];
          out[o + 2] = sd[p + 2]; out[o + 3] = 255;
        } else if (ed) {
          // 边缘贴图：按8px瓦片平铺
          let ex = mx * edgeScale; ex -= Math.floor(ex);
          let ey = my * edgeScale; ey -= Math.floor(ey);
          const ep = ((Math.min(7, (ey * EDGE) | 0)) * EDGE +
                      (Math.min(7, (ex * EDGE) | 0))) * 4;
          out[o] = ed[ep]; out[o + 1] = ed[ep + 1];
          out[o + 2] = ed[ep + 2]; out[o + 3] = 255;
        } else {
          out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 255;
        }
        o += 4;
      }
    }
  },

  /* 天空视差采样起点（忠实移植 skyTextures） */
  skySampleX(modAngle, texW, isFront) {
    if (isFront) {
      const a = ((modAngle % Math.PI) + Math.PI) % Math.PI;
      return (a * texW / Math.PI) | 0;
    }
    const a = ((modAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return (a * texW / (2 * Math.PI)) | 0;
  },

  /* 地图坐标 -> 屏幕投影（忠实移植 mapToScreen）
   * 返回 {x, y, z, ok}，x/y为0-1屏幕比例 */
  mapToScreen(playerPos, playerAngle, mapCoords) {
    const camX = playerPos.x - Math.cos(playerAngle) * (this.CAM_2_PLAYER_DST / 1024);
    const camY = playerPos.y - Math.sin(playerAngle) * (this.CAM_2_PLAYER_DST / 1024);

    const relX = mapCoords.x - camX, relY = mapCoords.y - camY;
    const relMod = Math.sqrt(relX * relX + relY * relY);
    const fwdX = Math.cos(playerAngle), fwdY = Math.sin(playerAngle);
    const cosFov = Math.cos(this.FOV_HALF);
    const sinFov = Math.sqrt(1 - cosFov * cosFov);
    const z = fwdX * relX + fwdY * relY;
    const cos = z / relMod;
    const sin = (fwdX * relY - fwdY * relX) / relMod;
    const y = this.CLIP_FAR * cosFov / (relMod * cos);
    const x = (sin + sinFov) / (2 * sinFov);
    return { x, y, z, ok: x >= -0.1 && x < 1.1 && y >= 0 && y <= 2.0 };
  },

  /* 精灵缩放（忠实移植 1/(3.6*ln(1.02+0.8z))） */
  spriteScale(z) {
    return 1 / (3.6 * Math.log(1.02 + 0.8 * z));
  },

  /* 预渲染墙物体贴图切片 */
  wallSprites: null,
  sparkleFrames: null,
  prepareSprites() {
    this.wallSprites = {
      pipeGreen: Assets.slice('wall_misc', { x:2, y:53, w:24, h:32 }),
      pipeOrange: Assets.slice('wall_misc', { x:158, y:53, w:24, h:32 }),
      thwomp: Assets.slice('wall_misc', { x:2, y:20, w:24, h:32 }),
      thwompSuper: Assets.slice('wall_misc', { x:158, y:20, w:24, h:32 })
    };
    this.sparkleFrames = [];
    for (let i = 0; i < 4; i++)
      this.sparkleFrames.push(Assets.slice('particles', { x: 1 + i * 25, y: 85, w: 24, h: 16 }));
  }
};
