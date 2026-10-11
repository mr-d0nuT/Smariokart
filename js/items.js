/* ============================================================
 * Süper Mario Kart Web - 道具系统
 * 移植 item.cpp / banana / greenshell / redshell / questionpanel
 * ============================================================ */
'use strict';

const PowerUp = { NONE:0, MUSHROOM:1, COIN:2, STAR:3, BANANA:4,
                  GREEN_SHELL:5, RED_SHELL:6, THUNDER:7 };

// 问号面板抽奖表（按排名，忠实移植）
const ITEMS_1  = ['BANANA','BANANA','BANANA','BANANA','BANANA','BANANA','COIN','COIN','COIN','COIN','COIN','COIN','GREEN_SHELL','GREEN_SHELL','RED_SHELL','MUSHROOM'];
const ITEMS_23 = ['BANANA','RED_SHELL','RED_SHELL','RED_SHELL','GREEN_SHELL','RED_SHELL','BANANA','BANANA','BANANA','MUSHROOM','MUSHROOM','GREEN_SHELL','COIN','COIN','COIN','GREEN_SHELL'];
const ITEMS_45 = ['RED_SHELL','RED_SHELL','RED_SHELL','STAR','GREEN_SHELL','COIN','BANANA','BANANA','BANANA','MUSHROOM','MUSHROOM','MUSHROOM','COIN','GREEN_SHELL','GREEN_SHELL','COIN'];
const ITEMS_67 = ['MUSHROOM','MUSHROOM','MUSHROOM','MUSHROOM','COIN','BANANA','RED_SHELL','RED_SHELL','RED_SHELL','STAR','GREEN_SHELL','STAR','THUNDER','GREEN_SHELL','BANANA','COIN'];
const ITEMS_8  = ['MUSHROOM','MUSHROOM','MUSHROOM','MUSHROOM','MUSHROOM','RED_SHELL','RED_SHELL','RED_SHELL','RED_SHELL','STAR','STAR','STAR','THUNDER','THUNDER','GREEN_SHELL','COIN'];

function rollItem(rank) {
  const table = rank === 0 ? ITEMS_1 : rank <= 2 ? ITEMS_23 :
                rank <= 4 ? ITEMS_45 : rank <= 6 ? ITEMS_67 : ITEMS_8;
  return PowerUp[table[Math.random() * table.length | 0]];
}

const ITEM_SPRITES = {};
function initItemSprites() {
  ITEM_SPRITES.banana = Assets.slice('wall_misc', { x:2, y:129, w:16, h:16 });
  ITEM_SPRITES.green  = Assets.slice('wall_misc', { x:83, y:129, w:16, h:16 });
  ITEM_SPRITES.red    = Assets.slice('wall_misc', { x:172, y:129, w:16, h:16 });
}

/* ---------- 道具实体 ---------- */
class BaseItem {
  constructor(pos, visualRadius, hitboxRadius, height) {
    this.position = { x: pos.x, y: pos.y };
    this.visualRadius = visualRadius;
    this.hitboxRadius = hitboxRadius;   // 单位:瓦片
    this.height = height;
    this.used = false;
    this.zOrder = 0;
  }
}
const SHELL_FWD = (5 + 1.5 + 0.1) / 1024;

class Banana extends BaseItem {
  constructor(pos, angle, forwardThrow, playerHeight) {
    super(pos, 0.05, 0.8, playerHeight + 1);
    const fx = Math.cos(angle) * SHELL_FWD, fy = Math.sin(angle) * SHELL_FWD;
    const m = forwardThrow ? 1 : -1;
    this.position.x += fx * m; this.position.y += fy * m;
    this.vel = forwardThrow
      ? { x: fx * 150, y: fy * 150, z: 240 }
      : { x: fx * m, y: fy * m, z: 0 };
  }
  update(dt) {
    if (this.height === 0) { this.vel = { x:0, y:0, z:0 }; return; }
    this.position.x += this.vel.x * dt;
    this.position.y += this.vel.y * dt;
    this.height = Math.max(0, this.height + this.vel.z * dt);
    this.vel.z += -882 * dt;
    if (this.height === 0 && GameMap.getLand(this.position.x, this.position.y) === Land.OUTER) this.used = true;
    if (this.position.x < 0 || this.position.x > 1 || this.position.y < 0 || this.position.y > 1) this.used = true;
  }
  sprite() { return ITEM_SPRITES.banana; }
}

class GreenShell extends BaseItem {
  constructor(pos, angle, forwardThrow, playerHeight) {
    super(pos, 0.05, 5, playerHeight);
    const a = forwardThrow ? angle : angle + Math.PI;
    const fx = Math.cos(a) * SHELL_FWD, fy = Math.sin(a) * SHELL_FWD;
    this.position.x += fx; this.position.y += fy;
    this.vel = { x: fx * 80, y: fy * 80 };
    this.verticalSpeed = 0;
    this.lives = 6;
  }
  update(dt) {
    for (let i = 0; i < 3; i++) this.march(dt / 3);
  }
  march(dt) {
    const oldX = this.position.x, oldY = this.position.y;
    this.position.x += this.vel.x * dt;
    this.position.y += this.vel.y * dt;
    this.verticalSpeed += -980 * dt;
    this.height = Math.max(0, this.height + this.verticalSpeed * dt);
    if (this.position.x < 0 || this.position.x > 1 || this.position.y < 0 || this.position.y > 1) {
      this.used = true; return;
    }
    if (this.height > 0) return;
    const land = GameMap.getLand(this.position.x, this.position.y);
    if (land === Land.BLOCK && this.lives <= 0) {
      this.used = true;
    } else if (land === Land.BLOCK) {
      // 反射：判断撞的是横边还是竖边
      const dx = (this.position.x - oldX) / 20, dy = (this.position.y - oldY) / 20;
      let bx = oldX, by = oldY;
      let guard = 0;
      while (GameMap.getLand(bx, by) !== Land.BLOCK && guard++ < 100) { bx += dx; by += dy; }
      const bcx = ((bx * 128 | 0) + 0.5) / 128, bcy = ((by * 128 | 0) + 0.5) / 128;
      if (Math.abs(bcx - oldX) > Math.abs(bcy - oldY)) this.vel.x *= -1;
      else this.vel.y *= -1;
      this.position.x = oldX; this.position.y = oldY;
      this.lives--;
    } else if (land === Land.RAMP_H || land === Land.RAMP_V) {
      this.verticalSpeed = 150;
    } else if (land === Land.OUTER) {
      this.used = true;
    }
  }
  sprite() { return ITEM_SPRITES.green; }
}

class RedShell extends BaseItem {
  constructor(pos, target, angle, forwardThrow, playerHeight) {
    super(pos, 0.05, 1.2, playerHeight);
    const a = forwardThrow ? angle : angle + Math.PI;
    const fx = Math.cos(a) * SHELL_FWD, fy = Math.sin(a) * SHELL_FWD;
    this.position.x += fx; this.position.y += fy;
    const shellSpeed = 0.52;
    this.vel = { x: Math.cos(a) * shellSpeed, y: Math.sin(a) * shellSpeed };
    this.target = forwardThrow ? target : null;
    this.inactiveFrames = 8;
    this.life = 10.0;
  }
  update(dt) {
    if (this.inactiveFrames > 0) this.inactiveFrames--;
    this.life -= dt;
    if (this.life <= 0) { this.used = true; return; }

    const shellSpeed = 0.52;
    if (!this.target || this.target.finished || (this.target.balloons !== undefined && this.target.balloons <= 0)) {
      // Sin objetivo delante: vuela hacia adelante guiado suavemente por el trazado de la pista
      const nd = AI.getNextDirection(this.position.x, this.position.y);
      if (nd && isFinite(nd.x) && isFinite(nd.y) && (nd.x !== 0 || nd.y !== 0)) {
        const trackAng = Math.atan2(nd.y, nd.x);
        const curAng = Math.atan2(this.vel.y, this.vel.x);
        const dAng = normAngle(trackAng - curAng);
        const maxTurn = 6.0 * dt;
        const newAng = curAng + Math.max(-maxTurn, Math.min(maxTurn, dAng));
        this.vel.x = Math.cos(newAng) * shellSpeed;
        this.vel.y = Math.sin(newAng) * shellSpeed;
      }
      this.position.x += this.vel.x * dt;
      this.position.y += this.vel.y * dt;
    } else {
      // Persecución activa y precisa del rival más próximo delante
      const dx = this.target.position.x - this.position.x;
      const dy = this.target.position.y - this.position.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 0.012) {
        // En rango directo de impacto
        this.position.x = this.target.position.x;
        this.position.y = this.target.position.y;
      } else {
        const targetAng = Math.atan2(dy, dx);
        let desiredAng = targetAng;
        if (dist > 0.18) {
          const nd = AI.getNextDirection(this.position.x, this.position.y);
          if (nd && isFinite(nd.x) && isFinite(nd.y)) {
            const trackAng = Math.atan2(nd.y, nd.x);
            const angDiff = normAngle(targetAng - trackAng);
            desiredAng = trackAng + angDiff * 0.45;
          }
        }
        const curAng = Math.atan2(this.vel.y, this.vel.x);
        const dAng = normAngle(desiredAng - curAng);
        // Si el objetivo de repente queda detrás, no girar en redondo hacia atrás
        const maxTurn = (Math.abs(dAng) < Math.PI * 0.75) ? (14.0 * dt) : (4.0 * dt);
        const newAng = curAng + Math.max(-maxTurn, Math.min(maxTurn, dAng));
        this.vel.x = Math.cos(newAng) * shellSpeed;
        this.vel.y = Math.sin(newAng) * shellSpeed;
        this.position.x += this.vel.x * dt;
        this.position.y += this.vel.y * dt;
      }
    }

    if (this.position.x < 0 || this.position.x > 1 || this.position.y < 0 || this.position.y > 1) {
      this.used = true;
    } else {
      const land = GameMap.getLand(this.position.x, this.position.y);
      if (land === Land.BLOCK) {
        this.used = true;
      }
    }
  }
  sprite() { return ITEM_SPRITES.red; }
}

/* ---------- 使用道具（移植 Item::useItem） ---------- */
function useItem(user, race, isFront) {
  const pu = user.powerUp;
  if (pu === PowerUp.NONE || !user.canDrive()) return;
  if (GameClock.now() < user.canUseItemAt) return;
  switch (pu) {
    case PowerUp.BANANA:
      race.items.push(new Banana(user.position, user.posAngle, isFront, user.height));
      race.items[race.items.length - 1].ownerChar = user.charIdx;
      if (user.isRealPlayer) Sound.play('sfx_throw');
      break;
    case PowerUp.COIN:
      user.addCoin(2);
      break;
    case PowerUp.GREEN_SHELL:
      race.items.push(new GreenShell(user.position, user.posAngle, isFront, user.height));
      race.items[race.items.length - 1].ownerChar = user.charIdx;
      if (user.isRealPlayer) Sound.play('sfx_throw');
      break;
    case PowerUp.RED_SHELL: {
      let target = null;
      if (isFront) {
        if (race.isBattle) {
          let best = Infinity;
          for (const d of race.drivers) {
            if (d === user || (d.balloons !== undefined && d.balloons <= 0)) continue;
            const dd = (d.position.x - user.position.x) ** 2 + (d.position.y - user.position.y) ** 2;
            if (dd < best) { best = dd; target = d; }
          }
        } else {
          // Buscar el rival más próximo que esté DELANTE del usuario
          const userVal = (user.lastGradient >= 0) ? user.lastGradient : AI.posValue(user.position.x, user.position.y);
          const userProg = user.laps * 1024 + (1024 - userVal);
          const fwdX = Math.cos(user.posAngle), fwdY = Math.sin(user.posAngle);

          let bestDist = Infinity;
          for (const d of race.drivers) {
            if (d === user || d.finished) continue;
            const dx = d.position.x - user.position.x;
            const dy = d.position.y - user.position.y;
            const dotFwd = dx * fwdX + dy * fwdY;
            // Solo rivales que estén geométricamente por delante en el vector visual/marcha
            if (dotFwd > 0.005) {
              const distSq = dx * dx + dy * dy;
              if (distSq < bestDist) {
                bestDist = distSq;
                target = d;
              }
            }
          }
        }
      }
      race.items.push(new RedShell(user.position, target, user.posAngle, isFront, user.height));
      race.items[race.items.length - 1].ownerChar = user.charIdx;
      if (user.isRealPlayer) Sound.play(isFront ? 'sfx_redshell' : 'sfx_throw');
      break;
    }
    case PowerUp.MUSHROOM:
      user.applyMushroom();
      if (user.isRealPlayer) Sound.play('sfx_grow');
      break;
    case PowerUp.STAR:
      user.applyStar();
      break;
    case PowerUp.THUNDER: {
      // 从最后一名逆序，所有排名高于使用者的车手被雷击
      let duration = 5, apply = false;
      const sorted = [...race.drivers].sort((a, b) => a.rank - b.rank);
      for (let i = sorted.length - 1; i >= 0; i--) {
        const d = sorted[i];
        if (!apply && d === user) apply = true;
        else if (apply && !d.isImmune()) { d.applyThunder(duration); duration += 1.5; }
      }
      Sound.play('sfx_lightning');
      race.flash = 0.6;
      race.mosaicT = Math.max(race.mosaicT || 0, 1.2);   // 阶段4：雷击马赛克演出
      break;
    }
  }
  user.powerUp = PowerUp.NONE;
  if (user.isRealPlayer) Gui.setItem(PowerUp.NONE);
}

/* ---------- 特殊地板物件交互（问号面板/金币） ---------- */
function interactFloorObjects(driver, race) {
  if (driver.height > 0 || !driver.canDrive()) return;
  for (const fo of GameMap.floorObjects) {
    if (fo.type !== FloorType.QUESTION_PANEL && fo.type !== FloorType.COIN) continue;
    if (fo.state !== 2) continue;
    const ox = (fo.px + fo.sw / 2) / 1024, oy = (fo.py + fo.sh / 2) / 1024;
    const dx = driver.position.x - ox, dy = driver.position.y - oy;
    if (dx * dx + dy * dy > Math.pow(10 / 1024, 2)) continue;
    if (fo.type === FloorType.COIN) {
      fo.state = 3; fo.timer = 5;
      driver.addCoin(1);
      GameMap.markCourseDirty();
    } else if (driver.powerUp === PowerUp.NONE) {
      fo.state = 3; fo.timer = 9999;   // 面板下一圈重置
      driver.powerUp = rollItem(driver.rank);
      driver.canUseItemAt = GameClock.now() + 2;
      GameMap.markCourseDirty();
      if (driver.isRealPlayer) {
        Gui.startRoulette(driver.powerUp);
        Sound.play('sfx_itemreel');
      }
    }
    break;
  }
}

/* ---------- 道具与车手碰撞 ---------- */
function itemCollisions(race) {
  for (const item of race.items) {
    if (item.used) continue;
    for (const d of race.drivers) {
      if (d.finished) continue;
      if (race.isBattle && d.balloons <= 0) continue;   // 幽灵观战不可再被击中
      // 自己刚掷出的道具不会立刻打中自己（原版行为）
      if (item.ownerChar !== undefined && item.ownerChar === d.charIdx) continue;
      if (Math.abs(item.height - d.height) > 5) continue;
      const dx = (item.position.x - d.position.x) * 128;
      const dy = (item.position.y - d.position.y) * 128;
      // reach en unidades de baldosas (kart ~0.65 + item ~0.55 ≈ 1.2 baldosas)
      const reach = Math.max(1.2, (item.hitboxRadius || 1.0) + 0.3);
      if (dx * dx + dy * dy > reach * reach) continue;
      if (d.isImmune()) { item.used = true; race.addSparkles(item.position); break; }
      d.applyHit();
      // 气球对战：道具命中计攻击者得分（击破一个气球）
      if (race.isBattle && item.ownerChar !== undefined && item.ownerChar !== d.charIdx &&
          d.wasBalloonHit) {
        race.drivers[item.ownerChar].hitsDealt++;
        d.wasBalloonHit = false;
      }
      item.used = true;
      race.addSparkles(item.position);
      break;
    }
  }
  race.items = race.items.filter(i => !i.used);
}