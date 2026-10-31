/**
 * ============================================================
 * snake/sfx.js —— 游戏音效（Web Audio 实时合成，零音频文件）
 * ------------------------------------------------------------
 * 遵守浏览器自动播放策略：
 *  - 初始静音，首次用户交互（pointerdown / keydown）后自动启用；
 *  - 用户手动开关的状态写入 localStorage['zjj_snake_sound']，
 *    下次进入沿用该偏好，不会再被自动改写。
 * 音色全部由振荡器合成：吃豆（音高随分数上升）、转向、暂停、通关、失败。
 * ============================================================
 */

const KEY = 'zjj_snake_sound';

class SnakeSfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.state = localStorage.getItem(KEY) === 'on' ? 'on' : 'off';
    this._bound = false;
    this._bindUnlock();
  }

  get enabled() {
    return this.state === 'on';
  }

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
          document.dispatchEvent(new CustomEvent('snake:sound', { detail: this.state }));
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

  /** 基础合成音 */
  blip({ freq = 440, type = 'sine', t = 0, dur = 0.09, vol = 0.45, slide = 0 }) {
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

  /** 吃豆：五声音阶随分数递进，越吃越高 */
  eat(score = 0) {
    const scale = [523.25, 587.33, 659.25, 783.99, 880];
    const f = scale[score % scale.length] * (1 + Math.floor(score / 5) * 0.5);
    this.blip({ freq: f, type: 'triangle', dur: 0.09, vol: 0.4 });
    this.blip({ freq: f * 1.5, type: 'sine', t: 0.05, dur: 0.12, vol: 0.22 });
  }

  turn() {
    this.blip({ freq: 1350, type: 'square', dur: 0.025, vol: 0.07 });
  }

  pause(open) {
    this.blip({ freq: open ? 520 : 360, type: 'sine', dur: 0.1, vol: 0.24 });
  }

  win() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      this.blip({ freq: f, type: 'triangle', t: i * 0.11, dur: 0.28, vol: 0.34 });
    });
  }

  over() {
    this.blip({ freq: 320, type: 'sawtooth', dur: 0.24, vol: 0.26, slide: -180 });
    this.blip({ freq: 180, type: 'square', t: 0.14, dur: 0.34, vol: 0.2, slide: -90 });
  }
}

export const sfx = new SnakeSfx();
