/**
 * ============================================================
 * playground/mecanum.js —— 麦克纳姆轮运动解算沙盒
 * ------------------------------------------------------------
 * 一个纯前端的底盘俯视仿真：拖滑块 / 按 WASD 给底盘一个运动指令，
 * 实时看到「指令 → 四轮轮速 → 实际运动」这条链路。
 *
 * 坐标约定（右手系，俯视）：
 *   x 指向车头，y 指向车身左侧，ωz 逆时针为正。
 *
 * 逆解（底盘指令 → 四轮角速度），K = a + b：
 *   ω_fl = ( vx - vy - K·ωz ) / r
 *   ω_fr = ( vx + vy + K·ωz ) / r
 *   ω_rl = ( vx + vy - K·ωz ) / r
 *   ω_rr = ( vx - vy + K·ωz ) / r
 *
 * 正解（四轮角速度 → 底盘实际运动）是上式的伪逆，
 * 用来演示「轮速被限幅之后，底盘其实跑的不是你要的方向」。
 *
 * 扩展：改 GEO 默认值 / 在 DEMO 里加动作段即可，无需改渲染逻辑。
 * ============================================================
 */

import { audio } from '../core/audio.js';

/* ---------------- 车轮与解算 ---------------- */

/** a=1 表示 +vx，b=1 表示 +vy，c=1 表示 +K·ωz */
const WHEELS = [
  { label: '左前', sx: 1, sy: 1, a: 1, b: -1, c: -1, roller: 1 },
  { label: '右前', sx: 1, sy: -1, a: 1, b: 1, c: 1, roller: -1 },
  { label: '左后', sx: -1, sy: 1, a: 1, b: 1, c: -1, roller: -1 },
  { label: '右后', sx: -1, sy: -1, a: 1, b: -1, c: 1, roller: 1 },
];

/** 逆解：底盘速度 → 四轮角速度（rad/s） */
export function inverse(vx, vy, wz, geo) {
  const K = geo.a + geo.b;
  return WHEELS.map((w) => (w.a * vx + w.b * vy + w.c * K * wz) / geo.r);
}

/** 正解：四轮角速度 → 底盘实际速度（最小二乘意义下的逆） */
export function forward(wheels, geo) {
  const K = geo.a + geo.b;
  const r = geo.r;
  const [fl, fr, rl, rr] = wheels;
  return {
    vx: (fl + fr + rl + rr) * r / 4,
    vy: (-fl + fr + rl - rr) * r / 4,
    wz: (-fl + fr - rl + rr) * r / (4 * K),
  };
}

/** 限幅：等比缩放保方向；硬截断会引入残差（正是要演示的现象） */
function limitWheels(wheels, geo) {
  const peak = Math.max(...wheels.map(Math.abs));
  if (peak <= geo.limit) return { wheels, saturated: false };
  if (geo.mode === 'scale') {
    const k = geo.limit / peak;
    return { wheels: wheels.map((v) => v * k), saturated: true };
  }
  return {
    wheels: wheels.map((v) => Math.max(-geo.limit, Math.min(geo.limit, v))),
    saturated: true,
  };
}

/* ---------------- 常量 ---------------- */

const GEO = {
  a: 0.20,       // 半轴距（车心到前后轮）
  b: 0.18,       // 半轮距（车心到左右轮）
  r: 0.06,       // 轮半径 m
  limit: 20,     // 单轮最大角速度 rad/s
  mode: 'scale', // 'scale' 等比缩放 | 'clip' 硬截断
};

const KEY_V = 0.9;   // 键盘平移速度 m/s
const KEY_W = 1.6;   // 键盘旋转角速度 rad/s
const V_MAX = 1.2;   // 滑块上限
const W_MAX = 2.4;

/** 自动演示：一段动作接一段动作，循环播放 */
const DEMO = [
  { dur: 2.0, vx: 0.9, vy: 0, wz: 0, label: '直线前进' },
  { dur: 2.0, vx: 0, vy: 0.9, wz: 0, label: '横向平移（不转头）' },
  { dur: 2.0, vx: 0.55, vy: 0.55, wz: 0, label: '斜向 45° 移动' },
  { dur: 1.8, vx: 0, vy: 0, wz: 1.6, label: '原地自转' },
  { dur: 3.0, vx: 0.7, vy: 0, wz: 0.8, label: '边走边转 → 画圆' },
  { dur: 1.2, vx: 0, vy: 0, wz: 0, label: '停止' },
];

/* ---------------- 运行时状态 ---------------- */

const state = {
  target: { vx: 0, vy: 0, wz: 0 },
  wheelsCmd: [0, 0, 0, 0],
  wheels: [0, 0, 0, 0],
  actual: { vx: 0, vy: 0, wz: 0 },
  pose: { x: 0, y: 0, yaw: 0 },
  cam: { x: 0, y: 0 },
  trail: [],
  odom: 0,
  saturated: false,
  demo: null,
  keys: new Set(),
  lastT: 0,
  raf: 0,
  running: false,
  trailT: 0,
};

let refs = null;   // DOM 引用
let view = null;   // canvas 上下文与尺寸

/* ---------------- 入口 ---------------- */

export function initMecanumLab() {
  const modal = document.getElementById('lab-modal');
  const root = document.getElementById('lab-root');
  const trigger = document.getElementById('lab-btn');
  if (!modal || !root || !trigger) return;

  root.innerHTML = template();
  refs = collect(root);
  view = { canvas: refs.canvas, ctx: refs.canvas.getContext('2d'), w: 0, h: 0, dpr: 1, scale: 100 };

  buildWheelRows(refs);
  bindControls(modal, trigger);
  bindKeyboard(modal);

  const ro = new ResizeObserver(() => { if (state.running) resize(); });
  ro.observe(refs.canvas);

  paintStatic();

  // 直达链接：index.html?lab=1（打开沙盒）；?lab=1&demo=1（打开并自动演示）
  const params = new URLSearchParams(location.search);
  const auto = params.get('lab');
  if (auto === '1' || auto === 'mecanum') {
    open();
    if (params.get('demo') === '1') startDemo();
  }
}

/** 开启自动演示：按 DEMO 分段循环 */
function startDemo() {
  state.demo = { i: 0, t: 0 };
  refs.demo.classList.add('on');
  refs.demo.textContent = '停止演示';
  refs.phase.classList.add('on');
}

/* ---------------- 模板 ---------------- */

function template() {
  const slider = (id, label, min, max, step, value, unit, digits) => `
    <div class="lab-slider">
      <label for="${id}">${label}</label>
      <input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" />
      <output id="${id}-o" class="mono">${Number(value).toFixed(digits)}${unit}</output>
    </div>`;

  return `
    <div class="lab-grid">
      <div class="lab-stage">
        <canvas id="lab-canvas" role="img"
          aria-label="麦克纳姆底盘俯视仿真：四个轮子的转速、底盘速度矢量与行走轨迹"></canvas>
        <div class="lab-badge" id="lab-badge">等比缩放 · 未饱和</div>
        <div class="lab-legend">
          <span><i></i>指令</span>
          <span><i class="lg-act"></i>实际</span>
        </div>
        <div class="lab-phase" id="lab-phase">拖动滑块，或用 W A S D / Q E 驾驶</div>
      </div>

      <div class="lab-side">
        <section class="lab-block">
          <h4 class="lab-h4">运动指令<span class="lab-kbd">WASD 平移 · QE 旋转</span></h4>
          ${slider('lab-vx', 'vx 前进', -V_MAX, V_MAX, 0.02, 0, '', 2)}
          ${slider('lab-vy', 'vy 左移', -V_MAX, V_MAX, 0.02, 0, '', 2)}
          ${slider('lab-wz', 'ωz 自转', -W_MAX, W_MAX, 0.02, 0, '', 2)}
          <div class="lab-btnrow">
            <button class="lab-btn" id="lab-demo" type="button">自动演示</button>
            <button class="lab-btn" id="lab-zero" type="button">归零</button>
            <button class="lab-btn" id="lab-clear" type="button">清轨迹</button>
          </div>
        </section>

        <section class="lab-block">
          <h4 class="lab-h4">四轮轮速<span class="lab-peak mono" id="lab-peak"></span></h4>
          <div class="lab-wheels" id="lab-wheels"></div>
          <p class="lab-formula mono" id="lab-formula"></p>
        </section>

        <section class="lab-block">
          <h4 class="lab-h4">实时状态</h4>
          <div class="lab-stats" id="lab-stats"></div>
        </section>

        <details class="lab-block lab-more">
          <summary class="lab-h4">底盘参数 / 限幅策略</summary>
          ${slider('lab-a', '半轴距 a', 0.12, 0.35, 0.01, GEO.a, ' m', 2)}
          ${slider('lab-b', '半轮距 b', 0.10, 0.32, 0.01, GEO.b, ' m', 2)}
          ${slider('lab-r', '轮半径 r', 0.03, 0.10, 0.005, GEO.r, ' m', 3)}
          ${slider('lab-limit', '轮速上限', 8, 40, 1, GEO.limit, ' rad/s', 0)}
          <div class="lab-toggle" id="lab-mode">
            <button type="button" data-mode="scale" class="on">等比缩放</button>
            <button type="button" data-mode="clip">硬截断</button>
          </div>
          <p class="lab-note">
            超限时，<b>等比缩放</b>四轮同比例降速：方向不变，只是变慢。<br />
            <b>硬截断</b>各自削到上限：被削掉的转速不会消失，正解会把它读成额外的速度与偏航 —— 轨迹就歪了。
          </p>
        </details>
      </div>
    </div>`;
}

/* ---------------- 引用收集 ---------------- */

function collect(root) {
  const $ = (id) => root.querySelector('#' + id);
  return {
    root,
    canvas: $('lab-canvas'),
    badge: $('lab-badge'),
    phase: $('lab-phase'),
    peak: $('lab-peak'),
    wheels: $('lab-wheels'),
    formula: $('lab-formula'),
    stats: $('lab-stats'),
    demo: $('lab-demo'),
    zero: $('lab-zero'),
    clear: $('lab-clear'),
    vx: $('lab-vx'), vy: $('lab-vy'), wz: $('lab-wz'),
    vxo: $('lab-vx-o'), vyo: $('lab-vy-o'), wzo: $('lab-wz-o'),
    a: $('lab-a'), b: $('lab-b'), r: $('lab-r'), limit: $('lab-limit'),
    ao: $('lab-a-o'), bo: $('lab-b-o'), ro: $('lab-r-o'), limo: $('lab-limit-o'),
    mode: $('lab-mode'),
  };
}

/* ---------------- 轮速行 ---------------- */

function buildWheelRows(r) {
  r.wheels.innerHTML = WHEELS.map((w, i) => `
    <div class="lab-wheel">
      <span class="lab-wl">${w.label}</span>
      <span class="lab-bar"><i data-bar="${i}"></i></span>
      <span class="lab-wv mono" data-val="${i}">0.0</span>
    </div>`).join('');

  r.stats.innerHTML = [
    ['目标 vx', 'data-st="tvx"'], ['目标 vy', 'data-st="tvy"'], ['目标 ωz', 'data-st="twz"'],
    ['实际 vx', 'data-st="avx"'], ['实际 vy', 'data-st="avy"'], ['实际 ωz', 'data-st="awz"'],
    ['里程', 'data-st="odom"'], ['航向', 'data-st="yaw"'],
  ].map(([label, attr]) => `<div class="lab-stat"><span>${label}</span><b ${attr}>0</b></div>`).join('');

  r.bars = [...r.wheels.querySelectorAll('[data-bar]')];
  r.vals = [...r.wheels.querySelectorAll('[data-val]')];
  r.st = {};
  r.stats.querySelectorAll('[data-st]').forEach((el) => { r.st[el.dataset.st] = el; });
}

/* ---------------- 事件绑定 ---------------- */

function bindControls(modal, trigger) {
  trigger.addEventListener('click', () => { open(); audio.play('modal'); });

  modal.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.running) { e.preventDefault(); close(); }
  });

  const r = refs;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  r.vx.addEventListener('input', () => {
    state.target.vx = clamp(+r.vx.value, -V_MAX, V_MAX);
    stopDemo();
    paintSliders();
  });
  r.vy.addEventListener('input', () => {
    state.target.vy = clamp(+r.vy.value, -V_MAX, V_MAX);
    stopDemo();
    paintSliders();
  });
  r.wz.addEventListener('input', () => {
    state.target.wz = clamp(+r.wz.value, -W_MAX, W_MAX);
    stopDemo();
    paintSliders();
  });

  r.demo.addEventListener('click', () => {
    if (state.demo) { stopDemo(); return; }
    startDemo();
  });

  r.zero.addEventListener('click', () => {
    stopDemo();
    state.target.vx = 0; state.target.vy = 0; state.target.wz = 0;
    paintSliders();
  });

  r.clear.addEventListener('click', () => {
    state.trail.length = 0;
    state.odom = 0;
  });

  const syncGeo = (key, el, out, unit, digits) => {
    el.addEventListener('input', () => {
      GEO[key] = +el.value;
      out.textContent = GEO[key].toFixed(digits) + unit;
      paintFormula();
    });
  };
  syncGeo('a', r.a, r.ao, ' m', 2);
  syncGeo('b', r.b, r.bo, ' m', 2);
  syncGeo('r', r.r, r.ro, ' m', 3);
  syncGeo('limit', r.limit, r.limo, ' rad/s', 0);

  r.mode.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    GEO.mode = btn.dataset.mode;
    r.mode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
  });
}

function bindKeyboard(modal) {
  const MAP = { w: 'w', a: 'a', s: 's', d: 'd', q: 'q', e: 'e' };

  document.addEventListener('keydown', (e) => {
    if (!state.running) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    const k = MAP[e.key.toLowerCase()];
    if (!k) return;
    e.preventDefault();
    state.keys.add(k);
  });

  document.addEventListener('keyup', (e) => {
    const k = MAP[e.key.toLowerCase()];
    if (k) state.keys.delete(k);
  });

  window.addEventListener('blur', () => state.keys.clear());
}

/* ---------------- 开 / 关 ---------------- */

let bodyOverflow = '';

function open() {
  const modal = document.getElementById('lab-modal');
  if (!modal || state.running) return;
  modal.hidden = false;
  state.running = true;
  bodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  // 尺寸必须在可见之后量，否则拿到 0
  requestAnimationFrame(() => {
    resize();
    state.cam.x = state.pose.x;
    state.cam.y = state.pose.y;
    state.lastT = performance.now();
    state.raf = requestAnimationFrame(loop);
  });
}

function close() {
  const modal = document.getElementById('lab-modal');
  if (!modal) return;
  modal.hidden = true;
  state.running = false;
  state.keys.clear();
  cancelAnimationFrame(state.raf);
  document.body.style.overflow = bodyOverflow;
}

/* ---------------- 尺寸 ---------------- */

function resize() {
  const c = refs.canvas;
  const rect = c.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  view.w = rect.width;
  view.h = rect.height;
  view.dpr = dpr;
  c.width = Math.round(rect.width * dpr);
  c.height = Math.round(rect.height * dpr);
  // 视野约 4.0m × 2.5m（取较紧的一边，保证车身够大、轨迹能看清）
  view.scale = Math.min(rect.width / 4.0, rect.height / 2.5);

  // 背景渐变只随尺寸变化，缓存避免每帧重建
  const g = view.ctx.createRadialGradient(rect.width / 2, rect.height / 2, 0, rect.width / 2, rect.height / 2, Math.max(rect.width, rect.height) * 0.7);
  g.addColorStop(0, '#080e1e');
  g.addColorStop(1, '#04060d');
  view.bg = g;
}

/* ---------------- 主循环 ---------------- */

function loop(now) {
  const dt = Math.min(0.05, Math.max(0, (now - state.lastT) / 1000));
  state.lastT = now;

  step(dt);
  render();

  state.hudT = (state.hudT || 0) + dt;
  if (state.hudT > 0.06) { state.hudT = 0; paintHud(); }

  if (state.running) state.raf = requestAnimationFrame(loop);
}

function step(dt) {
  /* 键盘优先于滑块 */
  const k = state.keys;
  let kvx = 0, kvy = 0, kwz = 0;
  if (k.has('w')) kvx += 1;
  if (k.has('s')) kvx -= 1;
  if (k.has('a')) kvy += 1;
  if (k.has('d')) kvy -= 1;
  if (k.has('q')) kwz += 1;
  if (k.has('e')) kwz -= 1;

  if (kvx || kvy || kwz) {
    state.target.vx = kvx * KEY_V;
    state.target.vy = kvy * KEY_V;
    state.target.wz = kwz * KEY_W;
    stopDemo();
    paintSliders();
  }

  /* 自动演示 */
  if (state.demo) {
    const seg = DEMO[state.demo.i];
    state.demo.t += dt;
    if (state.demo.t >= seg.dur) {
      state.demo.t -= seg.dur;
      state.demo.i = (state.demo.i + 1) % DEMO.length;
      paintSliders();
    }
    const cur = DEMO[state.demo.i];
    state.target.vx = cur.vx;
    state.target.vy = cur.vy;
    state.target.wz = cur.wz;
    if (refs.phase.textContent !== cur.label) refs.phase.textContent = cur.label;
  }

  /* 逆解 → 限幅 → 正解 */
  const cmd = inverse(state.target.vx, state.target.vy, state.target.wz, GEO);
  const lim = limitWheels(cmd, GEO);
  state.wheelsCmd = cmd;
  state.wheels = lim.wheels;
  state.saturated = lim.saturated;
  state.actual = forward(lim.wheels, GEO);

  /* 积分 */
  const yaw = state.pose.yaw;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const wx = state.actual.vx * c - state.actual.vy * s;
  const wy = state.actual.vx * s + state.actual.vy * c;

  state.pose.x += wx * dt;
  state.pose.y += wy * dt;
  state.pose.yaw = wrap(state.pose.yaw + state.actual.wz * dt);
  state.odom += Math.hypot(wx, wy) * dt;

  /* 相机缓动跟随 */
  const kc = 1 - Math.exp(-6 * dt);
  state.cam.x += (state.pose.x - state.cam.x) * kc;
  state.cam.y += (state.pose.y - state.cam.y) * kc;

  /* 轨迹采样 */
  state.trailT += dt;
  if (state.trailT >= 0.05) {
    state.trailT = 0;
    state.trail.push({ x: state.pose.x, y: state.pose.y });
    if (state.trail.length > 1100) state.trail.shift();
  }
}

function wrap(a) {
  const t = Math.PI * 2;
  return ((a + Math.PI) % t + t) % t - Math.PI;
}

/* ---------------- 绘制 ---------------- */

function render() {
  const { ctx, w, h, dpr, scale } = view;
  if (!w || !h) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const bg = view.bg;
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = '#05070f';
    ctx.fillRect(0, 0, w, h);
  }

  const ox = w / 2 - state.cam.x * scale;
  const oy = h / 2 + state.cam.y * scale;

  drawGrid(ctx, w, h, ox, oy, scale);
  drawTrail(ctx, ox, oy, scale);
  drawRobot(ctx, ox, oy, scale);
}

function drawGrid(ctx, w, h, ox, oy, s) {
  const { cam } = state;
  const x0 = cam.x - (w / 2) / s, x1 = cam.x + (w / 2) / s;
  const y0 = cam.y - (h / 2) / s, y1 = cam.y + (h / 2) / s;

  ctx.lineWidth = 1;
  if (s >= 46) {
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.055)';
    ctx.beginPath();
    for (let x = Math.floor(x0 * 4) / 4; x <= x1; x += 0.25) {
      const sx = Math.round(ox + x * s) + 0.5;
      ctx.moveTo(sx, 0); ctx.lineTo(sx, h);
    }
    for (let y = Math.floor(y0 * 4) / 4; y <= y1; y += 0.25) {
      const sy = Math.round(oy - y * s) + 0.5;
      ctx.moveTo(0, sy); ctx.lineTo(w, sy);
    }
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(0, 229, 255, 0.13)';
  ctx.beginPath();
  for (let x = Math.floor(x0); x <= x1; x++) {
    const sx = Math.round(ox + x * s) + 0.5;
    ctx.moveTo(sx, 0); ctx.lineTo(sx, h);
  }
  for (let y = Math.floor(y0); y <= y1; y++) {
    const sy = Math.round(oy - y * s) + 0.5;
    ctx.moveTo(0, sy); ctx.lineTo(w, sy);
  }
  ctx.stroke();

  // 世界原点十字
  ctx.strokeStyle = 'rgba(124, 77, 255, 0.35)';
  ctx.beginPath();
  ctx.moveTo(ox - 8, oy); ctx.lineTo(ox + 8, oy);
  ctx.moveTo(ox, oy - 8); ctx.lineTo(ox, oy + 8);
  ctx.stroke();
}

function drawTrail(ctx, ox, oy, s) {
  const t = state.trail;
  if (t.length < 2) return;

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < t.length; i++) {
    const sx = ox + t[i].x * s;
    const sy = oy - t[i].y * s;
    if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
  }
  ctx.strokeStyle = 'rgba(124, 77, 255, 0.4)';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // 轨迹末端提亮，强调“刚刚走过”
  const n = Math.min(24, t.length);
  ctx.beginPath();
  for (let i = t.length - n; i < t.length; i++) {
    const sx = ox + t[i].x * s;
    const sy = oy - t[i].y * s;
    if (i === t.length - n) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
  }
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawRobot(ctx, ox, oy, s) {
  const { pose, wheels } = state;
  const A = GEO.a + 0.05;   // 车体半长
  const B = GEO.b + 0.05;   // 车体半宽
  const wl = 0.056;         // 轮半长
  const ww = 0.017;         // 轮半宽

  ctx.save();
  ctx.translate(ox + pose.x * s, oy - pose.y * s);
  ctx.scale(s, -s);
  ctx.rotate(pose.yaw);

  ctx.lineJoin = 'round';

  // 车体
  roundRect(ctx, -A, -B, A * 2, B * 2, 0.03);
  ctx.fillStyle = 'rgba(0, 229, 255, 0.07)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.55)';
  ctx.lineWidth = 0.004;
  ctx.stroke();

  // 车头指示
  ctx.beginPath();
  ctx.moveTo(A + 0.045, 0);
  ctx.lineTo(A - 0.005, 0.028);
  ctx.lineTo(A - 0.005, -0.028);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0, 229, 255, 0.75)';
  ctx.fill();

  // 四个轮子：颜色 = 转向，亮度 = 转速
  WHEELS.forEach((w, i) => {
    const cx = w.sx * GEO.a;
    const cy = w.sy * GEO.b;
    const v = wheels[i];
    const t = Math.max(-1, Math.min(1, v / GEO.limit));
    const mag = 0.18 + 0.72 * Math.abs(t);

    roundRect(ctx, cx - wl, cy - ww, wl * 2, ww * 2, 0.008);
    ctx.fillStyle = v >= 0
      ? `rgba(0, 229, 255, ${mag.toFixed(3)})`
      : `rgba(255, 64, 129, ${mag.toFixed(3)})`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(6, 12, 24, 0.75)';
    ctx.lineWidth = 0.003;
    ctx.stroke();

    // 辊子斜纹（X 型布置）
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - wl, cy - ww, wl * 2, ww * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(6, 12, 24, 0.6)';
    ctx.lineWidth = 0.0035;
    const slope = w.roller * ww; // 45° 纹路
    for (let x = -wl; x <= wl; x += 0.018) {
      ctx.beginPath();
      ctx.moveTo(cx + x - slope, cy - ww);
      ctx.lineTo(cx + x + slope, cy + ww);
      ctx.stroke();
    }
    ctx.restore();
  });

  // 速度矢量：虚线 = 指令，实线 = 实际
  const K = 0.45; // 每 1 m/s 画 0.45m
  const { target, actual } = state;
  if (Math.hypot(target.vx, target.vy) > 0.02) {
    arrow(ctx, 0, 0, target.vx * K, target.vy * K, 0.005, 'rgba(0, 229, 255, 0.85)', [0.03, 0.022]);
  }
  if (Math.hypot(actual.vx, actual.vy) > 0.02) {
    arrow(ctx, 0, 0, actual.vx * K, actual.vy * K, 0.007, 'rgba(105, 240, 174, 0.95)', null);
  }

  ctx.restore();
}

function roundRect(c, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.lineTo(x + w - rr, y);
  c.quadraticCurveTo(x + w, y, x + w, y + rr);
  c.lineTo(x + w, y + h - rr);
  c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  c.lineTo(x + rr, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - rr);
  c.lineTo(x, y + rr);
  c.quadraticCurveTo(x, y, x + rr, y);
  c.closePath();
}

function arrow(c, x0, y0, x1, y1, lw, color, dash) {
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const head = 0.035;
  c.save();
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = lw;
  if (dash) c.setLineDash(dash);
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1 - Math.cos(ang) * head * 0.6, y1 - Math.sin(ang) * head * 0.6);
  c.stroke();
  c.setLineDash([]);
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x1 - head * Math.cos(ang - 0.42), y1 - head * Math.sin(ang - 0.42));
  c.lineTo(x1 - head * Math.cos(ang + 0.42), y1 - head * Math.sin(ang + 0.42));
  c.closePath();
  c.fill();
  c.restore();
}

/* ---------------- 面板刷新 ---------------- */

function paintStatic() {
  paintSliders();
  paintFormula();
  paintHud();
}

function fmt(v, d = 2) {
  return (v >= 0 ? '+' : '') + v.toFixed(d);
}

function paintSliders() {
  const { target } = state;
  refs.vx.value = target.vx;
  refs.vy.value = target.vy;
  refs.wz.value = target.wz;
  refs.vxo.textContent = fmt(target.vx);
  refs.vyo.textContent = fmt(target.vy);
  refs.wzo.textContent = fmt(target.wz);
}

function paintFormula() {
  const K = (GEO.a + GEO.b).toFixed(2);
  refs.formula.textContent = `ωᵢ = (vx ∓ vy ∓ K·ωz) / r　K = a + b = ${K} m`;
}

function paintHud() {
  const { wheels, actual, target, saturated } = state;

  wheels.forEach((v, i) => {
    const ratio = Math.min(1, Math.abs(v) / GEO.limit);
    const bar = refs.bars[i];
    bar.style.width = (ratio * 100).toFixed(1) + '%';
    bar.style.background = v >= 0
      ? 'linear-gradient(90deg, #00e5ff, #7c4dff)'
      : 'linear-gradient(90deg, #ff4081, #7c4dff)';
    refs.vals[i].textContent = `${v.toFixed(1)}`;
  });

  const peak = Math.max(...wheels.map(Math.abs));
  refs.peak.textContent = `峰值 ${peak.toFixed(1)} / ${GEO.limit} rad/s`;

  const st = refs.st;
  st.tvx.textContent = fmt(target.vx);
  st.tvy.textContent = fmt(target.vy);
  st.twz.textContent = fmt(target.wz);
  st.avx.textContent = fmt(actual.vx);
  st.avy.textContent = fmt(actual.vy);
  st.awz.textContent = fmt(actual.wz);
  st.odom.textContent = state.odom.toFixed(2) + ' m';
  st.yaw.textContent = ((state.pose.yaw * 180) / Math.PI).toFixed(1) + '°';

  const deviates = Math.hypot(actual.vx - target.vx, actual.vy - target.vy) > 0.03
    || Math.abs(actual.wz - target.wz) > 0.05;

  refs.badge.textContent = saturated
    ? (GEO.mode === 'scale' ? '等比缩放 · 轮速饱和（变慢）' : '硬截断 · 轮速饱和（跑歪）')
    : (GEO.mode === 'scale' ? '等比缩放 · 未饱和' : '硬截断 · 未饱和');
  refs.badge.classList.toggle('warn', saturated && GEO.mode === 'clip');
  refs.badge.classList.toggle('slow', saturated && GEO.mode === 'scale');
  refs.badge.dataset.deviate = deviates ? '1' : '0';

  if (!state.demo) {
    if (refs.phase.classList.contains('on')) {
      refs.phase.classList.remove('on');
      refs.phase.textContent = '拖动滑块，或用 W A S D / Q E 驾驶';
    }
  }
}

function stopDemo() {
  if (!state.demo) return;
  state.demo = null;
  refs.demo.classList.remove('on');
  refs.demo.textContent = '自动演示';
  refs.phase.classList.remove('on');
  refs.phase.textContent = '拖动滑块，或用 W A S D / Q E 驾驶';
}
