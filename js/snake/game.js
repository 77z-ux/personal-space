/**
 * ============================================================
 * snake/game.js —— 贪吃蛇核心引擎（Canvas 2D，零依赖）
 * ------------------------------------------------------------
 * 职责：网格状态、方向队列、步进推进、碰撞判定、插值渲染。
 * 与 UI 完全解耦：只通过 opts 回调把「吃豆 / 通关 / 死亡 / 状态变化」
 * 抛给外部，因此换皮肤、改玩法都不必动这里。
 *
 * 手感要点：
 *  1. 固定步长逻辑（stepMs） + requestAnimationFrame 插值渲染，
 *     所以画面是 60fps 平滑移动，而不是一格一格跳。
 *  2. 方向输入进入队列（最多缓存 2 个），避免连按两下拐弯被吞。
 *  3. 每一步都校验「不能 180° 反向」，防止原地自杀。
 * ============================================================
 */

const COLORS = {
  gridDot: 'rgba(120, 160, 255, 0.10)',
  gridLine: 'rgba(90, 130, 220, 0.055)',
  head: '#7ef9ff',
  body0: '#00e5ff',
  body1: '#7c4dff',
  body2: '#ff4081',
  food: '#69f0ae',
};

/** 缓动：让每格之间的位移有点加速度，手感更“有重量” */
const easeOut = (t) => 1 - Math.pow(1 - t, 2.2);

export class SnakeGame {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{cols?:number,rows?:number,stepMs?:number,minStepMs?:number,
   *          onEat?:(index:number,score:number)=>void,
   *          onWin?:(r:{score:number,ms:number})=>void,
   *          onOver?:(r:{score:number,ms:number,reason:string})=>void,
   *          onStateChange?:(s:string)=>void}} opts
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cols = opts.cols || 19;
    this.rows = opts.rows || 19;
    this.baseStep = opts.stepMs || 155;
    this.minStep = opts.minStepMs || 92;
    this.stepMs = this.baseStep;
    this.target = opts.target || 12;

    this.onEat = opts.onEat || (() => {});
    this.onWin = opts.onWin || (() => {});
    this.onOver = opts.onOver || (() => {});
    this.onStateChange = opts.onStateChange || (() => {});

    /** @type {'idle'|'running'|'paused'|'over'|'won'} */
    this.state = 'idle';
    this.score = 0;
    this.acc = 0;
    this.lastTs = 0;
    this.t = 0; // 步进插值系数 0~1
    this.particles = [];
    this.pulse = 0; // 吃豆时的光晕脉冲
    this.timeMs = 0;
    this._raf = 0;

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(canvas.parentElement || canvas);
    this.reset(); // 先建状态，resize 内部会立刻渲染一帧
    this.resize();

    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  /* ------------------------------ 生命周期 ------------------------------ */

  reset() {
    const cx = Math.floor(this.cols / 2);
    const cy = Math.floor(this.rows / 2);
    this.cells = [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy },
    ];
    this.prev = this.cells.map((c) => ({ ...c }));
    this.dir = { x: 1, y: 0 };
    this.queue = [];
    this.score = 0;
    this.stepMs = this.baseStep;
    this.acc = 0;
    this.t = 1;
    this.timeMs = 0;
    this.particles = [];
    this.pulse = 0;
    this.food = this._spawnFood();
    this._setState('idle');
  }

  start() {
    if (this.state === 'over' || this.state === 'won') this.reset();
    if (this.state === 'running') return;
    this.lastTs = 0;
    this._setState('running');
  }

  pause() {
    if (this.state !== 'running') return;
    this._setState('paused');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.lastTs = 0;
    this._setState('running');
  }

  togglePause() {
    if (this.state === 'running') this.pause();
    else if (this.state === 'paused') this.resume();
    else if (this.state === 'idle') this.start();
  }

  restart() {
    this.reset();
    this.start();
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    this._resizeObserver.disconnect();
  }

  /* ------------------------------ 输入 ------------------------------ */

  /** @param {'up'|'down'|'left'|'right'} name */
  setDirection(name) {
    const map = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    };
    const d = map[name];
    if (!d) return;
    if (this.state === 'idle') this.start();
    if (this.state === 'paused') this.resume();
    if (this.state === 'over' || this.state === 'won') return;

    // 以队列末尾的方向（或当前方向）作为参照，禁止反向
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
    if (last.x + d.x === 0 && last.y + d.y === 0) return; // 180°
    if (last.x === d.x && last.y === d.y) return; // 同向，忽略
    if (this.queue.length >= 2) return;
    this.queue.push(d);
  }

  /* ------------------------------ 逻辑步进 ------------------------------ */

  _step() {
    // 从队列取一个合法方向
    if (this.queue.length) {
      const d = this.queue.shift();
      if (!(this.dir.x + d.x === 0 && this.dir.y + d.y === 0)) this.dir = d;
    }

    const head = { x: this.cells[0].x + this.dir.x, y: this.cells[0].y + this.dir.y };

    // 撞墙
    if (head.x < 0 || head.y < 0 || head.x >= this.cols || head.y >= this.rows) {
      this._die('撞到了边界');
      return;
    }

    const eating = this.food && head.x === this.food.x && head.y === this.food.y;
    // 不吃豆时尾巴会腾出格子，因此可以撞“尾巴当前位置”
    const bodyLimit = eating ? this.cells.length : this.cells.length - 1;
    for (let i = 0; i < bodyLimit; i++) {
      if (this.cells[i].x === head.x && this.cells[i].y === head.y) {
        this._die('咬到了自己');
        return;
      }
    }

    const old = this.cells.map((c) => ({ x: c.x, y: c.y }));
    this.cells.unshift(head);
    if (!eating) this.cells.pop();
    // 每个片段：从「上一帧的同一序位」平滑过渡到当前位置
    this.prev = this.cells.map((c, i) => (old[i] ? { x: old[i].x, y: old[i].y } : { x: c.x, y: c.y }));

    if (eating) this._eat();
  }

  _eat() {
    this.score += 1;
    const eatenCell = this.food ? { x: this.food.x, y: this.food.y } : null;
    this._burst(this.food.x, this.food.y);
    this.pulse = 1;
    // 越吃越快（有下限），让节奏逐渐紧张
    this.stepMs = Math.max(this.minStep, this.baseStep - this.score * 5);
    // 第三个参数 = 被吃掉豆子的格子坐标，供 UI 在原地弹提示
    this.onEat(this.score - 1, this.score, eatenCell);

    if (this.score >= this.target) {
      this.food = null;
      this._setState('won');
      this.onWin({ score: this.score, ms: this.timeMs });
      return;
    }
    this.food = this._spawnFood();
  }

  _die(reason) {
    this._setState('over');
    this.onOver({ score: this.score, ms: this.timeMs, reason });
  }

  _spawnFood() {
    const taken = new Set(this.cells.map((c) => `${c.x},${c.y}`));
    const free = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (!taken.has(`${x},${y}`)) free.push({ x, y });
      }
    }
    if (!free.length) return null;
    return free[Math.floor(Math.random() * free.length)];
  }

  _setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.onStateChange(s);
  }

  /* ------------------------------ 粒子 ------------------------------ */

  _burst(cx, cy) {
    const cell = this.size / this.cols;
    const px = (cx + 0.5) * cell;
    const py = (cy + 0.5) * cell;
    const colors = ['#69f0ae', '#7ef9ff', '#7c4dff', '#ff4081'];
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 210;
      this.particles.push({
        x: px,
        y: py,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1,
        size: 1.4 + Math.random() * 2.6,
        color: colors[(Math.random() * colors.length) | 0],
      });
    }
  }

  _updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.vy += 26 * dt;
      p.life -= dt * 2.1;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  /* ------------------------------ 主循环 ------------------------------ */

  _loop(ts) {
    this._raf = requestAnimationFrame(this._loop);
    if (!this.lastTs) this.lastTs = ts;
    let dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    if (dt > 0.12) dt = 0.12; // 切后台回来防止一次跳很多格

    if (this.state === 'running') {
      this.timeMs += dt * 1000;
      this.acc += dt * 1000;
      let guard = 0;
      while (this.acc >= this.stepMs && guard++ < 6) {
        this.acc -= this.stepMs;
        this._step();
        if (this.state !== 'running') {
          this.acc = 0;
          break;
        }
      }
      this.t = Math.min(1, this.acc / this.stepMs);
    } else {
      this.t = 1;
    }

    this.pulse = Math.max(0, this.pulse - dt * 2.4);
    this._updateParticles(dt);
    this.render(this.state === 'running' ? easeOut(this.t) : 1);
  }

  /* ------------------------------ 渲染 ------------------------------ */

  resize() {
    const parent = this.canvas.parentElement || this.canvas;
    const rect = parent.getBoundingClientRect();
    const size = Math.max(160, Math.min(rect.width, rect.height || rect.width));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.size = size;
    this.dpr = dpr;
    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._buildBackground(); // 网格只画一次，逐帧 drawImage，省掉 361 次 arc
    this.render(1);
  }

  /** 预渲染静态网格底图（尺寸变化时才重建） */
  _buildBackground() {
    const S = this.size;
    const cs = S / this.cols;
    const bg = document.createElement('canvas');
    bg.width = Math.round(S * this.dpr);
    bg.height = Math.round(S * this.dpr);
    const c = bg.getContext('2d');
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    c.fillStyle = COLORS.gridDot;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        c.beginPath();
        c.arc((x + 0.5) * cs, (y + 0.5) * cs, Math.max(0.6, cs * 0.04), 0, Math.PI * 2);
        c.fill();
      }
    }
    c.strokeStyle = COLORS.gridLine;
    c.lineWidth = 1;
    for (let i = 1; i < this.cols; i++) {
      c.beginPath();
      c.moveTo(i * cs, 0);
      c.lineTo(i * cs, S);
      c.stroke();
      c.beginPath();
      c.moveTo(0, i * cs);
      c.lineTo(S, i * cs);
      c.stroke();
    }
    this.bgCanvas = bg;
  }

  _center(cell) {
    const cs = this.size / this.cols;
    return { x: (cell.x + 0.5) * cs, y: (cell.y + 0.5) * cs };
  }

  render(t = 1) {
    const ctx = this.ctx;
    const S = this.size;
    if (!S || !this.cells) return;
    const cs = S / this.cols;

    ctx.clearRect(0, 0, S, S);

    // 网格（预渲染底图）
    if (this.bgCanvas) ctx.drawImage(this.bgCanvas, 0, 0, S, S);

    // 豆子（成长节点）
    if (this.food) {
      const c = this._center(this.food);
      const time = performance.now() / 1000;
      const breathe = 0.86 + Math.sin(time * 3.2) * 0.09;
      const r = cs * 0.34 * breathe;

      const halo = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, cs * 1.15);
      halo.addColorStop(0, 'rgba(105, 240, 174, 0.55)');
      halo.addColorStop(0.45, 'rgba(0, 229, 255, 0.16)');
      halo.addColorStop(1, 'rgba(0, 229, 255, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(c.x, c.y, cs * 1.15, 0, Math.PI * 2);
      ctx.fill();

      // 旋转的能量环
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(time * 1.4);
      ctx.strokeStyle = 'rgba(105, 240, 174, 0.85)';
      ctx.lineWidth = Math.max(1, cs * 0.05);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a0 = (i * Math.PI) / 2 + 0.16;
        ctx.arc(0, 0, cs * 0.46, a0, a0 + 0.9);
      }
      ctx.stroke();
      ctx.restore();

      const core = ctx.createRadialGradient(c.x - r * 0.3, c.y - r * 0.3, 0, c.x, c.y, r);
      core.addColorStop(0, '#ffffff');
      core.addColorStop(0.45, '#9dffd0');
      core.addColorStop(1, '#22c98d');
      ctx.fillStyle = core;
      ctx.shadowColor = 'rgba(105, 240, 174, 0.9)';
      ctx.shadowBlur = cs * 0.9;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // 蛇身：插值后的中心点连成一条圆角折线
    const pts = this.cells.map((c, i) => {
      const a = this._center(this.prev[i] || c);
      const b = this._center(c);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    });

    if (pts.length) {
      const head = pts[0];
      const tail = pts[pts.length - 1];
      const grad = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y);
      grad.addColorStop(0, COLORS.head);
      grad.addColorStop(0.5, COLORS.body0);
      grad.addColorStop(0.78, COLORS.body1);
      grad.addColorStop(1, COLORS.body2);

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // 外发光：两层加宽半透明描边（比 shadowBlur 便宜得多）
      ctx.strokeStyle = grad;
      ctx.globalAlpha = 0.15 + this.pulse * 0.2;
      ctx.lineWidth = cs * (1.18 + this.pulse * 0.45);
      this._path(pts);
      ctx.stroke();
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = cs * 0.9;
      this._path(pts);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // 实体
      ctx.lineWidth = cs * 0.66;
      this._path(pts);
      ctx.stroke();

      // 内部高光
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.lineWidth = cs * 0.16;
      this._path(pts);
      ctx.stroke();

      // 头部：眼睛 + 朝向
      const d = this.dir;
      const eyeOff = cs * 0.17;
      const perp = { x: -d.y, y: d.x };
      const eyeFwd = cs * 0.13;
      const eyeR = Math.max(1.3, cs * 0.085);
      ctx.fillStyle = '#04121f';
      [-1, 1].forEach((s) => {
        ctx.beginPath();
        ctx.arc(
          head.x + d.x * eyeFwd + perp.x * eyeOff * s,
          head.y + d.y * eyeFwd + perp.y * eyeOff * s,
          eyeR,
          0,
          Math.PI * 2
        );
        ctx.fill();
      });
      ctx.fillStyle = '#7ef9ff';
      [-1, 1].forEach((s) => {
        ctx.beginPath();
        ctx.arc(
          head.x + d.x * eyeFwd + perp.x * eyeOff * s - d.x * eyeR * 0.3,
          head.y + d.y * eyeFwd + perp.y * eyeOff * s - d.y * eyeR * 0.3,
          eyeR * 0.42,
          0,
          Math.PI * 2
        );
        ctx.fill();
      });
    }

    // 粒子
    if (this.particles.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this.particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  _path(pts) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  }
}
