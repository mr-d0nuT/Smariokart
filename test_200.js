/* ============================================================
 * Super Mario Kart Web - 200 Gameplay Simulation Tests
 * Verifies all gameplay mechanics, shell lifecycle, kart bumping,
 * pipe bounces, item systems, and AI race integrity.
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

function fakeCtx() {
  return new Proxy({}, {
    get(t, k) {
      if (k === 'getImageData' || k === 'createImageData') {
        return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      }
      if (k === 'createLinearGradient' || k === 'createRadialGradient') {
        return () => ({ addColorStop() {} });
      }
      return () => {};
    }
  });
}

global.document = {
  createElement: () => ({ width: 8, height: 8, getContext: () => fakeCtx() }),
  getElementById: () => ({ getContext: () => fakeCtx() })
};
global.window = { addEventListener() {} };
global.Image = class {
  set src(v) {
    this.width = 8;
    this.height = 8;
    setTimeout(() => this.onload && this.onload(), 0);
  }
};
global.fetch = async (url) => {
  const p = path.join(__dirname, url);
  const buf = fs.readFileSync(p);
  return {
    text: async () => buf.toString('utf8'),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  };
};
global.performance = require('perf_hooks').performance;

const files = ['assets.js', 'audio.js', 'mode7.js', 'map.js', 'animator.js',
               'ai.js', 'driver.js', 'items.js', 'gui.js', 'trackgen.js', 'states.js'];
let src = '';
for (const f of files) src += fs.readFileSync(path.join(__dirname, 'js', f), 'utf8') + '\n';
src = src.replace('boot();', '');

const fn = new Function(src + `
return (async () => {
  let passed = 0;
  let failed = 0;
  function assert(name, condition, extra = '') {
    if (condition) {
      passed++;
      if (passed % 25 === 0 || passed === 200) {
        console.log("  [TEST " + passed + "/200 PASSED] " + name + (extra ? " (" + extra + ")" : ""));
      }
    } else {
      failed++;
      console.error("  [FAIL] " + name + " " + extra);
    }
  }

  console.log("Starting 200 Gameplay Simulation Tests...");

  // =========================================================================
  // SUITE 1 (Tests 1 - 40): Shell Impact, Multi-Hit Prevention & Destruction
  // =========================================================================
  const tracks = ['mario_circuit_1', 'mario_circuit_2', 'donut_plains_1', 'koopa_beach_1', 'bowser_castle_1'];
  for (let t = 0; t < 5; t++) {
    const trackName = tracks[t];
    // Test 1-4 per track: Green shell single hit & immediate disposal
    for (let testIdx = 0; testIdx < 4; testIdx++) {
      const race = new Race(trackName, 1, 0);
      await race.init();
      const p1 = GameMap.getPlayerInitialPosition(1);
      const p8 = GameMap.getPlayerInitialPosition(8);
      const startAngle = -Math.PI / 2;
      
      // Line up 4 karts ahead of player on start straight
      for (let k = 1; k <= 4; k++) {
        race.drivers[k].position = { x: p8.x, y: p8.y - k * 0.012 };
        race.drivers[k].posAngle = startAngle;
        race.drivers[k].speedForward = 0.02 * k;
      }
      race.player.position = { x: p8.x, y: p8.y };
      race.player.posAngle = startAngle;
      race.player.powerUp = PowerUp.GREEN_SHELL;
      useItem(race.player, race, true);

      let hitDrivers = new Set();
      for (let f = 0; f < 60; f++) {
        race.update(1/60, { accel: true, brake: false, left: false, right: false });
        for (let k = 1; k <= 4; k++) {
          if (race.drivers[k].has(DS.UNCONTROLLED)) hitDrivers.add(k);
        }
      }
      assert(trackName + " Green Shell exact 1 hit (no multi-hit) trial " + (testIdx+1),
             hitDrivers.size === 1 && race.items.length === 0,
             "hits=" + hitDrivers.size + " items=" + race.items.length);
    }

    // Test 5-8 per track: Red shell single hit & disposal
    for (let testIdx = 0; testIdx < 4; testIdx++) {
      const race = new Race(trackName, 1, 0);
      await race.init();
      const p8 = GameMap.getPlayerInitialPosition(8);
      const startAngle = -Math.PI / 2;
      for (let k = 1; k <= 4; k++) {
        race.drivers[k].position = { x: p8.x, y: p8.y - k * 0.012 };
        race.drivers[k].posAngle = startAngle;
        race.drivers[k].speedForward = 0.02 * k;
      }
      race.player.position = { x: p8.x, y: p8.y };
      race.player.posAngle = startAngle;
      race.player.powerUp = PowerUp.RED_SHELL;
      useItem(race.player, race, true);

      let hitDrivers = new Set();
      for (let f = 0; f < 60; f++) {
        race.update(1/60, { accel: true, brake: false, left: false, right: false });
        for (let k = 1; k <= 4; k++) {
          if (race.drivers[k].has(DS.UNCONTROLLED)) hitDrivers.add(k);
        }
      }
      assert(trackName + " Red Shell exact 1 hit (no multi-hit) trial " + (testIdx+1),
             hitDrivers.size === 1 && race.items.length === 0,
             "hits=" + hitDrivers.size + " items=" + race.items.length);
    }
  }

  // =========================================================================
  // SUITE 2 (Tests 41 - 80): Kart-to-Kart Bump Physics & Anti-Catapult
  // =========================================================================
  for (let i = 0; i < 40; i++) {
    const race = new Race("mario_circuit_2", 1, 0);
    await race.init();
    const pSpd = 0.03 + (i % 8) * 0.01;
    const oppSpd = 0.01 + (i % 5) * 0.005;
    const opp = race.drivers[1];
    opp.position = { x: 0.88, y: 0.60 };
    opp.posAngle = -Math.PI / 2;
    opp.speedForward = oppSpd;

    race.player.position = { x: 0.88, y: 0.608 };
    race.player.posAngle = -Math.PI / 2;
    race.player.speedForward = pSpd;

    const pStartY = race.player.position.y;
    const oppStartY = opp.position.y;

    for (let f = 0; f < 30; f++) {
      race.update(1/60, { accel: true, brake: false, left: false, right: false });
    }

    const pDyTiles = (race.player.position.y - pStartY) * 128;
    const oppDyTiles = (opp.position.y - oppStartY) * 128;

    const noCatapult = pDyTiles <= 0.5 && oppDyTiles >= -8.0;
    const noSpinout = !race.player.has(DS.UNCONTROLLED) && !opp.has(DS.UNCONTROLLED);
    assert("Kart bump smooth arcade response test #" + (i+1),
           noCatapult && noSpinout,
           "pDy=" + pDyTiles.toFixed(2) + " oppDy=" + oppDyTiles.toFixed(2));
  }

  // =========================================================================
  // SUITE 3 (Tests 81 - 120): Pipe Collision, Wall Bounce & Zero Spinout
  // =========================================================================
  for (let i = 0; i < 40; i++) {
    const race = new Race("mario_circuit_2", 1, 0);
    await race.init();
    const pipes = GameMap.wallObjects.filter(w => w.type === WallType.GREEN_PIPE || w.type === WallType.ORANGE_PIPE);
    const pipe = pipes[i % pipes.length];
    
    // Drive towards pipe
    const angle = (i * Math.PI / 20);
    race.player.position = { x: pipe.x - Math.cos(angle) * (1.8 / 128),
                             y: pipe.y - Math.sin(angle) * (1.8 / 128) };
    race.player.posAngle = angle;
    race.player.speedForward = 0.05;
    race.player.coins = 5;

    for (let f = 0; f < 30; f++) {
      race.update(1/60, { accel: true, brake: false, left: false, right: false });
    }

    const noSpin = !race.player.has(DS.UNCONTROLLED);
    const coinOk = race.player.coins >= 3;
    const distToPipe = Math.hypot(race.player.position.x - pipe.x, race.player.position.y - pipe.y) * 128;
    const separated = distToPipe >= 1.0;
    assert("Pipe solid bounce test #" + (i+1),
           noSpin && coinOk && separated,
           "noSpin=" + noSpin + " coins=" + race.player.coins + " dist=" + distToPipe.toFixed(2));
  }

  // =========================================================================
  // SUITE 4 (Tests 121 - 160): Banana, Mushroom, Star & Thunder Systems
  // =========================================================================
  for (let i = 0; i < 40; i++) {
    const race = new Race("mario_circuit_2", 1, 0);
    await race.init();
    const type = i % 4;
    if (type === 0) {
      race.player.position = { x: 0.88, y: 0.60 };
      race.player.posAngle = -Math.PI / 2;
      race.player.powerUp = PowerUp.BANANA;
      useItem(race.player, race, false);
      assert("Banana placed behind test #" + (i+1), race.items.length === 1 && race.player.powerUp === PowerUp.NONE);
    } else if (type === 1) {
      race.player.powerUp = PowerUp.MUSHROOM;
      const spd0 = race.player.speedForward;
      useItem(race.player, race, true);
      assert("Mushroom boost test #" + (i+1),
             race.player.has(DS.SPEED_UP) && race.player.speedForward > spd0);
    } else if (type === 2) {
      race.player.powerUp = PowerUp.STAR;
      useItem(race.player, race, true);
      assert("Star immunity test #" + (i+1),
             race.player.has(DS.STAR) && race.player.isImmune() === true);
    } else {
      race.player.rank = 7;
      race.player.powerUp = PowerUp.THUNDER;
      useItem(race.player, race, true);
      const higherDrivers = race.drivers.filter(d => d.rank < 7);
      assert("Thunder hit higher drivers test #" + (i+1),
             higherDrivers.every(d => d.has(DS.SPEED_DOWN) && d.animator.smallTime > 0));
    }
  }

  // =========================================================================
  // SUITE 5 (Tests 161 - 200): GP Laps, Rank Sorting & Battle Mode
  // =========================================================================
  for (let i = 0; i < 20; i++) {
    const race = new Race("mario_circuit_1", 1, 0);
    await race.init();
    race.updateRanks();
    const sorted = race.ranking.every((d, idx) => idx === 0 || race.ranking[idx - 1].rank <= d.rank);
    assert("Race ranking sort test #" + (i+1), sorted && race.ranking.length === 8);
  }

  for (let i = 0; i < 20; i++) {
    const btRace = new Race("battle_course_1", 1, 0, { battle: true });
    await btRace.init();
    btRace.update(1/60, {});
    const p1 = btRace.drivers[1];
    p1.popState(DS.SHIELD);
    p1.applyHit();
    assert("Battle balloon hit & shield test #" + (i+1),
           p1.balloons === 2 && p1.has(DS.SHIELD));
  }

  console.log("\\n=======================================================");
  console.log("FINAL RESULTS: " + passed + "/200 PASSED, " + failed + " FAILED");
  console.log("=======================================================");
  if (failed > 0) process.exit(1);
})();
`);

fn().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
