/* 测试体：在游戏脚本作用域内执行（由 test.js 注入 check 函数） */
// ===== 1. 赛道加载（程序化 mario circuit 2） =====
await GameMap.loadGenerated('mario_circuit_2');
check('land矩阵加载', GameMap.land.length === 16384 && GameMap.land.includes(Land.TRACK));
check('材质解析', GameMap.matNormal === Material.STONE);
check('终点线解析', GameMap.stretchedGoal.w > 0 && GameMap.centeredGoal.w > 0);
const nPanels = GameMap.floorObjects.filter(f => f.type === FloorType.QUESTION_PANEL).length;
const nCoins = GameMap.floorObjects.filter(f => f.type === FloorType.COIN).length;
check('地板物件', nPanels > 0, 'panels=' + nPanels + ' coins=' + nCoins);
const nPipes = GameMap.wallObjects.filter(w =>
  w.type === WallType.GREEN_PIPE || w.type === WallType.ORANGE_PIPE).length;
check('墙物体(管道)', nPipes >= 2, 'pipes=' + nPipes);

// ===== 2. AI梯度数据（loadGenerated 内由 AI.generate 生成） =====
check('lapCheck生成', AI.lapCheck > 50, 'lapCheck=' + AI.lapCheck);
const startDir = AI.getNextDirection(0.5, 0.9);
check('AI方向有效', isFinite(startDir.x) && isFinite(startDir.y),
  JSON.stringify(startDir));
const goalMid = { x: (GameMap.stretchedGoal.x + GameMap.stretchedGoal.w / 2),
                  y: (GameMap.stretchedGoal.y + GameMap.stretchedGoal.h / 2) };
check('终点梯度为0', AI.posValue(goalMid.x, goalMid.y) === 0);

// ===== 3. 发车位置 =====
const p1 = GameMap.getPlayerInitialPosition(1);
const p8 = GameMap.getPlayerInitialPosition(8);
check('发车排位', p8.y > p1.y, 'p1y=' + p1.y.toFixed(3) + ' p8y=' + p8.y.toFixed(3));

// ===== 4. Mode7渲染数学 =====
const srcData = { data: new Uint8ClampedArray(1024 * 1024 * 4).fill(200), w: 1024, h: 1024 };
const dst = { data: new Uint8ClampedArray(64 * 32 * 4), width: 64, height: 32 };
M7.render(dst, 64, 32, { x: 0.5, y: 0.5 }, -Math.PI / 2, 0.5, 0.0005, 0.045, true, srcData, null);
let nonBlack = 0;
for (let i = 0; i < dst.data.length; i += 4) if (dst.data[i] > 0) nonBlack++;
check('mode7采样', nonBlack > 64 * 32 * 0.5, '覆盖率=' + (nonBlack / (64 * 32)).toFixed(2));
const dst2 = { data: new Uint8ClampedArray(64 * 32 * 4) };
M7.render(dst2, 64, 32, { x: 0.5, y: 0.5 }, -Math.PI / 2, 0.5, 0.0005, 0.045, true, srcData,
          { data: new Uint8ClampedArray(8 * 8 * 4).fill(90), w: 8, h: 8 });
check('mode7边缘贴图不崩溃', true);

// 定点行表应与浮点几何在每个采样点相差不超过约1个texel。
const rt = M7.buildRowTable(512, 184, { x: 0.63, y: 0.71 }, -1.3,
  0.5, 0.0005, 0.045, true);
let maxRowErr = 0;
for (const y of [0, 40, 100, 183]) {
  const depth = (y + 1) / 184;
  const f0 = -1.3 - 0.5, f1 = -1.3 + 0.5;
  const n0 = { x: 0.63 + Math.cos(f0) * 0.0005, y: 0.71 + Math.sin(f0) * 0.0005 };
  const n1 = { x: 0.63 + Math.cos(f1) * 0.0005, y: 0.71 + Math.sin(f1) * 0.0005 };
  const q0 = { x: n0.x + Math.cos(f0) * (0.045 - 0.0005) / depth,
               y: n0.y + Math.sin(f0) * (0.045 - 0.0005) / depth };
  const q1 = { x: n1.x + Math.cos(f1) * (0.045 - 0.0005) / depth,
               y: n1.y + Math.sin(f1) * (0.045 - 0.0005) / depth };
  const o = y * 4;
  for (const x of [0, 128, 256, 511]) {
    const fx = q0.x + (q1.x - q0.x) * x / 512;
    const fy = q0.y + (q1.y - q0.y) * x / 512;
    const ix = (rt.rows[o + 2] + rt.rows[o] * (x - rt.half)) / 256 / 1024;
    const iy = (rt.rows[o + 3] + rt.rows[o + 1] * (x - rt.half)) / 256 / 1024;
    maxRowErr = Math.max(maxRowErr, Math.abs(ix - fx), Math.abs(iy - fy));
  }
}
check('mode7定点行表横向步长', maxRowErr <= 2 / 1024,
  'maxErr=' + maxRowErr.toFixed(6));

// ===== 5. 车手物理 =====
const race = new Race('mario_circuit_2', 1, 0);   // mario circuit 2, 100cc, player=mario
await race.init();
race.updateRanks();
check('8名车手', race.drivers.length === 8);
check('玩家末位发车', race.player.rank === 7, 'rank=' + race.player.rank);
const P = race.player;
P.setPositionAndReset(GameMap.getPlayerInitialPosition(8), -Math.PI / 2);
const inp = { accel: true, brake: false, left: false, right: false };
let peakSpeed = 0;
for (let i = 0; i < 300; i++) {
  race.time += 1 / 60; P.update(1 / 60, inp, race);
  if (P.speedForward > peakSpeed) peakSpeed = P.speedForward;
}
check('加速有效', peakSpeed > P.vehicle.maxNormalLinearSpeed * 0.5,
  'peak=' + peakSpeed.toFixed(3) + '/' + P.vehicle.maxNormalLinearSpeed.toFixed(3));
check('发生位移', P.position.y < GameMap.getPlayerInitialPosition(8).y,
  'dy=' + P.position.y.toFixed(3));
const sBefore = P.speedForward;
for (let i = 0; i < 60; i++) { race.time += 1 / 60; P.update(1 / 60, { accel: false, brake: true, left: false, right: false }, race); }
check('刹车有效', P.speedForward < sBefore);

// ===== 6. 圈数计费（沿真实梯度数据越过终点） =====
const gyStart = Math.min(GameMap.stretchedGoal.y + GameMap.stretchedGoal.h + 3 / 128, 0.99);
P.position = { x: goalMid.x, y: gyStart };
P.posAngle = -Math.PI / 2;
P.speedForward = P.vehicle.maxNormalLinearSpeed;
P.lastGradient = -1;
P.state = 0;
const lapsBefore = P.laps;
let crossed = false;
for (let i = 0; i < 600 && !crossed; i++) {
  race.time += 1 / 60;
  P.update(1 / 60, { accel: true, brake: false, left: false, right: false }, race);
  if (P.laps > lapsBefore) crossed = true;
}
check('越过终点计圈', crossed, 'laps=' + P.laps + ' grad=' + P.lastGradient);

// ===== 7. 道具 =====
P.powerUp = PowerUp.MUSHROOM;
useItem(P, race, true);
check('蘑菇加速', P.has(DS.SPEED_UP) && P.speedForward >= P.vehicle.maxSpeedUpLinearSpeed * 0.99);
check('道具清空', P.powerUp === PowerUp.NONE);
race.items.push(new GreenShell(P.position, P.posAngle, true, 0));
race.items[race.items.length - 1].ownerChar = P.charIdx;
const sh = race.items[0];
// 出手不自伤：刚掷出的龟壳第一帧不命中持有者
{
  const before = P.coins;
  itemCollisions(race);
  check('龟壳出手不自伤', race.items.includes(sh) && !sh.used, 'used=' + sh.used);
}
const shx = sh.position.x, shy = sh.position.y;
sh.update(1 / 60);
check('龟壳飞行', !sh.used && (sh.position.x !== shx || sh.position.y !== shy));
race.items.push(new Banana(P.position, P.posAngle, false, 0));
check('香蕉放置', race.items[1].height >= 0);
const seen = new Set();
for (let r = 0; r < 8; r++) for (let i = 0; i < 500; i++) seen.add(rollItem(r));
check('抽奖表完整', seen.size === 7, '种数=' + seen.size);

// ===== 8. 排名系统 =====
race.updateRanks();
check('排名计算', race.ranking.length === 8 && race.player.rank >= 0);

// ===== 9. AI车能沿赛道行驶 =====
const aiCar = race.drivers.find(d => d.controlType === 'ai');
aiCar.setPositionAndReset(GameMap.getPlayerInitialPosition(1), -Math.PI / 2);
const aiStart = { x: aiCar.position.x, y: aiCar.position.y };
let aiGrad0 = AI.posValue(aiCar.position.x, aiCar.position.y);
for (let i = 0; i < 300; i++) { race.time += 1 / 60; aiCar.update(1 / 60, {}, race); }
const aiGrad1 = AI.posValue(aiCar.position.x, aiCar.position.y);
check('AI沿赛道前进', aiGrad1 < aiGrad0 || aiCar.laps > 0,
  'grad ' + aiGrad0 + '->' + aiGrad1 + ' dist=' +
  Math.hypot(aiCar.position.x - aiStart.x, aiCar.position.y - aiStart.y).toFixed(3));


// ===== 10. 程序化赛道（trackgen） =====
await GameMap.loadGenerated('mario_circuit_1');
check('生成赛道land', GameMap.land.length === 16384 &&
  GameMap.land.includes(Land.TRACK) && !GameMap.land.every(v => v === Land.TRACK));
AI.generate(GameMap.land, GameMap.stretchedGoal);
check('生成赛道梯度', AI.lapCheck > 20, 'lapCheck=' + AI.lapCheck);
const genRace = new Race('mario_circuit_1', 1, 0);
await genRace.init();
genRace.updateRanks();
const gP = genRace.player;
gP.setPositionAndReset(GameMap.getPlayerInitialPosition(8), -Math.PI / 2);
let gMoved = 0;
for (let i = 0; i < 600; i++) {
  race.time += 1 / 60;
  gP.update(1 / 60, { accel: true, brake: false, left: false, right: false }, genRace);
  if (gP.laps > 0) { gMoved = 1; break; }
}
check('生成赛道可完赛(计圈)', gMoved === 1 || gP.laps > 0, 'laps=' + gP.laps);

// ===== 11. 气球对战核心逻辑 =====
GameMap._battleFlag = true;
const btRace = new Race('battle_course_1', 1, 0, { battle: true });
await btRace.init();
btRace.updateRanks();
check('战场载入', GameMap.isBattle === true && btRace.timeLeft === 180);
check('战场不继承GP梯度', AI.position === null && AI.gradient === null);
check('气球初始化', btRace.drivers.every(d => d.balloons === 3));
btRace.update(1 / 60, {});              // 建立_lastRace+出生护盾
const btRelocate = btRace.drivers[1];
btRelocate.relocate();
check('战场重定位不依赖梯度',
  Number.isFinite(btRelocate.position.x) &&
  GameMap.getLand(btRelocate.position.x, btRelocate.position.y) !== Land.BLOCK);
const victim = btRace.drivers[1];
victim.popState(DS.SHIELD);             // 摘除出生无敌再测
victim.applyHit();
check('命中扣气球+护盾', victim.balloons === 2 && victim.has(DS.SHIELD) && victim.wasBalloonHit);
victim.applyHit();
check('护盾期免伤', victim.balloons === 2, 'balloons=' + victim.balloons);
victim.popState(DS.SHIELD);
victim.applyHit(); victim.popState(DS.SHIELD);
victim.applyHit();
check('气球归零变幽灵', victim.balloons === 0 && victim.has(DS.STOPPED) && victim.has(DS.INVISIBLE));
btRace.timeLeft = 0.01;
btRace.update(1 / 60, {});
check('对战结束判定', btRace.over === true);

return getFailed();
