/**
 * ============================================================
 * adv/game.js —— 冒险游戏主引擎（Canvas 2D，零依赖）
 * ------------------------------------------------------------
 * 职责：跑图 / 输入解算 / 战斗判定 / 相机 / 粒子 / 小地图 / 结算。
 * 与 DOM 完全解耦：所有 UI 事件通过 opts 回调抛给 main.js。
 * 状态机： idle(开始界面) → running → levelup(升级三选一) → paused
 *          → won(集齐 12 节点) / over(阵亡)
 * ============================================================
 */

import { CONFIG, NODE_COUNT, PERKS } from './data.js';
import { generateDungeon, makeRng, circleHitsWall, markExplored } from './dungeon.js';
import { Player, Enemy, Pickup } from './entities.js';

const noop = () => {};
const DEG = Math.PI / 180;

/** 归一化到 (-PI, PI] 的角度差 */
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class AdventureGame {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts;
    this.onNode = opts.onNode || noop;
    this.onKill = opts.onKill || noop;
    this.onLevelUp = opts.onLevelUp || noop;
    this.onEnd = opts.onEnd || noop;
    this.onHit = opts.onHit || noop;   // 命中怪物（含是否暴击）
    this.onHurt = opts.onHurt || noop; // 玩家受伤
    this.onStateChange = opts.onStateChange || noop;
    this.onPickup = opts.onPickup || noop;

    /** @type {'idle'|'running'|'paused'|'levelup'|'won'|'over'} */
    this.state = 'idle';
    this.input = { mx: 0, my: 0 };
    this.time = 0;
    this.camera = { x: 0, y: 0 };
    this.shake = 0;
    this.particles = [];
    this.floats = [];
    this.pendingLevels = 0;

    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(canvas.parentElement || canvas);

    this.newRun();
    this.resize();
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  /* ------------------------------ 一局新游戏 ------------------------------ */
  newRun() {
    const rng = makeRng(Date.now());
    this.map = generateDungeon(rng);
    this.rng = rng;

    const spawnRoom = this.map.rooms[0];
    this.player = new Player(
      spawnRoom.cx * CONFIG.tile + CONFIG.tile / 2,
      spawnRoom.cy * CONFIG.tile + CONFIG.tile / 2
    );

    const rest = this.map.rooms.slice(1);

    // 宝藏：12 个（= 生涯节点数），轮流放进各房间
    this.pickups = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      const room = rest[i % rest.length];
      const spot = this._freeSpot(room, rng);
      this.pickups.push(new Pickup('chest', spot.x, spot.y, i));
    }
    // 药水：回血补给
    for (let i = 0; i < 6; i++) {
      const room = rng.pick ? rng.pick(rest) : rest[rng.int(0, rest.length - 1)];
      const spot = this._freeSpot(room, rng);
      this.pickups.push(new Pickup('potion', spot.x, spot.y));
    }

    // 怪物：越靠后的房间越多、越可能出现精英
    this.enemies = [];
    rest.forEach((room, idx) => {
      const count = Math.min(5, 2 + Math.floor(idx / 3));
      for (let i = 0; i < count; i++) {
        const id = idx >= 6 && i === 0 ? 'golem' : rng() > 0.45 ? 'moth' : 'slime';
        const spot = this._freeSpot(room, rng);
        if (Math.hypot(spot.x - this.player.x, spot.y - this.player.y) < 120) continue;
        this.enemies.push(new Enemy(id, spot.x, spot.y, rng));
      }
    });

    this.nodesFound = 0;
    this.kills = 0;
    this.timeMs = 0;
    this.bestiary = new Set();
    this.pendingLevels = 0;
    this.particles = [];
    this.floats = [];
    this.shake = 0;
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;
    this._setState('idle');
  }

  /** 房间里找一个不与已有物件重叠的落点 */
  _freeSpot(room, rng) {
    for (let i = 0; i < 24; i++) {
      const p = this.map.randomSpotIn(room, 1);
      const clash =
        this.pickups?.some((k) => Math.hypot(k.x - p.x, k.y - p.y) < 34) ||
        Math.hypot(p.x - this.player.x, p.y - this.player.y) < 90;
      if (!clash) return p;
    }
    return this.map.randomSpotIn(room, 1);
  }

  /* ------------------------------ 状态控制 ------------------------------ */
  start() {
    if (this.state === 'won' || this.state === 'over') this.newRun();
    this.lastTs = 0;
    this._setState('running');
  }
  pause() { if (this.state === 'running') this._setState('paused'); }
  resume() { if (this.state === 'paused' || this.state === 'levelup') { this.lastTs = 0; this._setState('running'); } }
  togglePause() {
    if (this.state === 'running') this.pause();
    else if (this.state === 'paused') this.resume();
    else if (this.state === 'idle') this.start();
  }

  _setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.onStateChange(s);
  }

  /* ------------------------------ 玩家动作 ------------------------------ */
  tryAttack() {
    if (this.state === 'idle') this.start();
    if (this.state !== 'running') return;
    const atk = this.player.attack();
    if (!atk) return;

    const half = (atk.arc * DEG) / 2;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - atk.x;
      const dy = e.y - atk.y;
      const d = Math.hypot(dx, dy);
      if (d > atk.range + e.r) continue;
      if (Math.abs(angleDiff(Math.atan2(dy, dx), atk.angle)) > half) continue;

      const crit = Math.random() < this.player.stats.crit;
      let dmg = this.player.stats.damage * (crit ? this.player.stats.critMul : 1);
      dmg = Math.round(dmg);
      const dealt = e.takeDamage(dmg, this.player.x, this.player.y);
      this._float(e.x, e.y - e.r - 6, `${crit ? '暴击 ' : ''}${dealt}`, crit ? '#ffd166' : '#ffffff');
      this._burst(e.x, e.y, e.type.color, 6);
      this.onHit({ crit, dealt, enemy: e });

      if (this.player.stats.lifesteal > 0) {
        const healed = this.player.heal(dealt * this.player.stats.lifesteal);
        if (healed >= 1) this._float(this.player.x, this.player.y - 20, `+${healed}`, '#69f0ae');
      }
      if (e.dead) this._onEnemyDead(e);
    }
    this.shake = Math.min(6, this.shake + 2.5);
  }

  tryDash() {
    if (this.state === 'idle') this.start();
    if (this.state !== 'running') return;
    if (this.player.tryDash()) this._burst(this.player.x, this.player.y, '#00e5ff', 10);
  }

  _onEnemyDead(e) {
    this.kills += 1;
    const ups = this.player.gainXp(e.type.xp);
    this.pendingLevels += ups;
    this._burst(e.x, e.y, e.type.color, 18);
    this.onKill(e.type);
    if (ups > 0) this._openLevelUp();
  }

  /* ------------------------------ 升级三选一 ------------------------------ */
  _openLevelUp() {
    const pool = PERKS.slice();
    const picks = [];
    while (picks.length < 3 && pool.length) {
      picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    this._setState('levelup');
    this.onLevelUp(picks);
  }

  choosePerk(id) {
    const perk = PERKS.find((p) => p.id === id);
    if (!perk) return;
    perk.apply(this.player.stats);
    this.pendingLevels = Math.max(0, this.pendingLevels - 1);
    if (this.pendingLevels > 0) this._openLevelUp();
    else { this.lastTs = 0; this._setState('running'); }
  }

  /* ------------------------------ 主循环 ------------------------------ */
  _loop(ts) {
    this._raf = requestAnimationFrame(this._loop);
    if (!this.lastTs) this.lastTs = ts;
    let dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    if (dt > 0.05) dt = 0.05; // 卡顿保护

    if (this.state === 'running') {
      this.time += dt;
      this.timeMs += dt * 1000;
      this.update(dt);
    }
    this.shake = Math.max(0, this.shake - dt * 22);
    this._updateFx(dt);
    this.render();
  }

  update(dt) {
    const p = this.player;
    p.update(dt, this.input, this.map);

    // 迷雾 + 相机
    markExplored(this.map, p.x, p.y, 7);
    const vw = this.view.w / this.zoom;
    const vh = this.view.h / this.zoom;
    this.camera.x += (Math.max(vw / 2, Math.min(p.x, this.map.worldW - vw / 2)) - this.camera.x) * Math.min(1, dt * 9);
    this.camera.y += (Math.max(vh / 2, Math.min(p.y, this.map.worldH - vh / 2)) - this.camera.y) * Math.min(1, dt * 9);

    // 怪物
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.update(dt, p, this.map, this.time);
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < 360) this.bestiary.add(e.type.id);

      // 接触伤害
      if (d < e.r + p.r && e.touchCd <= 0) {
        const dealt = p.takeDamage(e.type.dmg, e.x, e.y);
        e.touchCd = CONFIG.combat.enemyTouchCd;
        if (dealt > 0) {
          this._float(p.x, p.y - 22, `-${dealt}`, '#ff6b8a');
          this.shake = Math.min(12, this.shake + 9);
          this.onHurt(dealt);
        }
      }
    }
    this._separateEnemies();

    // 拾取物
    for (const it of this.pickups) {
      if (it.taken) continue;
      if (Math.hypot(it.x - p.x, it.y - p.y) > it.r + p.r) continue;
      if (it.kind === 'chest') this._openChest(it);
      else {
        const healed = p.heal(CONFIG.combat.potionHeal);
        it.taken = true;
        this._float(p.x, p.y - 24, `+${healed} HP`, '#69f0ae');
        this._burst(it.x, it.y, '#69f0ae', 12);
        this.onPickup({ kind: 'potion', healed });
      }
    }

    this.enemies = this.enemies.filter((e) => !e.dead);

    if (p.hp <= 0) this._end('dead');
    else if (this.nodesFound >= NODE_COUNT) this._end('win');
  }

  /** 怪物互相推挤，避免完全重叠成一坨 */
  _separateEnemies() {
    for (let i = 0; i < this.enemies.length; i++) {
      for (let j = i + 1; j < this.enemies.length; j++) {
        const a = this.enemies[i];
        const b = this.enemies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const min = a.r + b.r - 2;
        if (d < min) {
          const push = (min - d) / 2;
          const nx = (dx / d) * push;
          const ny = (dy / d) * push;
          if (!circleHitsWall(this.map, a.x - nx, a.y - ny, a.r)) { a.x -= nx; a.y -= ny; }
          if (!circleHitsWall(this.map, b.x + nx, b.y + ny, b.r)) { b.x += nx; b.y += ny; }
        }
      }
    }
  }

  _openChest(chest) {
    chest.taken = true;
    const index = Math.min(this.nodesFound, NODE_COUNT - 1);
    this.nodesFound += 1;
    this._burst(chest.x, chest.y, '#ffd166', 22);
    this.onNode(index, chest.x, chest.y);
    if (this.nodesFound >= NODE_COUNT) this._end('win');
  }

  _end(reason) {
    this._setState(reason === 'win' ? 'won' : 'over');
    this.onEnd(this.result(reason));
  }

  result(reason = 'dead') {
    return {
      reason,
      nodes: this.nodesFound,
      kills: this.kills,
      timeMs: this.timeMs,
      level: this.player.level,
      score: this.score,
      bestiary: [...this.bestiary],
      hp: Math.round(this.player.hp),
      maxHp: Math.round(this.player.stats.maxHp),
    };
  }

  get score() {
    const s = CONFIG.score;
    return this.nodesFound * s.node + this.kills * s.kill + (this.nodesFound >= NODE_COUNT ? s.winBonus : 0);
  }

  /* ------------------------------ 特效 ------------------------------ */
  _burst(x, y, color, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 220;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 1, size: 1.5 + Math.random() * 2.6, color,
      });
    }
  }
  _float(x, y, text, color) {
    this.floats.push({ x, y, text, color, life: 1 });
  }
  _updateFx(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.93; p.vy *= 0.93;
      p.life -= dt * 1.9;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.y -= dt * 34;
      f.life -= dt * 1.25;
      if (f.life <= 0) this.floats.splice(i, 1);
    }
  }

  /* ------------------------------ 渲染 ------------------------------ */
  resize() {
    const parent = this.canvas.parentElement || this.canvas;
    const rect = parent.getBoundingClientRect();
    const w = Math.max(280, rect.width);
    const h = Math.max(220, Math.min(rect.height || rect.width * 0.62, 620));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.zoom = w < 520 ? 0.86 : 1; // 手机拉近看得清
    this.view = { w, h };
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render() {
    const ctx = this.ctx;
    const { w, h } = this.view;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    if (!this.map) return;

    const T = CONFIG.tile;
    const vw = w / this.zoom;
    const vh = h / this.zoom;
    const shakeX = (Math.random() - 0.5) * this.shake;
    const shakeY = (Math.random() - 0.5) * this.shake;

    ctx.save();
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(vw / 2 - this.camera.x + shakeX, vh / 2 - this.camera.y + shakeY);

    // 可见范围
    const x0 = Math.max(0, Math.floor((this.camera.x - vw / 2) / T) - 1);
    const x1 = Math.min(this.map.cols - 1, Math.ceil((this.camera.x + vw / 2) / T) + 1);
    const y0 = Math.max(0, Math.floor((this.camera.y - vh / 2) / T) - 1);
    const y1 = Math.min(this.map.rows - 1, Math.ceil((this.camera.y + vh / 2) / T) + 1);

    // 地面
    ctx.fillStyle = '#0a1020';
    ctx.fillRect(x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const wx = tx * T;
        const wy = ty * T;
        if (this.map.grid[ty * this.map.cols + tx] === 1) {
          ctx.fillStyle = '#131c33';
          ctx.fillRect(wx, wy, T, T);
          ctx.fillStyle = 'rgba(0, 229, 255, 0.10)';
          ctx.fillRect(wx, wy, T, 3);
        } else {
          ctx.fillStyle = (tx + ty) % 2 ? '#0c1426' : '#0a1120';
          ctx.fillRect(wx, wy, T, T);
          ctx.strokeStyle = 'rgba(90, 130, 220, 0.055)';
          ctx.lineWidth = 1;
          ctx.strokeRect(wx + 0.5, wy + 0.5, T, T);
        }
      }
    }

    // 拾取物
    for (const it of this.pickups) {
      if (it.taken) continue;
      const bob = Math.sin(this.time * 2.6 + it.bob) * 3;
      if (it.kind === 'chest') this._drawChest(ctx, it.x, it.y + bob);
      else this._drawPotion(ctx, it.x, it.y + bob);
    }

    // 怪物
    for (const e of this.enemies) this._drawEnemy(ctx, e);

    // 玩家
    this._drawPlayer(ctx);

    // 粒子 + 飘字
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

    ctx.textAlign = 'center';
    ctx.font = '700 14px "JetBrains Mono", Consolas, monospace';
    for (const f of this.floats) {
      ctx.globalAlpha = Math.min(1, f.life);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    this._drawMinimap(ctx, w, h);
  }

  _drawPlayer(ctx) {
    const p = this.player;
    const inv = p.invuln > 0 && Math.floor(this.time * 22) % 2 === 0;

    // 挥砍弧光
    if (p.slash > 0) {
      const s = p.slash;
      const half = (p.stats.atkArc * DEG) / 2;
      const center = -half + half * 2 * (1 - s);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.aim);
      const grad = ctx.createRadialGradient(0, 0, p.stats.atkRange * 0.35, 0, 0, p.stats.atkRange);
      grad.addColorStop(0, 'rgba(126, 249, 255, 0)');
      grad.addColorStop(0.4, `rgba(126, 249, 255, ${0.55 * s})`);
      grad.addColorStop(1, `rgba(255, 64, 129, 0)`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 10 * s + 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, p.stats.atkRange * 0.92, center - 0.55, center + 0.55);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    if (inv) ctx.globalAlpha = 0.55;

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, p.r * 0.85, p.r * 0.9, p.r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // 身体
    const body = ctx.createLinearGradient(0, -p.r, 0, p.r);
    body.addColorStop(0, '#7ef9ff');
    body.addColorStop(1, '#00b8d4');
    ctx.fillStyle = p.hitFlash > 0 ? '#ff6b8a' : body;
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 朝向：剑
    ctx.rotate(p.aim);
    const reach = p.stats.atkRange * 0.55;
    ctx.strokeStyle = '#e9fbff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.r * 0.6, 0);
    ctx.lineTo(reach, 0);
    ctx.stroke();
    ctx.fillStyle = '#7ef9ff';
    ctx.beginPath();
    ctx.arc(reach + 3, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawEnemy(ctx, e) {
    const t = e.type;
    ctx.save();
    ctx.translate(e.x, e.y);

    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(0, e.r * 0.9, e.r * 0.9, e.r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    const hurt = e.flash > 0;
    if (t.id === 'moth') {
      ctx.fillStyle = hurt ? '#ffffff' : t.color;
      const flap = Math.sin(this.time * 18 + e.seed) * 3;
      ctx.beginPath();
      ctx.ellipse(-e.r * 0.7, 0, e.r * 0.7, e.r * 0.5 + flap * 0.2, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(e.r * 0.7, 0, e.r * 0.7, e.r * 0.5 - flap * 0.2, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b1020';
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const grad = ctx.createRadialGradient(-e.r * 0.3, -e.r * 0.4, 1, 0, 0, e.r);
      grad.addColorStop(0, hurt ? '#ffffff' : '#ffffff55');
      grad.addColorStop(1, hurt ? '#ffd9e6' : t.color);
      ctx.fillStyle = grad;
      if (t.elite) {
        ctx.fillRect(-e.r, -e.r, e.r * 2, e.r * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.strokeRect(-e.r, -e.r, e.r * 2, e.r * 2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, e.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 眼睛
    if (t.id !== 'moth') {
      ctx.fillStyle = '#07101c';
      const d = e.r * 0.32;
      ctx.beginPath(); ctx.arc(-d, -d * 0.4, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(d, -d * 0.4, 2.2, 0, Math.PI * 2); ctx.fill();
    }

    // 血条
    if (e.hpBar > 0 && e.hp < e.maxHp) {
      const w = e.r * 2.2;
      ctx.globalAlpha = Math.min(1, e.hpBar);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(-w / 2, -e.r - 10, w, 4);
      ctx.fillStyle = t.elite ? '#ff4081' : '#69f0ae';
      ctx.fillRect(-w / 2, -e.r - 10, (w * e.hp) / e.maxHp, 4);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  _drawChest(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
    glow.addColorStop(0, 'rgba(255, 209, 102, 0.55)');
    glow.addColorStop(1, 'rgba(255, 209, 102, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#7a4a12';
    ctx.fillRect(-11, -4, 22, 12);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(-12, -10, 24, 7);
    ctx.strokeStyle = '#fff3c4';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-12, -10, 24, 7);
    ctx.fillStyle = '#fff8e1';
    ctx.fillRect(-2, -6, 4, 6);
    ctx.restore();
  }

  _drawPotion(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(105, 240, 174, 0.25)';
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#69f0ae';
    ctx.beginPath();
    ctx.arc(0, 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-1.6, -8, 3.2, 5);
    ctx.strokeStyle = '#e8fff5';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-1.6, -8, 3.2, 5);
    ctx.restore();
  }

  _drawMinimap(ctx, w, h) {
    const mw = Math.min(150, w * 0.28);
    const scale = mw / this.map.cols;
    const mh = this.map.rows * scale;
    const pad = 10;
    const ox = w - mw - pad;
    const oy = h - mh - pad;

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(6, 10, 20, 0.78)';
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(ox - 4, oy - 4, mw + 8, mh + 8, 8);
    ctx.fill();
    ctx.stroke();

    for (let ty = 0; ty < this.map.rows; ty++) {
      for (let tx = 0; tx < this.map.cols; tx++) {
        if (!this.map.explored[ty * this.map.cols + tx]) continue;
        const solid = this.map.grid[ty * this.map.cols + tx] === 1;
        ctx.fillStyle = solid ? 'rgba(120, 160, 255, 0.16)' : 'rgba(0, 229, 255, 0.30)';
        ctx.fillRect(ox + tx * scale, oy + ty * scale, scale, scale);
      }
    }
    // 未拾取的宝藏（仅显示已探索区域）
    for (const it of this.pickups) {
      if (it.taken || it.kind !== 'chest') continue;
      const tx = Math.floor(it.x / CONFIG.tile);
      const ty = Math.floor(it.y / CONFIG.tile);
      if (!this.map.explored[ty * this.map.cols + tx]) continue;
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(ox + tx * scale - 1, oy + ty * scale - 1, scale + 2, scale + 2);
    }
    for (const e of this.enemies) {
      const tx = Math.floor(e.x / CONFIG.tile);
      const ty = Math.floor(e.y / CONFIG.tile);
      if (!this.map.explored[ty * this.map.cols + tx]) continue;
      ctx.fillStyle = e.type.color;
      ctx.fillRect(ox + tx * scale - 1, oy + ty * scale - 1, scale + 1, scale + 1);
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ox + (this.player.x / CONFIG.tile) * scale, oy + (this.player.y / CONFIG.tile) * scale, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
