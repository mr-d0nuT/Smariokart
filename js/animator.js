/* ============================================================
 * Süper Mario Kart Web - 车手精灵动画
 * 移植 driveranimator.cpp：12帧驾驶图 + 32向视角映射
 * ============================================================ */
'use strict';

// 360°->12帧 映射表（第二半为镜像）
const HIT_TEX_IDX = [0,1,2,3,4,5,6,7,7,8,8,9,9,10,10,11,
                     11,10,10,9,9,8,8,7,7,6,5,4,3,2,1,0];

class Animator {
  constructor(driverFile) {
    const sheet = Assets.img(driverFile);
    this.driving = [];
    for (let i = 0; i < 12; i++)
      this.driving.push(Assets.slice(driverFile, { x: 32 * i, y: 32, w: 32, h: 32 }));
    this.others = [];
    for (let i = 0; i < 5; i++)
      this.others.push(Assets.slice(driverFile, { x: 32 * i, y: 0, w: 32, h: 32 }));

    // 漂移尘土粒子（按地面材质分3种）
    this.dustFrames = [];
    for (let i = 0; i < 3; i++)
      this.dustFrames.push(Assets.slice('particles', { x: 1 + 26 * i, y: 1, w: 16, h: 16 }));
    this.grassFrames = [
      Assets.slice('particles', { x: 1, y: 26, w: 16, h: 8 }),
      Assets.slice('particles', { x: 1, y: 35, w: 16, h: 8 })
    ];

    this.state = 'fwd';        // fwd | left | right | hit | fall
    this.drifting = false;
    this.mirror = false;
    this.starTime = 0;
    this.smallTime = 0;
    this.smashTime = 0;
    this.hitPos = 0;
    this.fallScale = 1;
    this.bobTime = 0;
  }

  goForward() { this.state = 'fwd'; this.drifting = false; }
  goRight(drift) { this.state = 'right'; this.drifting = drift; }
  goLeft(drift) { this.state = 'left'; this.drifting = drift; }
  hit() { this.state = 'hit'; this.drifting = false; }
  fall() { this.state = 'fall'; }

  /* 小地图/巡游用帧（忠实移植 getMinimapSprite：内部+π/2，angle>π才镜像）
   * 注意与 viewFrame 的镜像规则不同——标题巡游必须用本方法。 */
  minimapFrame(angle) {
    let a = (angle + Math.PI / 2) % (2 * Math.PI);
    if (a < 0) a += 2 * Math.PI;
    for (let i = 1; i <= 32; i++) {
      const limit = i === 32 ? Infinity : ((i - 0.5) * 2 * Math.PI) / 32;
      if (a <= limit)
        return { frame: HIT_TEX_IDX[i - 1], mirror: a > Math.PI };
    }
    return { frame: 0, mirror: false };
  }

  /* 玩家帧选择（移植 update 的 GO_RIGHT/GO_LEFT 分支） */
  pickFrame(speedTurn) {
    if (this.state === 'hit') {
      this.hitPos = (this.hitPos + 2) % 32;
      return { frame: HIT_TEX_IDX[this.hitPos], mirror: this.hitPos > 16 };
    }
    if (this.state === 'fall') return { frame: 0, mirror: false };
    if (this.state === 'right') {
      if (speedTurn < 0.25) return { frame: 1, mirror: false };
      if (speedTurn < 0.5) return { frame: 2, mirror: false };
      return { frame: this.drifting ? 4 : 3, mirror: false };
    }
    if (this.state === 'left') {
      if (speedTurn > -0.25) return { frame: 1, mirror: true };
      if (speedTurn > -0.5) return { frame: 2, mirror: true };
      return { frame: this.drifting ? 4 : 3, mirror: true };
    }
    return { frame: 0, mirror: false };
  }

  /* 对手车视角帧（移植 setViewSprite：相对角->32向查表） */
  viewFrame(relAngle) {
    let a = relAngle % (2 * Math.PI);
    if (a < 0) a += 2 * Math.PI;
    if (this.state === 'hit')
      return { frame: HIT_TEX_IDX[this.hitPos], mirror: this.hitPos > 16 };
    // 32向查表：i∈[1,32]，避免越界
    for (let i = 1; i <= 32; i++) {
      const limit = i === 32 ? Infinity : ((i - 0.5) * 2 * Math.PI) / 32;
      if (a <= limit)
        return { frame: HIT_TEX_IDX[i - 1], mirror: a < Math.PI };
    }
    return { frame: 0, mirror: false };
  }

  update(dt, speedForward, height) {
    if (this.starTime > 0) this.starTime -= dt;
    if (this.smallTime > 0) this.smallTime -= dt;
    if (this.smashTime > 0) this.smashTime -= dt;
    if (this.state === 'fall') this.fallScale *= 0.92;
    // 行驶颠簸
    this.bobTime += dt * (2 + speedForward * 260);
  }

  reset() {
    this.state = 'fwd'; this.drifting = false; this.mirror = false;
    this.starTime = 0;
    this.smallTime = 0;
    this.smashTime = 0;
    this.hitPos = 0;
    this.fallScale = 1;
    this.bobTime = 0;
  }

  /* 绘制：x中心 y底部 baseScale为像素比例(2=玩家) */
  draw(ctx, x, y, baseScale, opts = {}) {
    const f = opts.view !== undefined ? opts.view : this.pickFrame(opts.speedTurn || 0);
    const img = this.driving[f.frame];
    let w = 32 * baseScale, h = 32 * baseScale;
    if (this.smallTime > 0) { w *= 0.5; h *= 0.5; }
    if (this.smashTime > 0) h *= 0.5;
    if (this.state === 'fall') { w *= this.fallScale; h *= this.fallScale; }
    const bob = (opts.height || 0) > 0 ? 0 :
      Math.sin(this.bobTime * Math.PI * 2) * 0.4 * baseScale;

    ctx.save();
    ctx.translate(x, y + bob);
    if (f.mirror) ctx.scale(-1, 1);
    if (this.starTime > 0) ctx.filter = `hue-rotate(${(this.starTime * 720) % 360}deg) saturate(2)`;
    ctx.drawImage(img, -w / 2, -h, w, h);
    ctx.restore();
  }

  /* 漂移/草地尘土 */
  drawParticles(ctx, x, y, baseScale, material, moving) {
    if (!moving) return;
    const t = performance.now() / 100;
    if (this.drifting) {
      const mat = material === Material.STONE ? 1 :
                  (material === Material.GRASS || material === Material.DIRT) ? 0 : 2;
      const img = this.dustFrames[Math.floor(t % 3)] || this.dustFrames[0];
      const s = 16 * baseScale * 0.55;
      const off = 32 * baseScale * 0.22;
      ctx.globalAlpha = 0.75;
      ctx.drawImage(img, x - off - s / 2, y - s / 2, s, s);
      ctx.drawImage(img, x + off - s / 2, y - s / 2, s, s);
      ctx.globalAlpha = 1;
    } else if (material === Material.GRASS && this.state === 'fwd') {
      const img = this.grassFrames[Math.floor(t % 2)];
      const s = 16 * baseScale * 0.7;
      ctx.globalAlpha = 0.8;
      ctx.drawImage(img, x - s * 0.65, y - s * 0.3, s, s * 0.5);
      ctx.drawImage(img, x + s * 0.65 - s, y - s * 0.3, s, s * 0.5);
      ctx.globalAlpha = 1;
    }
  }
}
