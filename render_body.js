/* 渲染测试体 */
const ctx = document.getElementById('game').getContext('2d');

// 公共资源预加载（本地开源素材，署名见 OPEN_SOURCE.md）
const jobs = [];
const I = (n, f) => jobs.push(Assets.loadImage(n, f));
for (const ch of CHARACTERS) I(ch.file.replace('drivers/', ''), ch.file);
I('invisible', 'drivers/invisible.png');
I('letters', 'gui/letters.png');
I('letters_alpha', 'gui/letters_alpha.png');
I('digits', 'gui/digits.png');
I('items', 'gui/items.png');
I('coin', 'misc/coin.png');
I('lakitu', 'misc/lakitu.png');
I('shadow', 'misc/shadow.png');
I('particles', 'misc/particles.png');
I('floor_misc', 'objects/floor/misc.png');
I('question_panel', 'objects/floor/question_panel.png');
I('wall_misc', 'objects/wall/misc.png');
I('menu_bg', 'menu/start/background.png');
I('player_selection', 'gui/player_selection.png');
await Promise.all(jobs);
Assets.images['menu_bg_slice'] = Assets.slice('menu_bg', { x: 0, y: 0, w: 512, h: 224 });
Text.init(); Gui.init(); initItemSprites(); M7.prepareSprites(); View.init();
check('公共资源生成', Object.keys(Assets.images).length > 0,
  'count=' + Object.keys(Assets.images).length);

// ===== 全部20条GP赛道加载 + 短暂模拟（含15条生成赛道） =====
for (const trackId of Object.keys(RACE_TRACKS)) {
  const race = new Race(trackId, 1, 0);
  await race.init();
  check('赛道加载 ' + trackId,
    GameMap.land.length === 16384 && race.drivers.length === 8 &&
    (race.isGen ? AI.lapCheck > 20 : AI.lapCheck > 50),
    'objects=' + GameMap.floorObjects.length + '/' + GameMap.wallObjects.length +
    ' lapCheck=' + AI.lapCheck + (race.isGen ? ' [gen]' : ''));

  const startLands = race.drivers.map(d => GameMap.getLand(d.position.x, d.position.y));
  check('发车位在赛道上 ' + trackId,
    startLands.every(v => v !== Land.OUTER && v !== Land.BLOCK),
    'lands=' + startLands.join(','));

  // 模拟10秒比赛
  const P = race.player;
  for (let f = 0; f < 600; f++) {
    const input = { accel: true, brake: false, left: (f % 90) < 45, right: (f % 90) >= 45 };
    if (f === 100) P.shortJump();
    race.time += 1 / 60;
    race.update(1 / 60, input);
  }
  check('比赛模拟 ' + trackId, isFinite(P.position.x) && isFinite(P.speedForward),
    'pos=' + P.position.x.toFixed(2) + ',' + P.position.y.toFixed(2) +
    ' laps=' + P.laps + ' rank=' + (P.rank + 1));

  // 渲染整帧
  race.draw(ctx, P);
  check('渲染 ' + trackId, true);
}

// ===== 4张对战场地：载入+气球战模拟+HUD渲染 =====
for (const bid of BATTLE_COURSE_IDS) {
  const race = new Race(bid, 1, 0, { battle: true });
  await race.init();
  check('战场加载 ' + bid,
    GameMap.isBattle === true && race.timeLeft === 180 &&
    race.drivers.every(d => d.balloons === 3),
    'panels=' + GameMap.floorObjects.length);
  const P = race.player;
  for (let f = 0; f < 900; f++) {
    const input = { accel: true, brake: false, left: (f % 60) < 30, right: (f % 60) >= 30 };
    race.time += 1 / 60;
    race.update(1 / 60, input);
    if (f % 300 === 150 && P.powerUp !== PowerUp.NONE) useItem(P, race, true);
  }
  check('对战模拟 ' + bid, isFinite(P.position.x),
    'balloons=' + P.balloons + ' hitsDealt=' + P.hitsDealt + ' timeLeft=' + race.timeLeft.toFixed(0));
  race.draw(ctx, P);
  check('战场渲染 ' + bid, true);
}

// ===== 各界面绘制 =====
Game.mode = 'gp'; Game.ccIndex = 1; Game.playerChar = 0;

const title = new TitleState(); title.init(); title.draw(ctx);
title.key('down'); title.draw(ctx);
check('标题界面(模式选择)', true);
check('上下双屏布局', AUTHENTIC_LAYOUT === false && View.circuitCanvas.height === 184);
check('file音效路径', Sound.sfxPath('sfx_racestart') === 'assets/sfx/racestart.ogg');

const ccSel = new CCSelectState(); ccSel.init(); ccSel.draw(ctx);
check('排量选择界面', true);

const cs = new CharacterSelectState(); cs.init(); cs.draw(ctx);
cs.key('right'); cs.key('down'); cs.draw(ctx);
check('选人界面', true);

Game.mode = 'gp';
const cupSel = new CupSelectState(); cupSel.init(); cupSel.draw(ctx);
cupSel.key('down'); cupSel.draw(ctx);
check('选杯界面', true);

Game.mode = 'race';
const trkSel = new TrackSelectState(); trkSel.init(); trkSel.draw(ctx);
trkSel.key('right'); trkSel.key('down'); trkSel.draw(ctx);
check('选道界面(20条)', true);

Game.mode = 'battle';
const btSel = new BattleSelectState(); btSel.init(); btSel.draw(ctx);
btSel.key('down'); btSel.draw(ctx);
check('对战选择界面', true);

// GP积分榜/奖杯/对战结算界面绘制
Game.gp = { cupIdx: 0, raceIdx: 1, points: [12, 9, 6, 3, 2, 1, 0, 0], gains: null };
const raceGp = new Race('mario_circuit_1', 1, 0);
await raceGp.init();
const playedAtStart = [];
const oldSoundPlay = Sound.play;
Sound.play = name => { playedAtStart.push(name); return null; };
const raceStartAudio = new RaceStartState(raceGp);
raceStartAudio.t = 10;
raceStartAudio.update(0);
Sound.play = oldSoundPlay;
check('倒计时触发音效', playedAtStart.includes('sfx_racestart'));
const gps = new GPStandingsState(raceGp); gps.init(); gps.t = 1; gps.draw(ctx);
const trophy = new CupTrophyState(); trophy.init(); trophy.t = 2; trophy.draw(ctx);
check('GP积分榜/奖杯界面', true);

const raceBt = new Race('battle_course_1', 1, 0, { battle: true });
await raceBt.init();
raceBt.drivers[0].balloons = 1; raceBt.drivers[1].balloons = 2;
raceBt.updateRanks();
const bend = new BattleEndState(raceBt); bend.init(); bend.t = 2; bend.draw(ctx);
check('对战结算界面', true);

return getFailed();
