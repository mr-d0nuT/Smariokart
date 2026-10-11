/* ============================================================
 * Süper Mario Kart Web - 车手物理
 * 完整移植 driver.cpp：加速曲线/转向漂移/碰撞反弹/坠落救援/
 * 坡道跳跃/金币加速/圈数计费
 * ============================================================ */
'use strict';

const TAU = Math.PI * 2;
function normAngle(a) {
  a %= TAU;
  return a < 0 ? a + TAU : a;
}

// 车辆属性（mariowiki数据，与C++一致）
function makeVehicle(motor, turn, maxSpeed, weight, convex, sf) {
  const t = turn * sf / 1.5;
  return {
    motorAcceleration: motor * sf,
    maxNormalLinearSpeed: maxSpeed * sf,
    maxSpeedUpLinearSpeed: maxSpeed * sf * 2,
    maxSpeedDownLinearSpeed: maxSpeed * sf * 0.85,
    turningAcceleration: t,
    maxTurningAngularSpeed: t * 10,
    slowLandMaxLinearSpeed: maxSpeed * sf * 0.45,
    weight, convex
  };
}
const VEHICLE_TYPES = {
  BALANCED:     { m: 0.11, t: 0.14, s: 0.10200, w: 1.0, convex: false },
  ACCELERATION: { m: 0.15, t: 0.13, s: 0.10175, w: 1.0, convex: false },
  HEAVY:        { m: 0.10, t: 0.13, s: 0.10250, w: 2.0, convex: true  },
  HANDLING:     { m: 0.12, t: 0.15, s: 0.10150, w: 0.5, convex: false }
};

// 角色（顺序与原版一致）
const CHARACTERS = [
  { name: 'mario',   file: 'drivers/mario.png', type: 'BALANCED' },
  { name: 'princess',file: 'drivers/peach.png', type: 'ACCELERATION' },
  { name: 'bowser',  file: 'drivers/bowser.png',type: 'HEAVY' },
  { name: 'koopa',   file: 'drivers/koopa.png', type: 'HANDLING' },
  { name: 'luigi',   file: 'drivers/luigi.png', type: 'BALANCED' },
  { name: 'yoshi',   file: 'drivers/yoshi.png', type: 'ACCELERATION' },
  { name: 'dk',      file: 'drivers/dk.png',    type: 'HEAVY' },
  { name: 'toad',    file: 'drivers/toad.png',  type: 'HANDLING' }
];
const FAR_VISIONS = [[0,0,0,0,-1,1,1,1],[0,0,1,1,-1,-2,2,2],[1,1,1,-1,-1,-2,2,2]];
const IMPEDIMENTS = [[128,128,96,96,96,64,64,48],[96,64,64,48,48,48,32,32],[64,64,64,48,48,32,32,16]];

// 状态位
const DS = { SPEED_UP:1, MORE_SPEED_UP:2, SPEED_DOWN:4, STAR:8,
             UNCONTROLLED:16, STOPPED:32, INVISIBLE:64, SHIELD:128 };
const DUR = { SPEED_UP:1.5, MORE_SPEED_UP:0.75, SPEED_DOWN:10, STAR:10, UNCONTROLLED:1 };

const FRICTION = -0.04, BRAKE_ACC = -0.2, SLOW_LAND_ACC = -0.20;
const POS_ACC_BONUS = 0.0085, COIN_SPEED = 0.002;
const GRAVITY = -9.8 * 16;

/* 全局时钟：状态计时用。浏览器=真实时间；headless测试可替换为比赛时间
 * （C++对应StateRace::currentTime，暂停/掉帧时道具计时不会错乱） */
const GameClock = { now: () => performance.now() / 1000 };

/* 加速曲线（忠实移植 simulateSpeedGraph） */
function simulateSpeedGraph(d, accel) {
  const v = d.vehicle;
  const pct = d.speedForward / v.maxNormalLinearSpeed;
  if (v.convex) {
    if (pct < 0.25) accel += v.motorAcceleration / 2;
    else if (pct < 0.45) accel += v.motorAcceleration * (pct + 0.075);
    else if (pct < 0.95) accel += v.motorAcceleration / 2;
    else accel += (0.05 * v.maxNormalLinearSpeed) / 4;
  } else {
    if (pct < 0.45) accel += v.motorAcceleration / 2;
    else if (pct < 0.95) accel += v.motorAcceleration * (1 - pct);
    else accel += (0.05 * v.maxNormalLinearSpeed) / 4;
  }
  return accel;
}

class Driver {
  constructor(charIdx, controlType, ccIndex = 0, isRealPlayer = false) {
    this.charIdx = charIdx;
    this.char = CHARACTERS[charIdx];
    this.controlType = controlType;   // 'player' | 'ai'
    this.isRealPlayer = !!isRealPlayer;
    const vt = VEHICLE_TYPES[this.char.type];
    this.vehicle = makeVehicle(vt.m, vt.t, vt.s, vt.w, vt.convex, 2.1);
    this.animator = new Animator(this.char.file.replace('drivers/', ''));
    if (this.isRealPlayer && typeof FaceDriver !== 'undefined' && FaceDriver.active) {
      FaceDriver.applyToAnimator(this.animator, this.charIdx);
    }

    this.position = { x: 0.5, y: 0.5 };
    this.posAngle = -Math.PI / 2;
    this.flightAngle = 0;
    this.height = 0; this.speedUpwards = 0;
    this.speedForward = 0; this.speedTurn = 0;
    this.lateralSlip = 0;              // Deslizamiento lateral inercial (agarre y derrape)
    this.isDrifting = false;
    this.vectorialSpeed = { x: 0, y: 0 };
    this.collisionMomentum = { x: 0, y: 0 };

    this.state = 0;
    this.stateEnd = new Float64Array(8);
    this.coins = 0; this.laps = 0; this.maxLapSoFar = 0;
    this.lastGradient = -1; this.consecutiveGradInc = 0;
    this.goingForwards = true;
    this.rank = 0;
    this.powerUp = 0;                  // PowerUps枚举
    this.canUseItemAt = 0;
    this.falling = false; this.pressedToDrift = false; this.heightByRamp = false;
    this.farVisionMod = FAR_VISIONS[ccIndex][charIdx];
    this.impedimentMod = IMPEDIMENTS[ccIndex][charIdx];
    this.followedPath = []; this.prevLap = [];
    this.pathLastUpdated = 0;
    this.onLakitu = 0;                 // lakitu救援计时
    this.ccIndex = ccIndex;
    this.finished = false; this.finishTime = 0;
    // 气球对战（battle mode）
    this.balloons = 3;
    this.hitsDealt = 0;
    this.wasBalloonHit = false;
    this._lastRace = null;
    this.steerProgress = 0;
    this._starSound = null;
  }

  has(st) { return (this.state & st) !== 0; }
  pushState(st, endTime) { this.state |= st; this.stateEnd[Math.log2(st) | 0] = endTime; }
  popState(st) {
    if (st & DS.STAR) {
      if (this._starSound) { Sound.stop(this._starSound); this._starSound = null; }
    }
    this.state &= ~st;
    this.stateEnd[Math.log2(st) | 0] = 0;
  }
  popExpired(now) {
    for (let i = 0; i < 8; i++) {   // 含SHIELD(128)
      const st = 1 << i;
      if (this.state & st && this.stateEnd[i] < now) this.popState(st);
    }
  }
  canDrive() { return !this.has(DS.UNCONTROLLED) && !this.has(DS.STOPPED); }
  isImmune() { return this.has(DS.STAR); }

  /* ---------- 道具效果 ---------- */
  applyMushroom() {
    this.speedForward = this.vehicle.maxSpeedUpLinearSpeed;
    this.pushState(DS.SPEED_UP, GameClock.now() + DUR.SPEED_UP);
  }
  applyStar() {
    this.pushState(DS.STAR, GameClock.now() + DUR.STAR);
    this.animator.starTime = DUR.STAR;
    if (this.isRealPlayer) {
      if (this._starSound) Sound.stop(this._starSound);
      this._starSound = Sound.play('sfx_star', { loop: true, volume: 0.65 });
    }
  }
  applyThunder(duration) {
    this.speedTurn = 0;
    this.speedForward = Math.min(this.speedForward, this.vehicle.maxNormalLinearSpeed * 0.3);
    const now = GameClock.now();
    this.pushState(DS.UNCONTROLLED, now + DUR.UNCONTROLLED);
    this.pushState(DS.SPEED_DOWN, now + duration);
    this.animator.smallTime = duration;
  }
  shortJump() {
    if (this.height === 0) {
      this.flightAngle = this.posAngle;
      this.speedUpwards = 28;
      this.height = 4;
      if (this.isRealPlayer) Sound.play('sfx_jump');
    }
  }
  applyHit() {
    const nowB = GameClock.now();
    if (this.has(DS.SHIELD)) return;   // 气球对战无敌闪烁期
    if (this._lastRace && this._lastRace.isBattle && this.balloons > 0) {
      this.balloons--;
      this.wasBalloonHit = true;
      this.pushState(DS.SHIELD, nowB + 2);
      if (this.isRealPlayer) Sound.play('sfx_hit');
      if (this.balloons <= 0) {
        this.pushState(DS.STOPPED, nowB + 9999);
        this.pushState(DS.INVISIBLE, nowB + 9999);
        this.speedTurn = 0; this.speedForward = 0;
        this.animator.fall();
      }
      this.pushState(DS.UNCONTROLLED, nowB + DUR.UNCONTROLLED);
      return;
    }
    if (!this.isImmune()) {
      this.addCoin(-2);
      this.popState(DS.SPEED_UP); this.popState(DS.MORE_SPEED_UP);
      this.speedTurn = 0;
      this.speedForward = Math.min(this.speedForward, this.vehicle.maxNormalLinearSpeed * 0.6);
      if (this.isRealPlayer) Sound.play('sfx_hit');
      this.pushState(DS.UNCONTROLLED, GameClock.now() + DUR.UNCONTROLLED);
    }
  }
  applySmash() {
    const nowS = GameClock.now();
    if (this.isImmune() || this.has(DS.SHIELD)) return;   // 星星/对战无敌免砸
    this.addCoin(-3);
    this.speedTurn = 0; this.speedForward = 0;
    this.animator.smashTime = 1.2;                        // 此前误用11秒压扁变形
    if (this.isRealPlayer && nowS - (this._lastThud || -9) > 0.4) {
      Sound.play('sfx_thud');                             // 防止连续帧刷刺耳噪声
      this._lastThud = nowS;
    }
    this.pushState(DS.UNCONTROLLED, nowS + DUR.UNCONTROLLED);
  }
  addCoin(amount) {
    if (this.coins + amount > 10) amount = 10 - this.coins;
    else if (this.coins + amount < 0) amount = -this.coins;
    this.coins += amount;
    if (amount !== 0 && this.isRealPlayer) Sound.play('sfx_coin');
  }

  /* ---------- 玩家操控 (Física de giro suave, progresiva y ultra-jugable) ---------- */
  playerControls(accel, input, now, dt = 0.016) {
    const v = this.vehicle;
    if (this.height === 0) {
      if (input.accel) accel = simulateSpeedGraph(this, accel);
      if (input.brake) accel += BRAKE_ACC;
    }

    // Sensibilidad progresiva según la velocidad de avance
    const speedRatio = Math.max(0.20, Math.min(1.0, this.speedForward / (v.maxNormalLinearSpeed * 0.42)));
    const wantsDrift = !!((input.drift || this.pressedToDrift) && (this.speedForward > v.maxNormalLinearSpeed * 0.20));
    let drift = false;

    if (input.left && !input.right) {
      this.steerProgress = Math.min(1.0, this.steerProgress + dt * 3.4);
      const ramp = Math.pow(this.steerProgress, 1.25);

      if (this.pressedToDrift) {
        this.speedTurn = -v.maxTurningAngularSpeed * 0.50;
        this.pressedToDrift = false;
      }

      if (wantsDrift || Math.abs(this.speedTurn) > v.maxTurningAngularSpeed * 0.50) {
        drift = true;
      }

      const maxTurn = (drift ? (v.maxTurningAngularSpeed * 1.25) : (v.maxTurningAngularSpeed * 0.98)) * speedRatio;
      const targetTurn = -maxTurn * ramp;

      // Giro suave y progresivo con aproximación exponencial
      this.speedTurn += (targetTurn - this.speedTurn) * (1 - Math.exp(-9.5 * dt));

      const targetSlip = drift ? -0.26 : (-0.06 * Math.abs(this.speedTurn / maxTurn));
      this.lateralSlip += (targetSlip - this.lateralSlip) * 0.16;

      if (this.speedForward > v.maxNormalLinearSpeed * 0.96 && !drift) {
        accel -= v.motorAcceleration * 0.15 * Math.abs(this.speedTurn / maxTurn);
      }

      this.animator.goLeft(drift);
    } else if (input.right && !input.left) {
      this.steerProgress = Math.min(1.0, this.steerProgress + dt * 3.4);
      const ramp = Math.pow(this.steerProgress, 1.25);

      if (this.pressedToDrift) {
        this.speedTurn = v.maxTurningAngularSpeed * 0.50;
        this.pressedToDrift = false;
      }

      if (wantsDrift || Math.abs(this.speedTurn) > v.maxTurningAngularSpeed * 0.50) {
        drift = true;
      }

      const maxTurn = (drift ? (v.maxTurningAngularSpeed * 1.25) : (v.maxTurningAngularSpeed * 0.98)) * speedRatio;
      const targetTurn = maxTurn * ramp;

      // Giro suave y progresivo con aproximación exponencial
      this.speedTurn += (targetTurn - this.speedTurn) * (1 - Math.exp(-9.5 * dt));

      const targetSlip = drift ? 0.26 : (0.06 * Math.abs(this.speedTurn / maxTurn));
      this.lateralSlip += (targetSlip - this.lateralSlip) * 0.16;

      if (this.speedForward > v.maxNormalLinearSpeed * 0.96 && !drift) {
        accel -= v.motorAcceleration * 0.15 * Math.abs(this.speedTurn / maxTurn);
      }

      this.animator.goRight(drift);
    } else {
      // Re-centrado suave y natural del volante
      this.steerProgress = Math.max(0, this.steerProgress - dt * 5.5);
      this.speedTurn *= Math.exp(-9.0 * dt);
      if (Math.abs(this.speedTurn) < 0.001) this.speedTurn = 0;
      this.lateralSlip *= 0.82;
      if (Math.abs(this.lateralSlip) < 0.001) this.lateralSlip = 0;
    }

    this.isDrifting = drift;
    return accel;
  }

  /* ---------- AI操控（忠实移植 useGradientControls） ---------- */
  battleControls(accel, race) {
    // 气球对战AI：追击最近存活对手（替代梯度寻路），保留转向/加速手感
    const v = this.vehicle;
    let target = null, bestD = Infinity;
    for (const d of race.drivers) {
      if (d === this || d.balloons <= 0) continue;
      const dx = d.position.x - this.position.x, dy = d.position.y - this.position.y;
      const dd = dx * dx + dy * dy;
      if (dd < bestD) { bestD = dd; target = d; }
    }
    // 原版AI转向经8-bit角度表量化（$7F:9000），复现硬件阶梯感
    const targetAngle = AI.quantizeAngle(target
      ? Math.atan2(target.position.y - this.position.y, target.position.x - this.position.x)
      : this.posAngle);
    let diff = targetAngle - this.posAngle - this.speedTurn * 0.15;
    diff %= TAU; if (diff < 0) diff += TAU;
    if (Math.abs(Math.PI - diff) > 0.85 * Math.PI) {
      accel = simulateSpeedGraph(this, accel);
      this.animator.goForward();
    }
    if (diff >= 0.05 * Math.PI && diff <= 1.95 * Math.PI) {
      const angAcc = v.turningAcceleration;
      if (diff > Math.PI) {
        this.speedTurn = Math.max(this.speedTurn - angAcc * 2, -v.maxTurningAngularSpeed);
        this.animator.goLeft(this.speedTurn < -v.maxTurningAngularSpeed * 0.4);
      } else {
        this.speedTurn = Math.min(this.speedTurn + angAcc * 2, v.maxTurningAngularSpeed);
        this.animator.goRight(this.speedTurn > v.maxTurningAngularSpeed * 0.4);
      }
    }
    return accel;
  }

  aiControls(accel, race, now) {
    const v = this.vehicle;
    if (race.isBattle) return this.battleControls(accel, race);   // 对战分支
    // 前方梯度方向叠加
    const tilesForward = this.speedForward < v.maxNormalLinearSpeed / 4
      ? 1 : GameMap.aiFarVision + this.farVisionMod;
    let dirX = 0, dirY = 0;
    for (let i = 0; i < tilesForward; i++) {
      const nd = AI.getNextDirection(this.position.x + dirX, this.position.y + dirY);
      dirX += nd.x; dirY += nd.y;
    }
    // 前方避障探测
    const scaledFx = Math.cos(this.posAngle + this.speedTurn * 0.15) * this.speedForward * 0.06;
    const scaledFy = Math.sin(this.posAngle + this.speedTurn * 0.15) * this.speedForward * 0.06;
    let evadeAngle = 0;
    if (this.speedForward / v.maxNormalLinearSpeed > 0.3) {
      for (let i = 1; i < 12; i++) {
        const px = this.position.x + scaledFx * i, py = this.position.y + scaledFy * i;
        const ev = this.evadeAt(px, py, race);
        if (ev) {
          const MAX_EVADE_ANGLE = Math.PI / 3;
          const evadeModule = ev.mod;
          if (evadeModule < 1.5 / 128) {
            const evadePct = 1 - evadeModule / (1.5 / 128);
            evadeAngle = evadePct * MAX_EVADE_ANGLE * (ev.dot > 0 ? -1 : 1);
          }
          break;
        }
      }
    }
    // 是否要冲出赛道
    const landAhead = GameMap.getLand(this.position.x + scaledFx * 16, this.position.y + scaledFy * 16);
    const goingToFall = (landAhead === Land.OUTER ||
                        GameMap.getLand(this.position.x + scaledFx * 8, this.position.y + scaledFy * 8) === Land.OUTER) &&
                        this.speedForward / v.maxNormalLinearSpeed > 0.3;
    // 目标角
    // 原版AI：目标方向经 $7F:9000 角度表量化（8-bit 阶梯），复现硬件转向颗粒感
    const targetAngle = AI.quantizeAngle(Math.atan2(dirY, dirX));
    // 阻挡后方车手
    let angleP2P = 0, goHitBackMultiplier = 1;
    const back = race.driverAtRank(this.rank + 1);
    if (back && back !== this) {
      goHitBackMultiplier = back.controlType === 'player' ? 1 : 8;
      const vx = this.position.x - back.position.x, vy = this.position.y - back.position.y;
      const d2 = vx * vx + vy * vy;
      if (d2 < Math.pow(6 / 128, 2)) {
        angleP2P = normAngle(Math.atan2(vy, vx) - this.posAngle);
        if (angleP2P > Math.PI / 2 && angleP2P < 3 * Math.PI / 2) angleP2P = 0;
        if (back.isImmune()) angleP2P = normAngle(-angleP2P);
      }
    }
    const goHitBack = (angleP2P < Math.PI ? -1 : 1) * angleP2P / this.impedimentMod;
    let diff = targetAngle + evadeAngle - this.posAngle - this.speedTurn * 0.15 + goHitBack / goHitBackMultiplier;
    diff %= TAU; if (diff < 0) diff += TAU;

    if (this.height === 0 && Math.abs(Math.PI - diff) > 0.85 * Math.PI) {
      // Bug9修复①：忠实移植C++分支——只有"速度已达40%以上"的AI才走橡皮筋概率，
      // 低速车必定加速。此前所有AI都走概率分支，低速车可能连续多帧抽不到加速，
      // 速度被摩擦清零后趴窝不起，叠车时被碰撞进一步压到0形成永久堵死。
      if (this.isRealPlayer &&
          this.speedForward >= 0.4 * v.maxNormalLinearSpeed) {
        // 橡皮筋机制（C++ useGradientControls 的 rubber banding 分支）
        const pv = AI.posValue(race.player.position.x, race.player.position.y) +
                   AI.maxValue * race.player.laps;
        const cv = AI.posValue(this.position.x, this.position.y) + AI.maxValue * this.laps;
        const CC = { behindDist:[100,100,75], behindProb:[0.6,0.7,0.75],
                     aheadDist:[100,200,300], aheadProb:[0.45,0.45,0.45] };
        const ci = this.ccIndex;
        const distance = Math.abs(pv - cv);
        if (this.rank > race.player.rank) {
          const variance = 1 - CC.behindProb[ci];
          let prob = (distance / CC.behindDist[ci]) * variance + CC.behindProb[ci];
          prob = Math.max(0.5, Math.min(prob, 1));
          if (Math.random() <= prob) { accel = simulateSpeedGraph(this, accel); this.animator.goForward(); }
        } else {
          const variance = CC.behindProb[ci] - CC.aheadProb[ci];
          let prob = ((1 - distance / CC.aheadDist[ci]) * variance) + CC.aheadProb[ci];
          prob = Math.max(0.40, Math.min(prob, 0.5));
          if (Math.random() <= prob) { accel = simulateSpeedGraph(this, accel); this.animator.goForward(); }
        }
      } else {
        // 低速(<40%)或非realPlayer：必定加速（C++ else 分支）
        accel = simulateSpeedGraph(this, accel);
        this.animator.goForward();
      }
    }
    if (diff >= 0.05 * Math.PI && diff <= 1.95 * Math.PI) {
      const angAcc = v.turningAcceleration;
      const turnMul = goingToFall ? 5 : 2, totalMul = goingToFall ? 1.5 : 1;
      if (diff > Math.PI) {
        this.speedTurn = Math.max(this.speedTurn - angAcc * turnMul, -v.maxTurningAngularSpeed * totalMul);
        if (this.speedForward > v.maxNormalLinearSpeed * 0.9)
          accel = -v.motorAcceleration * Math.abs(this.speedTurn / v.maxTurningAngularSpeed);
        this.animator.goLeft(this.speedTurn < -v.maxTurningAngularSpeed * 0.4);
      } else {
        this.speedTurn = Math.min(this.speedTurn + angAcc * turnMul, v.maxTurningAngularSpeed * totalMul);
        if (this.speedForward > v.maxNormalLinearSpeed * 0.9)
          accel = -v.motorAcceleration * Math.abs(this.speedTurn / v.maxTurningAngularSpeed);
        this.animator.goRight(this.speedTurn > v.maxTurningAngularSpeed * 0.4);
      }
    }
    return accel;
  }

  /* 探测某点附近的障碍物，返回躲避向量 */
  evadeAt(px, py, race) {
    const check = (ox, oy, radius) => {
      const dx = px - ox, dy = py - oy;
      const mod = Math.sqrt(dx * dx + dy * dy);
      if (mod < radius && mod > 1e-6) {
        const fwdX = Math.cos(this.posAngle + Math.PI / 2), fwdY = Math.sin(this.posAngle + Math.PI / 2);
        return { mod, dot: fwdX * dx + fwdY * dy, x: dx / mod, y: dy / mod };
      }
      return null;
    };
    for (const wo of GameMap.wallObjects) {
      const r = 2.5 / 128 + 1.5 / 128;
      const e = check(wo.x, wo.y, r);
      if (e) return e;
    }
    for (const d of race.drivers) {
      if (d === this) continue;
      const e = check(d.position.x, d.position.y, 3.0 / 128);
      if (e) return e;
    }
    return null;
  }

  /* ---------- 圈数计费（移植 updateGradientPosition） ---------- */
  updateGradientPosition(race) {
    if (race.isBattle) return;   // 对战无圈数概念
    if (this.position.x < 1e-4 || this.position.x > 1 - 1e-4 ||
        this.position.y < 1e-4 || this.position.y > 1 - 1e-4) return;
    const g = AI.posValue(this.position.x, this.position.y);
    if (g === -1 || g === this.lastGradient) return;
    if (this.lastGradient === -1) { this.lastGradient = g; return; }
    const MAX_INC = 5;
    if (g > this.lastGradient) {
      this.consecutiveGradInc = Math.min(this.consecutiveGradInc + 1, MAX_INC);
      if (this.consecutiveGradInc === MAX_INC) this.goingForwards = false;
    } else {
      this.consecutiveGradInc = Math.max(this.consecutiveGradInc - 1, -MAX_INC);
      if (this.consecutiveGradInc === -MAX_INC) this.goingForwards = true;
    }
    const diff = g - this.lastGradient;
    if (diff > AI.lapCheck) {
      this.laps++;
      if (this.laps > this.maxLapSoFar) {
        if (this.isRealPlayer && this.laps <= NUM_LAPS) {
          GameMap.reactivateQuestionPanels();
          race.onLap(this.laps);
        }
        this.maxLapSoFar = this.laps;
      }
      if (this.laps > NUM_LAPS && !this.finished) {
        this.finished = true;
        this.finishTime = race.time;
        race.onFinish(this);
      }
    } else if (diff < -AI.lapCheck && this.laps > 0) {
      this.laps--;
    }
    this.lastGradient = g;
  }

  /* ---------- 撞墙反弹（移植 handlerHitBlock） ---------- */
  hitBlock(nextX, nextY) {
    const moveW = 1 / 128, moveH = 1 / 128;
    let widthSize = 0, heightSize = 0;
    for (const j of [-1, 1]) {
      for (let i = 1; i <= 4; i++) {
        if (GameMap.getLand(nextX + i * j * moveW, nextY) === Land.BLOCK) widthSize++;
        else break;
      }
    }
    for (const j of [-1, 1]) {
      for (let i = 1; i <= 4; i++) {
        if (GameMap.getLand(nextX, nextY + i * j * moveH) === Land.BLOCK) heightSize++;
        else break;
      }
    }
    const momSpeed = Math.hypot(this.collisionMomentum.x, this.collisionMomentum.y);
    let factor, angle;
    if (momSpeed === 0) { factor = this.speedForward; angle = this.posAngle; }
    else { factor = momSpeed; angle = Math.atan2(this.collisionMomentum.y, this.collisionMomentum.x); }
    this.collisionMomentum.x = 0; this.collisionMomentum.y = 0;
    factor = Math.max(factor, this.vehicle.maxNormalLinearSpeed * (this.isImmune() ? 0.97 : 0.5));
    const mx = Math.cos(angle) * Math.max(0.01, factor);
    const my = Math.sin(angle) * Math.max(0.01, factor);
    if (widthSize > 4 && heightSize < 4) this.vectorialSpeed = { x: mx, y: -my };
    else if (widthSize < 4 && heightSize > 4) this.vectorialSpeed = { x: -mx, y: my };
    else this.vectorialSpeed = { x: -mx, y: -my };
  }

  /* 判断当前地块是否为致命深渊/岩浆/深水（触发坠落救援）；普通草地/泥地/沙地为可驾驶越野路段 */
  isLethalHazard(x, y) {
    if (x < 0 || x > 1 || y < 0 || y > 1) return true;
    const land = GameMap.getLand(x, y);
    if (land !== Land.OUTER) return false;

    const mat = GameMap.getMaterial(x, y);
    // 深渊(VOID) 或 岩浆(LAVA) 必然坠落
    if (mat === Material.VOID || mat === Material.LAVA) return true;
    // 水域：外圈落水
    if (mat === Material.WATER) return true;

    // 程序化赛道判断其主题是否属于坠落型(voidTheme)
    if (typeof RACE_TRACKS !== 'undefined' && typeof TRACKGEN_THEMES !== 'undefined') {
      const def = RACE_TRACKS[GameMap.courseName];
      if (def && TRACKGEN_THEMES[def.theme] && TRACKGEN_THEMES[def.theme].voidTheme) {
        return true;
      }
    }

    if (GameMap.courseName) {
      const cn = GameMap.courseName;
      if (cn.includes('ghost_valley') || cn.includes('rainbow_road') || cn.includes('bowser_castle')) {
        return true;
      }
    }

    return false;
  }

  /* 五点探边（移植 improvedCheckOfMapLands） */
  checkMapLands(nextX, nextY) {
    const half = (8 / 1024) / 3.5;
    const angles = [0, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4];
    for (const da of angles) {
      const sx = nextX + Math.cos(this.posAngle + da) * half;
      const sy = nextY + Math.sin(this.posAngle + da) * half;
      const land = GameMap.getLand(sx, sy);
      if (land === Land.BLOCK) {
        this.hitBlock(nextX + Math.cos(this.posAngle + da) * half,
                      nextY + Math.sin(this.posAngle + da) * half);
        this.popState(DS.SPEED_UP); this.popState(DS.MORE_SPEED_UP);
        if (this.isRealPlayer) Sound.play('sfx_thudpipe');
        this.speedForward = 0;
        return 'block';
      }
      if (this.isLethalHazard(sx, sy)) return 'outer';
    }
    return null;
  }

  /* 起跳台（移植 jumpRamp） */
  jumpRamp(land) {
    const INC = 22.5 / 90;
    this.speedUpwards = INC * this.speedForward * 384 * 8;
    this.speedUpwards = Math.max(20, Math.min(40, this.speedUpwards));
    this.speedForward = Math.max((1 - INC) * this.speedForward, 0.1);
    this.heightByRamp = true;
    const na = normAngle(this.posAngle);
    if (land === Land.RAMP_H) this.flightAngle = (na >= 0 && na <= Math.PI) ? Math.PI / 2 : 3 * Math.PI / 2;
    else this.flightAngle = (na > Math.PI / 2 && na < 3 * Math.PI / 2) ? Math.PI : 0;
    if (this.isRealPlayer) Sound.play('sfx_jump');
  }

  /* ---------- 主更新（移植 Driver::update） ---------- */
  update(dt, input, race) {
    const now = GameClock.now();
    let accel = 0;
    if (this.height === 0) accel += FRICTION;
    if ((!input.left && !input.right) ||
        (input.left && this.speedTurn > 0) || (input.right && this.speedTurn < 0)) {
      this.speedTurn *= Math.exp(-14.0 * dt);
      if (Math.abs(this.speedTurn) < 0.001) this.speedTurn = 0;
    }
    this.popExpired(now);
    this._lastRace = race;

    if (this.has(DS.UNCONTROLLED)) {
      this.animator.hit();
    } else if (!this.has(DS.STOPPED)) {
      if (this.height === 0 && this.animator.state !== 'hit') this.animator.goForward();
      if (this.controlType === 'player') accel = this.playerControls(accel, input, now);
      else accel = this.aiControls(accel, race, now);
    }

    accel *= 1 + POS_ACC_BONUS * this.rank;
    if (this.isImmune()) accel *= 2;

    const land = GameMap.getLand(this.position.x, this.position.y);
    const isSlowSurface = (land === Land.SLOW || (land === Land.OUTER && !this.isLethalHazard(this.position.x, this.position.y)));
    if (isSlowSurface && !this.has(DS.STAR) && !this.has(DS.SPEED_UP)) {
      if (this.speedForward > this.vehicle.slowLandMaxLinearSpeed)
        accel += SLOW_LAND_ACC;
    }
    if (this.height === 0) {
      if (land === Land.OIL_SLICK) {
        if (!this.isImmune()) {
          this.applyHit();
          this.speedForward = Math.max(this.speedForward, 0.01);
        }
      } else if (land === Land.RAMP_H || land === Land.RAMP_V) {
        this.jumpRamp(land);
      } else if (land === Land.ZIPPER) {
        if (this.has(DS.SPEED_UP) && this.controlType !== 'player') {
          this.pushState(DS.MORE_SPEED_UP, now + DUR.MORE_SPEED_UP);
          this.speedForward = this.vehicle.maxSpeedUpLinearSpeed * 1.2;
        } else {
          this.speedForward = this.vehicle.maxSpeedUpLinearSpeed;
          if (this.isRealPlayer) Sound.play('sfx_grow');
        }
        this.pushState(DS.SPEED_UP, now + DUR.SPEED_UP);
      }
    }

    // 重力
    if ((this.height > 0 || this.speedUpwards > 0) && !this.onLakitu) {
      this.height += this.speedUpwards * dt + 0.5 * GRAVITY * dt * dt;
      if (this.height < 0) {
        if (this.isRealPlayer) Sound.play('sfx_landing');
        if (!this.heightByRamp && (input.left || input.right || input.drift)) this.pressedToDrift = true;
        this.heightByRamp = false;
      }
      this.height = Math.max(0, this.height);
      this.speedUpwards += GRAVITY * dt;
      if (this.height === 0) this.speedUpwards = 0;
    }

    // 最高速度
    let maxLin;
    if (this.has(DS.MORE_SPEED_UP)) maxLin = this.vehicle.maxSpeedUpLinearSpeed * 1.2;
    else if (this.has(DS.SPEED_UP) || this.has(DS.STAR)) maxLin = this.vehicle.maxSpeedUpLinearSpeed;
    else if (this.has(DS.SPEED_DOWN)) maxLin = this.vehicle.maxSpeedDownLinearSpeed;
    else maxLin = this.vehicle.maxNormalLinearSpeed;
    maxLin += COIN_SPEED * this.coins;

    const deltaAngle = this.speedTurn * dt;
    let deltaSpace = this.speedForward * dt + accel * dt * dt / 2;
    deltaSpace = Math.min(deltaSpace, maxLin * dt);
    deltaSpace = Math.max(deltaSpace, 0);
    this.speedForward = Math.max(0, Math.min(this.speedForward + accel * dt, maxLin));

    const moveAngle = this.height === 0 ? this.posAngle : this.flightAngle;
    let dpx = Math.cos(moveAngle) * deltaSpace;
    let dpy = Math.sin(moveAngle) * deltaSpace;

    // Inercia lateral y derrape realista de neumáticos
    if (this.height === 0 && Math.abs(this.lateralSlip) > 0.0001) {
      const latX = -Math.sin(moveAngle);
      const latY = Math.cos(moveAngle);
      dpx += latX * this.lateralSlip * deltaSpace * 2.8;
      dpy += latY * this.lateralSlip * deltaSpace * 2.8;
    }

    dpx += this.collisionMomentum.x; dpy += this.collisionMomentum.y;
    this.collisionMomentum.x /= 1.2; this.collisionMomentum.y /= 1.2;
    dpx += this.vectorialSpeed.x * dt; dpy += this.vectorialSpeed.y * dt;
    this.vectorialSpeed.x /= 1.3; this.vectorialSpeed.y /= 1.3;

    if (this.position.x + dpx < 0 || this.position.x + dpx > 1 ||
        this.position.y + dpy < 0 || this.position.y + dpy > 1) {
      this.falling = true; dpx = 0; dpy = 0;
    }

    if (!this.heightByRamp && GameMap.getLand(this.position.x, this.position.y) !== Land.BLOCK) {
      const res = this.checkMapLands(this.position.x + dpx, this.position.y + dpy);
      if (res === 'block') { dpx = 0; dpy = 0; }
      else if (res === 'outer') this.falling = true;
    }

    // 坠落处理
    // Bug9修复③：AI落水按C++立即重定位+2.5秒隐身停止（此前所有车手都原地等2秒，
    // 造成"瞬移"观感且后方车辆堆积）；玩家保留Lake佬救援流程。
    if (this.falling && this.controlType !== 'player') {
      this.speedTurn = 0; this.speedForward = 0;
      this.addCoin(-2);
      this.relocate();
      this.pushState(DS.STOPPED, now + 2.5);
      this.pushState(DS.INVISIBLE, now + 2.5);
      this.falling = false; this.height = 0;
      this.animator.reset();
      this.animator.update(dt, 0, 0);
      return;
    }
    if (this.falling) {
      // 玩家救援动画：下沉(0~0.5s) → Lake佬吊起(0.5~1.0s) → 空中悬停运回
      // (1.0~1.6s) → 降落回赛道(1.6~2.0s)。替代原先"定住后瞬移"的生硬感。
      this._fallT = (this._fallT || 0) + dt;
      this.speedTurn = 0;
      const T = this._fallT;
      if (T < 0.5) {
        this.speedForward /= 1.1;
        if (T - dt <= 0 || this._fallStart === undefined) {
          this._fallStart = true;
          this.animator.fall();
          Sound.play('sfx_fall'); Sound.stopMusic();
        }
      } else if (T < 0.9) {
        if (!this._relocated) { this.relocate(); this._relocated = true; this.lastGradient = -1; }
        if (this.height < 26) this.height += 90 * dt;   // 被吊起
        this.animator.state = 'fwd';
      } else if (T < 1.7) {
        this.height = 26;                                // 空中悬停运回
      } else {
        this.height = Math.max(0, this.height - 130 * dt); // 降落
        if (this.height === 0 && this.falling) {
          this.falling = false;
          this._fallT = 0; this._relocated = false;
          this.state = 0;
          this.animator.reset();
          race.onRescue();
        }
      }
      this.animator.update(dt, this.speedForward, this.height);
      return;
    }

    this.position.x += dpx;
    this.position.y += dpy;
    if (this.height === 0) this.posAngle = this.posAngle % TAU + deltaAngle;

    this.updateGradientPosition(race);
    this.animator.update(dt, this.speedForward, this.height);

    // 路径历史（用于救援回溯）
    if (!this.falling && race.time - this.pathLastUpdated > 0.25) {
      // Bug9修复②：移植C++防卡死机制（driver.cpp:891-915）——
      // AI连续12个采样点(≈3秒)都没移动超过1格 → 判定卡死 → 回溯历史并relocate。
      // donut plains草地口袋/窄桥处AI互相顶死就靠这个解围。
      // Bug9修复⑥：只在真正可驾驶时才判定"卡死"——刚被救援STOPPED停泊的车
      // 不动是正常的，否则会触发relocate风暴（反复瞬移+刷新STOPPED永世不得动）。
      if (this.controlType !== 'player' && this.canDrive()) {
        let still = 0;
        for (let i = this.followedPath.length - 1; i >= 0; i--) {
          const p = this.followedPath[i];
          if (Math.abs(this.position.x - p.x) > 1 / 128) break;
          if (Math.abs(this.position.y - p.y) > 1 / 128) break;
          if (++still >= 12) {
            const size = this.followedPath.length;
            const cutFrom = Math.max(size - 12 - 5, 1);
            this.followedPath.length = cutFrom;
            this.relocate();
            break;
          }
        }
      }
      this.followedPath.push({ x: this.position.x, y: this.position.y });
      this.prevLap.push(this.laps);
      if (this.followedPath.length > 200) { this.followedPath.shift(); this.prevLap.shift(); }
      this.pathLastUpdated = race.time;
    }
  }

  /* 救援回最近的好位置（忠实移植 relocateToNearestGoodPosition + updatePosition） */
  relocate() {
    // Battle Course 没有 AI.position/gradient。车辆卡住或碰撞后直接选择一个
    // 远离墙体的可驾驶格重定位，不能进入下面的 GP 梯度步进流程。
    if (this._lastRace && this._lastRace.isBattle) {
      const candidates = [];
      const drivable = v => v === Land.TRACK || v === Land.OTHER || v === Land.SLOW;
      for (let ty = 2; ty < 126; ty++) {
        for (let tx = 2; tx < 126; tx++) {
          if (!drivable(GameMap.land[ty * 128 + tx])) continue;
          if (!drivable(GameMap.land[ty * 128 + tx - 1]) ||
              !drivable(GameMap.land[ty * 128 + tx + 1]) ||
              !drivable(GameMap.land[(ty - 1) * 128 + tx]) ||
              !drivable(GameMap.land[(ty + 1) * 128 + tx])) continue;
          candidates.push([tx, ty]);
        }
      }
      if (candidates.length) {
        const tick = Math.floor((this._lastRace.time || 0) * 10);
        const pick = candidates[(this.charIdx * 977 + tick * 37) % candidates.length];
        this.position = { x: (pick[0] + 0.5) / 128, y: (pick[1] + 0.5) / 128 };
      }
      let target = null, best = Infinity;
      for (const d of this._lastRace.drivers) {
        if (d === this || d.balloons <= 0) continue;
        const dx = d.position.x - this.position.x, dy = d.position.y - this.position.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < best) { best = d2; target = d; }
      }
      if (target) this.posAngle = Math.atan2(
        target.position.y - this.position.y, target.position.x - this.position.x);
      this.speedForward = 0;
      this.speedTurn = 0;
      this.falling = false;
      this.lastGradient = -1;
      return;
    }

    let idx = Math.max(0, this.followedPath.length - 1 - 4);
    const hist = this.followedPath[idx] || { x: 0.5, y: 0.5 };
    this.position = { x: hist.x, y: hist.y };
    this.laps = this.prevLap[idx] || this.laps;
    let stepsFromGoal = AI.posValue(this.position.x, this.position.y) === 0 ? 1 : 0;
    // C++ updatePosition：走一步梯度方向；跨过终点后开始计数
    const walk = () => {
      const d = AI.getNextDirection(this.position.x, this.position.y);
      this.position.x += d.x; this.position.y += d.y;
      if (stepsFromGoal === 0) {
        if (AI.posValue(this.position.x, this.position.y) === 0) stepsFromGoal = 1;
      } else stepsFromGoal++;
    };
    let guard = 0;
    while (GameMap.getLand(this.position.x, this.position.y) === Land.OUTER && guard++ < 500) walk();
    const times = 2 + (Math.random() * 6 | 0);
    for (let i = 0; i < times; i++) walk();
    guard = 0;
    while (GameMap.getLand(this.position.x, this.position.y) === Land.OUTER && guard++ < 500) walk();
    const nd = AI.getNextDirection(this.position.x, this.position.y);
    // Bug9修复④：补上C++缺失的回退补偿——沿梯度反方向退stepsFromGoal+2格，
    // 防止重生点越过终点线造成圈数错乱/落点怪异
    if (stepsFromGoal > 0) {
      this.position.x -= nd.x * (stepsFromGoal + 2);
      this.position.y -= nd.y * (stepsFromGoal + 2);
    }
    this.posAngle = Math.atan2(nd.y, nd.x);
    this.lastGradient = -1;
    // Bug9修复⑤：安全步进——确保落点和五点探测范围都不压OUTER，
    // 否则下一帧立即再次判定坠落，陷入"坠落→救援→再坠落"死循环
    // （幽灵赛道/甜甜圈赛道窄路边缘尤其高发）。C++靠碰撞HashMap的
    // 微小步长差异侥幸避开，这里显式保证。
    const half = (8 / 1024) / 3.5;
    let guard2 = 0;
    while (guard2++ < 100) {
      const d2 = AI.getNextDirection(this.position.x, this.position.y);
      const ang = Math.atan2(d2.y, d2.x);
      let bad = GameMap.getLand(this.position.x, this.position.y) === Land.OUTER;
      for (const da of [0, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
        if (GameMap.getLand(
              this.position.x + Math.cos(ang + da) * half,
              this.position.y + Math.sin(ang + da) * half) === Land.OUTER) bad = true;
      }
      if (!bad) break;
      this.position.x += d2.x; this.position.y += d2.y;
      this.posAngle = ang;
    }
    // 注意：不清空followedPath——保留历史让反复坠落的车回退到自己走过的路径，
    // 避免多次relocate因确定性梯度行走收敛到同一格形成叠车死堆
  }

  /* 车手间碰撞解算（移植 solveCollision） */
  solveCollision(other) {
    if (Math.abs(this.height - other.height) > 6) return null;
    if (this.isImmune() && !other.isImmune())
      return { momentum: { x: 0, y: 0 }, speedFactor: 1.0, hit: false, hitOther: true };
    if (!this.isImmune() && other.isImmune()) return null;
    const mySpeed = Math.max(this.speedForward, 1e-4);
    const othSpeed = Math.max(other.speedForward, 1e-4);
    const weightFactor = Math.sqrt(this.vehicle.weight / (this.vehicle.weight + other.vehicle.weight));
    const dx = other.position.x - this.position.x, dy = other.position.y - this.position.y;
    const dist = Math.max(Math.hypot(dx, dy), 1e-4);
    const impulse = (0.02 + (mySpeed + othSpeed) * 0.15) * (1 / weightFactor);
    return {
      momentum: { x: -dx / dist * impulse, y: -dy / dist * impulse },
      speedFactor: 0.88,
      hit: false
    };
  }

  setPositionAndReset(pos, angle = -Math.PI / 2) {
    this.position = { x: pos.x, y: pos.y };
    this.posAngle = angle; this.height = 0; this.flightAngle = 0;
    this.followedPath = [{ x: pos.x, y: pos.y }];
    this.prevLap = [0];
    this.pathLastUpdated = 0;
    this.laps = 0; this.maxLapSoFar = 0;
    this.powerUp = 0; this.canUseItemAt = 0;
    this.coins = 0; this.rank = 0;
    this.goingForwards = true; this.lastGradient = -1; this.consecutiveGradInc = 0;
    this.speedForward = 0; this.speedTurn = 0; this.speedUpwards = 0;
    this.collisionMomentum = { x: 0, y: 0 }; this.vectorialSpeed = { x: 0, y: 0 };
    this.state = 0; this.falling = false; this.finished = false;
    this.onLakitu = 0;
    this.animator.reset();
  }
}






