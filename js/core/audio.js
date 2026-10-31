/**
 * ============================================================
 * core/audio.js —— 交互音效引擎（Web Audio 合成，零音频文件）
 * ------------------------------------------------------------
 * 策略（遵守浏览器自动播放限制）：
 *  - 默认静音；localStorage 键 'zjj_sound' 存 'on' | 'off'
 *  - 首次用户交互（pointerdown/keydown）后才允许创建/恢复
 *    AudioContext；若用户从未设置过偏好，首次交互即视为「启用」
 *  - 所有音色用振荡器/噪声合成：hover 滴答、click 确认、
 *    whoosh 转场、toggle 开关音、modal 弹窗音
 * 扩展：SOUNDS 里加新音色 → 组件里 audio.play('新音色')
 * ============================================================
 */

const STORAGE_KEY = 'zjj_sound';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    /** @type {'on'|'off'} */
    this.state = localStorage.getItem(STORAGE_KEY) === 'on' ? 'on' : 'off';
    this._everInteracted = false;
    this._bindFirstInteraction();
  }

  /** 是否发声（对外只读判断用） */
  get enabled() { return this.state === 'on'; }

  /** 切换开关并持久化；返回新状态 */
  toggle() {
    this.state = this.state === 'on' ? 'off' : 'on';
    localStorage.setItem(STORAGE_KEY, this.state);
    if (this.state === 'on') {
      this._ensureCtx();
      this.play('toggleOn');
    }
    return this.state;
  }

  /** 首次交互：解锁 AudioContext；无偏好记录时默认启用一次 */
  _bindFirstInteraction() {
    const unlock = () => {
      if (this._everInteracted) return;
      this._everInteracted = true;
      // 用户从未手动设置过 → 遵循需求「默认静音、首次交互后启用」
      if (localStorage.getItem(STORAGE_KEY) === null) {
        this.state = 'on';
        localStorage.setItem(STORAGE_KEY, 'on');
        document.dispatchEvent(new CustomEvent('sound:state', { detail: this.state }));
      }
      this._ensureCtx();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
  }

  _ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32; // 全局音量，避免刺耳
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /** 播放命名音效；静音或上下文未就绪时静默返回 */
  play(name) {
    if (!this.enabled) return;
    this._ensureCtx();
    if (!this.ctx || this.ctx.state !== 'running') return;
    const fn = SOUNDS[name];
    if (fn) fn(this.ctx, this.master);
  }
}

/* ---------------- 音色库（全部为合成音） ---------------- */

function tone(ctx, out, { freq = 440, type = 'sine', t = 0, dur = 0.08, vol = 0.5, slide = 0 }) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const t0 = ctx.currentTime + t;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(ctx, out, { t = 0, dur = 0.15, vol = 0.3, freq = 1200, q = 0.8 }) {
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
  src.connect(bp).connect(g).connect(out);
  src.start(ctx.currentTime + t);
}

const SOUNDS = {
  /** 悬停：极轻的电子滴答 */
  hover: (ctx, out) => tone(ctx, out, { freq: 1250, type: 'triangle', dur: 0.045, vol: 0.16 }),
  /** 点击：确认感双音 */
  click: (ctx, out) => {
    tone(ctx, out, { freq: 620, type: 'square', dur: 0.06, vol: 0.2 });
    tone(ctx, out, { freq: 930, type: 'sine', t: 0.045, dur: 0.09, vol: 0.22 });
  },
  /** 区块转场：向上滑行的嗖声 */
  whoosh: (ctx, out) => {
    noise(ctx, out, { dur: 0.22, vol: 0.2, freq: 900 });
    tone(ctx, out, { freq: 320, type: 'sawtooth', dur: 0.2, vol: 0.1, slide: 700 });
  },
  /** 弹窗打开 */
  modal: (ctx, out) => {
    tone(ctx, out, { freq: 520, type: 'sine', dur: 0.1, vol: 0.24 });
    tone(ctx, out, { freq: 780, type: 'sine', t: 0.07, dur: 0.12, vol: 0.22 });
    tone(ctx, out, { freq: 1040, type: 'sine', t: 0.15, dur: 0.14, vol: 0.18 });
  },
  /** 开启音效 */
  toggleOn: (ctx, out) => {
    tone(ctx, out, { freq: 660, type: 'triangle', dur: 0.09, vol: 0.26 });
    tone(ctx, out, { freq: 990, type: 'triangle', t: 0.08, dur: 0.12, vol: 0.24 });
  },
  /** 播放视频 */
  play: (ctx, out) => {
    tone(ctx, out, { freq: 440, type: 'sine', dur: 0.08, vol: 0.22 });
    tone(ctx, out, { freq: 880, type: 'sine', t: 0.06, dur: 0.1, vol: 0.2 });
  },
};

/** 单例导出 */
export const audio = new AudioEngine();

/** 给元素批量绑定 hover/click 音效（各组件渲染后调用） */
export function bindSfx(root = document) {
  root.querySelectorAll('a, button, .project-media, .gallery-item, .stat-card, .skill-group, .honor-card, .contact-card')
    .forEach((el) => {
      if (el.dataset.sfxBound) return;
      el.dataset.sfxBound = '1';
      el.addEventListener('mouseenter', () => audio.play('hover'), { passive: true });
      el.addEventListener('click', () => audio.play('click'));
    });
}
