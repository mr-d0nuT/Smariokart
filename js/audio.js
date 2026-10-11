/* ============================================================
 * Süper Mario Kart Web - 音频系统 (WebAudio)
 * 引擎音效循环变速 / 音乐 / 一次性音效
 * 音频文件位于本地 assets/sfx、assets/music、assets/circuit/*。
 * ============================================================ */
'use strict';

const Sound = {
  ctx: null, master: null,
  music: null, musicName: '', musicGain: null, musicLoop: true,
  engines: [],       // 每个车手一个引擎声部
  sfxCache: {},
  muted: false,
  _pendingMusic: '',
  _listenersSet: false,

  init() {
    if (this.ctx) return;
    try {
      this.muted = typeof localStorage !== 'undefined' && localStorage.getItem('smk_audio_muted') === '1';
    } catch (e) { this.muted = false; }

    const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
    if (AC) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    }

    if (typeof window !== 'undefined' && !this._listenersSet) {
      this._listenersSet = true;
      const unlock = () => { this.resume(); };
      ['click', 'pointerdown', 'touchstart', 'keydown', 'mousedown'].forEach(ev => {
        window.addEventListener(ev, unlock, { passive: true });
      });
    }
    this.updateMuteUI();
  },

  toggleMute() {
    this.init();
    this.muted = !this.muted;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('smk_audio_muted', this.muted ? '1' : '0');
      }
    } catch (e) {}

    if (this.master) {
      this.master.gain.value = this.muted ? 0 : 0.5;
    }
    if (this.music && this.isFile()) {
      this.music.volume = this.muted ? 0 : 0.55;
    }
    if (!this.muted) {
      this.resume();
    }
    this.updateMuteUI();
    return this.muted;
  },

  updateMuteUI() {
    if (typeof document === 'undefined') return;
    const btn = document.getElementById('btnAudioToggle');
    if (btn) {
      btn.textContent = this.muted ? '🔇' : '🔊';
      if (btn.classList && btn.classList.toggle) {
        btn.classList.toggle('is-muted', this.muted);
      }
    }
  },

  /* 浏览器手势策略：必须在用户交互后恢复 */
  /* file:// 下 fetch/WebAudio解码受限：改用HTMLAudio元素直放 */
  isFile() { return typeof location !== 'undefined' && location.protocol === 'file:'; },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {}).then(() => {
        if (this._pendingMusic) {
          const m = this._pendingMusic;
          this._pendingMusic = '';
          this.playMusic(m);
        }
      });
    } else if (this._pendingMusic) {
      const m = this._pendingMusic;
      this._pendingMusic = '';
      this.playMusic(m);
    }
  },

  /* 自动播放被浏览器策略拒绝时的重试队列（开屏BGM等场景） */
  _retryTimers: {},
  _queueAutoplayRetry(key, makeElem) {
    if (this._retryTimers[key]) return;
    let tries = 0;
    this._retryTimers[key] = setInterval(() => {
      tries++;
      const p = makeElem().play();
      if (p && p.catch) p.catch(() => {});
      if (tries > 40 || !this._lastElemPaused) {}
    }, 800);
  },
  sfxPath(name) {
    const file = name.startsWith('sfx_') ? name.slice(4) : name;
    return ASSET_ROOT + 'sfx/' + file + '.ogg';
  },
  play(name, { loop = false, volume = 1.0, rate = 1.0 } = {}) {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.resume();
    }
    const finalVol = this.muted ? 0 : volume;

    if (this.isFile() || !this.ctx || !Assets.audio[name]) {
      // file:// 回退或无WebAudio缓存：HTMLAudio元素直放
      try {
        const a = new Audio(this.sfxPath(name));
        a.volume = finalVol * 0.6;
        a.playbackRate = rate;
        a.loop = !!loop;
        const p = a.play();
        if (p && p.catch) p.catch(err => {
          if (err && err.name === 'NotAllowedError' && !this._retryTimers['sfx:' + name]) {
            this._retryTimers['sfx:' + name] = setInterval(() => {
              const q = a.play();
              if (q && q.catch) q.catch(() => {});
              if (!a.paused) { clearInterval(this._retryTimers['sfx:' + name]); delete this._retryTimers['sfx:' + name]; }
            }, 700);
          }
        });
        return {
          src: {
            stop() {
              a.pause();
              try { a.currentTime = 0; } catch (e) {}
            }
          },
          g: {
            get gain() {
              return {
                get value() { return a.volume; },
                set value(v) { a.volume = v; }
              };
            }
          }
        };
      } catch (e) {
        return null;
      }
    }
    const buf = Assets.audio[name];
    if (!buf) return null;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = loop;
      src.playbackRate.value = rate;
      const g = this.ctx.createGain();
      g.gain.value = finalVol;
      src.connect(g).connect(this.master);
      src.start();
      return { src, g };
    } catch (e) {
      return null;
    }
  },

  stop(handle) {
    if (handle) try { handle.src.stop(); } catch (e) {}
  },

  /* ---- 音乐 ---- */
  MUSIC_FILES: {
    music_menu: 'music/menu_title_screen.ogg',
    music_playerselect: 'music/menu_player_circuit.ogg',
    music_opening: 'music/circuit_opening.ogg'
  },
  playMusic(name) {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this._pendingMusic = name;
    }

    if (this.isFile() || !this.ctx || !Assets.audio[name]) {
      this.stopMusic();
      this.musicName = name;
      const file = this.MUSIC_FILES[name] || window.__circuitMusic || 'music/menu_title_screen.ogg';
      try {
        const a = new Audio(ASSET_ROOT + file);
        a.loop = true;
        a.volume = this.muted ? 0 : 0.55;
        this.music = a;
        const p = a.play();
        if (p && p.catch) p.catch(err => {
          if (!this._bgmRetry) {
            this._bgmRetry = setInterval(() => {
              const q = a.play();
              if (q && q.catch) q.catch(() => {});
              if (!a.paused) { clearInterval(this._bgmRetry); this._bgmRetry = null; }
            }, 700);
          }
        });
        this.musicGain = { gain: { get value() { return a.volume; }, set value(v) { a.volume = v; } } };
      } catch (e) {}
      return;
    }

    if (this.musicName === name && this.music) return;
    this.stopMusic();
    this.musicName = name;
    if (!Assets.audio[name]) return;
    try {
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.55;
      this.music = this.ctx.createBufferSource();
      this.music.buffer = Assets.audio[name];
      this.music.loop = true;
      this.music.connect(this.musicGain).connect(this.master);
      this.music.start();
    } catch (e) {}
  },
  stopMusic() {
    if (this.music && this.music.pause) try { this.music.pause(); } catch (e) {}
    if (this.music) try { this.music.stop && this.music.stop(); } catch (e) {}
    this.music = null; this.musicName = '';
  },
  fadeOutMusic(dt) {
    if (this.musicGain) {
      this.musicGain.gain.value = Math.max(0, this.musicGain.gain.value - dt * 0.8);
      if (this.musicGain.gain.value <= 0) this.stopMusic();
    }
  },

  /* ---- 引擎声（单声道，音调随速度） ---- */
  startEngine() {
    this.init();
    if (this.engines.length) return;
    if (this.isFile()) {
      const a = new Audio(ASSET_ROOT + 'sfx/engine.ogg');
      a.loop = true; a.volume = 0.12;
      const p = a.play(); if (p && p.catch) p.catch(() => {});
      this.engines.push({ src: { stop() { a.pause(); }, get playbackRate() { return a.playbackRate; }, set playbackRate(v) { a.playbackRate = v; } }, g: { get gain() { return { get value() { return a.volume; }, set value(v) { a.volume = v; } }; } } });
      return;
    }
    if (!this.ctx) return;
    const buf = Assets.audio['sfx_engine'];
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0.12;
    src.connect(g).connect(this.master);
    src.start();
    this.engines.push({ src, g });
  },
  stopEngine() {
    for (const e of this.engines) { try { e.src.stop(); } catch (err) {} e.g.gain.value = 0; }
    this.engines = [];
  },
  updateEngine(speedPct) {
    if (!this.engines.length) return;
    const e = this.engines[0];
    if (this.isFile()) {
      // file://：src 是 HTMLAudio 元素，playbackRate/gain 直接赋数值
      e.src.playbackRate = 0.75 + speedPct * 0.9;
      e.g.gain.value = 0.06 + speedPct * 0.08;
    } else {
      // WebAudio：playbackRate 是 AudioParam
      e.src.playbackRate.value = 0.75 + speedPct * 0.9;
      e.g.gain.value = 0.06 + speedPct * 0.08;
    }
  }
};





