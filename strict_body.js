/* 严格测试体：全24张图高压力模拟+每帧绘制，捕捉浏览器才会暴露的非法参数 */
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

// 每条GP赛道：25秒高压力模拟（随机转向+道具），每帧绘制
for (const trackId of Object.keys(RACE_TRACKS)) {
  const race = new Race(trackId, 2, 0);   // 150cc
  await race.init();
  race.updateRanks();
  let frames = 0;
  try {
    for (let f = 0; f < 1500; f++) {
      const input = {
        accel: f % 200 > 10,
        brake: (f % 400) < 20,
        left: Math.sin(f * 0.03) > 0.3,
        right: Math.sin(f * 0.03) < -0.3
      };
      if (f % 300 === 150 && race.player.powerUp !== PowerUp.NONE)
        useItem(race.player, race, f % 600 === 150);
      if (f % 777 === 0) race.player.shortJump();
      race.time += 1 / 60;
      race.update(1 / 60, input);
      race.draw(ctx, race.player);
      // 模拟状态机切换渲染
      if (f % 900 === 0) {
        const rs = new RaceStartState(race);
        rs.init();
        if (rs.phase === 'anim') { rs.phase = 'lights'; rs.lightTimer = 1; }
        rs.update(1 / 60); rs.draw(ctx);
        const pause = new PauseState(race); pause.draw(ctx);
        const end = new RaceEndState(race); end.init(); end.t = 2; end.draw(ctx);
      }
      frames++;
    }
    check('25s模拟 ' + trackId, true,
      '帧=' + frames + ' drawImage=' + log.drawImageCount +
      ' laps=' + race.player.laps);
  } catch (e) {
    check('25s模拟 ' + trackId, false,
      '第' + frames + '帧: ' + e.message);
    throw e;
  }
}

// 4张对战场地：45秒气球战模拟
for (const bid of BATTLE_COURSE_IDS) {
  const race = new Race(bid, 2, 0, { battle: true });
  await race.init();
  race.updateRanks();
  let frames = 0;
  try {
    for (let f = 0; f < 2700; f++) {
      const input = {
        accel: true, brake: false,
        left: Math.sin(f * 0.05) > 0.3,
        right: Math.sin(f * 0.05) < -0.3
      };
      if (race.player.canDrive() && f % 240 === 120 && race.player.powerUp !== PowerUp.NONE)
        useItem(race.player, race, true);
      race.time += 1 / 60;
      race.update(1 / 60, input);
      race.draw(ctx, race.player);
      frames++;
    }
    check('45s对战模拟 ' + bid, true,
      '帧=' + frames + ' 我方气球=' + race.player.balloons +
      ' 命中=' + race.player.hitsDealt + ' timeLeft=' + race.timeLeft.toFixed(0));
  } catch (e) {
    check('45s对战模拟 ' + bid, false, '第' + frames + '帧: ' + e.message);
    throw e;
  }
}

// 选人界面逐帧（C++布局）
Game.mode = 'gp'; Game.ccIndex = 1; Game.playerChar = 0;
const cs = new CharacterSelectState(); cs.init();
for (let f = 0; f < 120; f++) { cs.idx = f % 8; cs.update(1 / 60); cs.draw(ctx); }
check('选人界面逐帧', true);

return getFailed();

