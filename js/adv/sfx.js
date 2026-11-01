/**
 * ============================================================
 * adv/sfx.js —— 冒险游戏音效（Web Audio 实时合成，零音频文件）
 * ------------------------------------------------------------
 * 策略同贪吃蛇：默认静音，首次用户交互后自动启用，
 * 用户手动开关写入 localStorage['zjj_adv_sound']，之后沿用该偏好。
 * ============================================================
 */

const KEY = 'zjj_adv_sound';

class AdvSfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.state = localStorage.getItem(KEY) === 'on' ? 'on' : 'off';
    this._bound = false;
    this._bindUnlock();
  }

  get enabled() { return this.state === 'on'; }

  toggle() {
    this.state = this.state === 'on' ? 'off' : 'on';
    localStorage.setItem(KEY, this.state);
    if (this.state === 'on') {
      this._ensure();
      this.blip({ freq: 720, dur: 0.09 });
      this.blip({ freq: 1080, t: 0.08, dur: 0.11 });
    }
    return this.state;
  }

  _bindUnlock() {
    const unlock = () => {
      if (!this._bound) {
        this._bound = true;
        if (localStorage.getItem(KEY) === null) {
          this.state = 'on';
          localStorage.setItem(KEY, 'on');
          document.dispatchEvent(new CustomEvent('adv:sound', { detail: this.state }));
        }
        this._ensure();
      }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
  }

  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.3;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  blip({ freq = 440, type = 'sine', t = 0, dur = 0.09, vol = 0.42, slide = 0 }) {
    if (!this.enabled) return;
    this._ensure();
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const t0 = ctx.currentTime + t;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(50, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise({ t = 0, dur = 0.14, vol = 0.26, freq = 1400, q = 0.9 }) {
    if (!this.enabled) return;
    this._ensure();
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(bp).connect(g).connect(this.master);
    src.start(ctx.currentTime + t);
  }

  swing() { this.noise({ dur: 0.12, vol: 0.18, freq: 2200, q: 1.4 }); }
  hit() { this.blip({ freq: 260, type: 'square', dur: 0.06, vol: 0.2, slide: -120 }); this.noise({ dur: 0.08, vol: 0.14, freq: 900 }); }
  crit() { this.blip({ freq: 980, type: 'square', dur: 0.08, vol: 0.24, slide: 420 }); this.blip({ freq: 1320, type: 'sine', t: 0.05, dur: 0.1, vol: 0.2 }); }
  hurt() { this.blip({ freq: 220, type: 'sawtooth', dur: 0.16, vol: 0.22, slide: -90 }); this.noise({ dur: 0.16, vol: 0.16, freq: 420 }); }
  kill() { this.blip({ freq: 420, type: 'triangle', dur: 0.1, vol: 0.22, slide: 260 }); this.noise({ t: 0.03, dur: 0.14, vol: 0.16, freq: 1600 }); }
  dash() { this.noise({ dur: 0.18, vol: 0.16, freq: 3200, q: 0.6 }); }
  pickupNode() {
    [659.25, 830.61, 987.77].forEach((f, i) => this.blip({ freq: f, type: 'triangle', t: i * 0.06, dur: 0.16, vol: 0.3 }));
  }
  potion() { this.blip({ freq: 880, type: 'sine', dur: 0.12, vol: 0.22, slide: 240 }); }
  levelUp() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.blip({ freq: f, type: 'triangle', t: i * 0.09, dur: 0.22, vol: 0.3 })); }
  win() { [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.blip({ freq: f, type: 'triangle', t: i * 0.12, dur: 0.3, vol: 0.32 })); }
  over() { this.blip({ freq: 320, type: 'sawtooth', dur: 0.24, vol: 0.26, slide: -180 }); this.blip({ freq: 170, type: 'square', t: 0.14, dur: 0.34, vol: 0.2, slide: -80 }); }
}

export const sfx = new AdvSfx();
