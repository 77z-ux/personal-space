/**
 * ============================================================
 * adv/game.js —— 横版卷轴平台跳跃引擎（Canvas 2D，零依赖）
 * ------------------------------------------------------------
 * · 固定步长逻辑（1/60s）+ 逐帧渲染：不同刷新率下手感一致
 * · 卷轴相机：跟随角色横向滚动，纵向有限跟随并夹到世界边界
 * · 关卡流程：跑图 → 拿钥匙 → 走到终点宝箱 → 冻结展示节点 → 下一关
 * · 战斗：踩踏（马里奥式）/ 挥砍 / 冲刺三种输出，接触伤害 + 无敌帧
 * · 渲染：虚拟分辨率 720×416 等比 letterbox 到画布，保证任何屏幕比例
 *        都能看到同样大小的画面和完整的跳跃路径
 * ============================================================
 */

import { CONFIG, NODES, VIEW, PERKS, LEVEL_THEMES } from './data.js';
import { generateLevel, makeRng, TI, tileAt, isSolidAt } from './level.js';
import { Player, Enemy, Pickup, rr } from './entities.js';

export const LEVEL_COUNT = Math.min(NODES.length, LEVEL_THEMES.length);

const T = CONFIG.tile;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
/** 稳定伪随机（用于星空等装饰，避免每帧闪烁） */
const hash = (n) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

export class AdventureGame {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;

    this.state = 'idle'; // idle / running / paused / levelup / reveal / over
    this.input = { mx: 0, jumpHeld: false };
    this.cam = { x: 0, y: 0 };
    this.time = 0;
    this.timeMs = 0;
    this.score = 0;
    this.kills = 0;
    this.nodesFound = 0;
    this.levelIndex = 0;
    this.hasKey = false;
    this.chestOpen = false;
    this.perkPicks = null;
    this.pendingLevels = 0;
    this.revealAt = 0;
    this.shake = 0;
    this.lockedHintCd = 0;

    this.enemies = [];
    this.pickups = [];
    this.coins = [];
    this.particles = [];
    this.floats = [];
    this.trail = [];

    this.rng = makeRng(Date.now() >>> 0);
    this.bestiary = new Set();

    this._last = 0;
    this._acc = 0;

    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(canvas.parentElement || canvas);
    }
    window.addEventListener('resize', () => this.resize());

    // 先载入第 0 关做背景预览（HUD 也依赖 player 存在）
    this.loadLevel(0);

    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  /* ================= 生命周期 ================= */

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.hooks.onStateChange?.(s);
  }

  start() {
    this.score = 0;
    this.kills = 0;
    this.nodesFound = 0;
    this.timeMs = 0;
    this.levelIndex = 0;
    this.pendingLevels = 0;
    this.perkPicks = null;
    this.bestiary = new Set();
    this.player = null;
    this.rng = makeRng(Date.now() >>> 0);
    this.loadLevel(0);
    this.setState('running');
  }

  loadLevel(i) {
    const map = generateLevel(i, this.rng);
    this.map = map;
    this.levelIndex = i;
    this.hasKey = false;
    this.chestOpen = false;
    this.lockedHintCd = 0;

    if (!this.player) this.player = new Player(map.spawn.x, map.spawn.groundY);
    else {
      const p = this.player;
      p.x = map.spawn.x;
      p.y = map.spawn.groundY - p.hh - 1;
      p.vx = 0; p.vy = 0; p.kx = 0;
      p.grounded = false;
      p.jumpsLeft = p.stats.maxJumps;
      p.lastSafe = { x: p.x, y: p.y };
    }

    this.enemies = map.enemies.map((e) => new Enemy(e.id, e.x, e.y, this.rng));
    this.pickups = map.pickups.map((p) => new Pickup(p.kind, p.x, p.y));
    this.coins = map.coins.map((c) => new Pickup('coin', c.x, c.y));
    this.keyPickup = new Pickup('key', map.key.x, map.key.y);
    this.particles.length = 0;
    this.floats.length = 0;
    this.trail.length = 0;

    this.cam.x = clamp(this.player.x - VIEW.w * 0.42, 0, Math.max(0, map.worldW - VIEW.w));
    this.cam.y = clamp(this.player.y - VIEW.h * 0.55, 0, Math.max(0, map.worldH - VIEW.h));
    this.hooks.onLevel?.({ index: i, theme: map.theme });
  }

  pause() { if (this.state === 'running') this.setState('paused'); }
  resume() { if (this.state === 'paused') this.setState('running'); }
  togglePause() {
    if (this.state === 'running') this.pause();
    else if (this.state === 'paused') this.resume();
    else if (this.state === 'idle' || this.state === 'over') this.start();
  }

  end(reason) {
    this.setState('over');
    this.hooks.onEnd?.({
      reason,
      score: Math.round(this.score),
      nodes: this.nodesFound,
      kills: this.kills,
      timeMs: this.timeMs,
      levelIndex: this.levelIndex,
      bestiary: [...this.bestiary],
    });
  }

  /* ================= 输入 ================= */

  pressJump() {
    if (this.state !== 'running') return;
    this.input.jumpHeld = true;
    this.player.pressJump();
  }
  releaseJump() { this.input.jumpHeld = false; }

  tryAttack() {
    if (this.state !== 'running') return;
    const a = this.player.attack();
    if (!a) return;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (Math.abs(e.x - a.x) < a.hw + e.hw && Math.abs(e.y - a.y) < a.hh + e.hh) {
        this.hurtEnemy(e, e.x, 0.6);
      }
    }
  }

  tryDash() {
    if (this.state !== 'running') return;
    if (!this.player.tryDash()) return;
    for (let i = 0; i < 8; i++) {
      this.particle(this.player.x, this.player.y + rnd(-8, 8), rnd(-30, 30), rnd(-20, 20), '#7ef9ff', 0.3, 3);
    }
  }

  choosePerk(id) {
    const perk = PERKS.find((p) => p.id === id);
    if (perk && this.player) {
      perk.apply(this.player.stats);
      this.perkPicks = null;
    }
    this.pendingLevels -= 1;
    if (this.pendingLevels > 0) {
      this.hooks.onLevelUp?.(this.rollPerks());
      this.state = 'levelup';
      return;
    }
    this.setState('running');
  }

  rollPerks() {
    const owned = new Set(this.player.perkLog || []);
    const pool = PERKS.filter((p) => !p.unique || !owned.has(p.id));
    const picks = [];
    const copy = pool.slice();
    while (picks.length < 3 && copy.length) picks.push(copy.splice(Math.floor(this.rng() * copy.length), 1)[0]);
    this.perkPicks = picks;
    return picks;
  }

  continueAfterReveal() {
    if (this.state !== 'reveal') return;
    if (this.levelIndex + 1 >= LEVEL_COUNT) {
      this.score += CONFIG.score.winBonus;
      this.end('win');
      return;
    }
    this.loadLevel(this.levelIndex + 1);
    this.setState('running');
  }

  /* ================= 主循环 ================= */

  _loop(ts) {
    if (!this._last) this._last = ts;
    let dt = (ts - this._last) / 1000;
    this._last = ts;
    dt = Math.min(dt, 0.1);
    this.time += dt;

    // 单帧异常不应该让整个画面卡死：记录后继续下一帧
    try {
      if (this.state === 'running') {
        this._acc += dt;
        const STEP = 1 / 60;
        let guard = 0;
        while (this._acc >= STEP && guard++ < 6) {
          this.update(STEP);
          this._acc -= STEP;
        }
        if (guard >= 6) this._acc = 0;
        this.updateFx(dt);
      }
      this.render();
    } catch (err) {
      this._errCount = (this._errCount || 0) + 1;
      if (this._errCount <= 2) console.error('[adv] frame error:', err);
      this._acc = 0;
    }
    requestAnimationFrame(this._loop);
  }

  update(dt) {
    const p = this.player;
    const map = this.map;
    this.timeMs += dt * 1000;
    this.lockedHintCd = Math.max(0, this.lockedHintCd - dt);

    p.jumpedNow = false;
    p.doubleJumpNow = false;
    p.headBump = false;
    p.update(dt, this.input, map);

    /* 起跳 / 落地特效 */
    if (p.jumpedNow) this.puffJump(p.x, p.y + p.hh);
    if (p.doubleJumpNow) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        this.particle(p.x, p.y + p.hh - 2, Math.cos(a) * 70, Math.sin(a) * 30, '#7ef9ff', 0.35, 3);
      }
    }
    if (p.justLanded) {
      for (let i = 0; i < 6; i++) {
        this.particle(p.x + rnd(-6, 6), p.y + p.hh, rnd(-70, 70), rnd(-60, -10), 'rgba(200,220,255,.8)', 0.32, 2.6);
      }
    }
    if (Math.abs(p.vx) > 40 && p.grounded && Math.random() < dt * 6) {
      this.particle(p.x - Math.sign(p.vx) * 6, p.y + p.hh, -Math.sign(p.vx) * 30, -20, 'rgba(180,210,255,.5)', 0.24, 2);
    }
    if (p.dashTimer > 0) this.trail.push({ x: p.x, y: p.y, life: 0.22, dir: p.dashDir || p.facing });

    /* 掉出世界（掉坑）：少量掉血 + 安全点重生 */
    if (p.y - p.hh > map.worldH + 24) {
      const dmg = p.fall(p.lastSafe);
      this.floatText(p.x, p.y - 20, `-${dmg}`, '#ff4081');
      this.shake = 7;
      this.hooks.onHurt?.({ amount: dmg, reason: 'pit' });
      if (p.hp <= 0) { this.end('dead'); return; }
    }

    /* 尖刺 */
    if (this.touchTile(p, TI.SPIKE)) {
      const dmg = p.takeDamage(CONFIG.combat.spikeDamage, p.x + p.facing * 14);
      if (dmg > 0) {
        this.floatText(p.x, p.y - 20, `-${dmg}`, '#ff4081');
        this.shake = 5;
        this.hooks.onHurt?.({ amount: dmg, reason: 'spike' });
        if (p.hp <= 0) { this.end('dead'); return; }
      }
    }

    /* 敌人 */
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.update(dt, p, map, this.time);
      if (Math.abs(e.x - p.x) < VIEW.w * 0.6) {
        if (!this.bestiary.has(e.id)) { this.bestiary.add(e.id); this.hooks.onMeet?.(e.type); }
      }

      const overlapX = Math.abs(p.x - e.x) < p.hw + e.hw * 0.92;
      const overlapY = Math.abs(p.y - e.y) < p.hh + e.hh * 0.92;
      if (!overlapX || !overlapY) continue;

      // 踩踏：下落中且脚在怪物上半身
      const stomping = p.vy > 60 && (p.y + p.hh) - e.y < e.hh * 0.75;
      if (stomping) {
        const dealt = e.takeDamage(p.stats.damage * p.stats.stompMul, p.x);
        p.vy = -(this.input.jumpHeld ? CONFIG.combat.stompBounce * 1.28 : CONFIG.combat.stompBounce);
        p.jumpsLeft = Math.max(p.jumpsLeft, 1);
        this.floatText(e.x, e.y - e.hh - 6, `${Math.round(dealt)}`, '#ffd166');
        this.burst(e.x, e.y, e.type.color, 10);
        this.hooks.onHit?.({ crit: false, stomp: true, amount: dealt });
        if (p.stats.lifesteal) p.heal(dealt * p.stats.lifesteal);
        if (e.dead) this.killEnemy(e);
        continue;
      }

      // 接触伤害
      if (e.touchCd <= 0) {
        const dmg = p.takeDamage(e.type.dmg, e.x);
        if (dmg > 0) {
          e.touchCd = CONFIG.combat.enemyTouchCd;
          this.floatText(p.x, p.y - 22, `-${dmg}`, '#ff4081');
          this.shake = 6;
          this.hooks.onHurt?.({ amount: dmg, reason: 'enemy' });
          if (p.hp <= 0) { this.end('dead'); return; }
        }
      }
    }

    /* 拾取：金币 / 药水 / 钥匙 */
    for (const c of this.coins) {
      if (c.taken) continue;
      if (Math.abs(c.x - p.x) < p.hw + 12 && Math.abs(c.y - p.y) < p.hh + 12) {
        c.taken = true;
        this.score += CONFIG.score.coin;
        this.burst(c.x, c.y, '#ffd166', 5);
        this.hooks.onPickup?.({ kind: 'coin' });
      }
    }
    for (const it of this.pickups) {
      if (it.taken) continue;
      if (Math.abs(it.x - p.x) < p.hw + it.hw && Math.abs(it.y - p.y) < p.hh + it.hh) {
        it.taken = true;
        const healed = this.player.heal(CONFIG.combat.potionHeal);
        this.hooks.onPickup?.({ kind: 'potion', healed });
        this.burst(it.x, it.y, '#69f0ae', 10);
      }
    }
    if (!this.hasKey && Math.abs(this.keyPickup.x - p.x) < p.hw + 18 && Math.abs(this.keyPickup.y - p.y) < p.hh + 20) {
      this.hasKey = true;
      this.burst(this.keyPickup.x, this.keyPickup.y, '#ffd166', 18);
      this.hooks.onPickup?.({ kind: 'key' });
    }

    /* 终点宝箱 */
    const ch = this.chestBox();
    if (Math.abs(ch.x - p.x) < ch.hw + p.hw && Math.abs(ch.y - p.y) < ch.hh + p.hh) {
      if (this.hasKey) this.openChest();
      else if (this.lockedHintCd <= 0) {
        this.lockedHintCd = 1.6;
        this.hooks.onPickup?.({ kind: 'locked' });
      }
    }

    this.updateCamera(dt);
  }

  chestBox() {
    return { x: this.map.chest.x, y: this.map.chest.groundY - 15, hw: 16, hh: 15 };
  }

  hurtEnemy(e, fromX, mul = 1) {
    const p = this.player;
    let dmg = p.stats.damage * mul;
    const crit = Math.random() < p.stats.crit;
    if (crit) dmg *= p.stats.critMul;
    dmg = Math.round(dmg);
    e.takeDamage(dmg, fromX);
    this.floatText(e.x, e.y - e.hh - 6, crit ? `${dmg}!` : `${dmg}`, crit ? '#ff4081' : '#ffffff');
    this.burst(e.x, e.y, crit ? '#ff4081' : '#ffffff', crit ? 12 : 7);
    this.hooks.onHit?.({ crit, stomp: false, amount: dmg });
    if (p.stats.lifesteal) p.heal(dmg * p.stats.lifesteal);
    if (e.dead) this.killEnemy(e);
    return dmg;
  }

  killEnemy(e) {
    this.kills += 1;
    this.score += CONFIG.score.kill;
    this.burst(e.x, e.y, e.type.color, 16);
    const ups = this.player.gainXp(e.type.xp);
    this.hooks.onKill?.(e.type);
    if (ups > 0) {
      this.pendingLevels += ups;
      this.hooks.onLevelUp?.(this.rollPerks());
      this.setState('levelup');
    }
  }

  openChest() {
    if (this.state !== 'running') return;
    const idx = this.levelIndex;
    this.chestOpen = true;
    this.nodesFound += 1;
    this.score += CONFIG.score.node;
    this.setState('reveal');
    this.revealAt = performance.now();
    const c = this.map.chest;
    for (let i = 0; i < 46; i++) {
      this.particle(c.x + rnd(-14, 14), c.groundY - 16, rnd(-160, 160), rnd(-320, -80), i % 3 ? '#ffd166' : '#00e5ff', 1.1, 3.4);
    }
    this.hooks.onNode?.(idx, c.x, c.groundY);
  }

  updateCamera(dt) {
    const p = this.player;
    const map = this.map;
    const tx = clamp(p.x - VIEW.w * 0.42, 0, Math.max(0, map.worldW - VIEW.w));
    const ty = clamp(p.y - VIEW.h * 0.55, 0, Math.max(0, map.worldH - VIEW.h));
    const k = 1 - Math.pow(0.0008, dt);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 34);
  }

  /* ================= 特效 ================= */

  updateFx(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i];
      q.life -= dt;
      if (q.life <= 0) { this.particles.splice(i, 1); continue; }
      q.vy += (q.grav || 520) * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      if (f.life <= 0) { this.floats.splice(i, 1); continue; }
      f.y -= dt * 26;
    }
    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].life -= dt;
      if (this.trail[i].life <= 0) this.trail.splice(i, 1);
    }
  }

  particle(x, y, vx, vy, color, life = 0.4, size = 3, grav = 520) {
    if (this.particles.length > 320) return;
    this.particles.push({ x, y, vx, vy, color, life, max: life, size, grav });
  }
  burst(x, y, color, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(60, 220);
      this.particle(x, y, Math.cos(a) * s, Math.sin(a) * s - 40, color, rnd(0.3, 0.6), rnd(2, 4));
    }
  }
  puffJump(x, y) {
    for (let i = 0; i < 7; i++) this.particle(x + rnd(-5, 5), y, rnd(-80, 80), rnd(-40, 10), 'rgba(190,220,255,.75)', 0.3, 2.6, 260);
  }
  floatText(x, y, text, color) {
    if (this.floats.length > 22) this.floats.shift();
    this.floats.push({ x, y, text, color, life: 0.9, max: 0.9 });
  }
  touchTile(p, type) {
    const x0 = Math.floor((p.x - p.hw) / T);
    const x1 = Math.floor((p.x + p.hw - 0.001) / T);
    const y0 = Math.floor((p.y - p.hh) / T);
    const y1 = Math.floor((p.y + p.hh - 0.001) / T);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) if (tileAt(this.map, tx, ty) === type) return true;
    }
    return false;
  }

  /* ================= 画布尺寸 ================= */

  resize() {
    const parent = this.canvas.parentElement || this.canvas;
    const rect = parent.getBoundingClientRect();
    const cssW = Math.max(280, rect.width);
    const cssH = Math.max(200, rect.height || cssW * (VIEW.h / VIEW.w));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    // letterbox：等比缩放并居中，保证可视世界范围恒为 720×416
    this.scale = Math.min(cssW / VIEW.w, cssH / VIEW.h);
    this.offX = (cssW - VIEW.w * this.scale) / 2;
    this.offY = (cssH - VIEW.h * this.scale) / 2;
  }

  /* ================= 渲染 ================= */

  render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    ctx.fillStyle = '#05070f';
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    if (!this.map) return;

    ctx.save();
    ctx.translate(this.offX, this.offY);
    ctx.scale(this.scale, this.scale);
    ctx.beginPath();
    ctx.rect(0, 0, VIEW.w, VIEW.h);
    ctx.clip();

    this.drawSky();

    const sh = this.shake > 0.2 ? this.shake : 0;
    ctx.save();
    ctx.translate(-Math.round(this.cam.x) + rnd(-sh, sh), -Math.round(this.cam.y) + rnd(-sh, sh));
    this.drawTiles();
    this.drawCoins();
    this.drawKey();
    this.drawChest();
    for (const it of this.pickups) it.draw(ctx, this.time);
    for (const e of this.enemies) if (!e.dead) e.draw(ctx, this.time);
    if (this.player) this.drawPlayer();
    this.drawFx();
    ctx.restore();

    this.drawGuide();
    ctx.restore();
  }

  drawSky() {
    const ctx = this.ctx;
    const th = this.map.theme;
    const g = ctx.createLinearGradient(0, 0, 0, VIEW.h);
    g.addColorStop(0, th.sky[0]);
    g.addColorStop(1, th.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);

    // 星星（稳定位置）
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i < 40; i++) {
      const sx = (hash(i * 3.1) * VIEW.w * 1.6 - this.cam.x * 0.08) % VIEW.w;
      const x = sx < 0 ? sx + VIEW.w : sx;
      const y = hash(i * 7.7) * VIEW.h * 0.55;
      const a = 0.25 + Math.abs(Math.sin(this.time * 1.4 + i)) * 0.5;
      ctx.globalAlpha = a * 0.7;
      ctx.fillRect(x, y, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;

    // 视差层
    if (th.decor === 'cloud') {
      this.drawDecor(th.far, 0.18, VIEW.h * 0.78, 'cloud');
      this.drawDecor(th.mid, 0.34, VIEW.h * 0.86, 'peak');
    } else {
      this.drawDecor(th.far, 0.2, VIEW.h * 0.72, th.decor);
      this.drawDecor(th.mid, 0.42, VIEW.h * 0.84, th.decor === 'city' ? 'block' : 'peak');
    }

    // 天空网格（科技感）
    ctx.strokeStyle = 'rgba(140,190,255,.05)';
    ctx.lineWidth = 1;
    const gridOff = (this.cam.x * 0.1) % 60;
    ctx.beginPath();
    for (let x = -gridOff; x < VIEW.w; x += 60) { ctx.moveTo(x, 0); ctx.lineTo(x, VIEW.h); }
    for (let y = 0; y < VIEW.h; y += 60) { ctx.moveTo(0, y); ctx.lineTo(VIEW.w, y); }
    ctx.stroke();
  }

  drawDecor(color, factor, baseY, kind) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    for (let i = 0; i < 9; i++) {
      const w = 150 + hash(i * 5.3) * 180;
      const h = 60 + hash(i * 9.1) * 130;
      const period = VIEW.w + 420;
      let x = (i * 210 - this.cam.x * factor) % period;
      if (x < -420) x += period;
      if (x > VIEW.w + 20) continue;
      const y = baseY - h;
      if (kind === 'cloud') {
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, Math.max(14, h / 3.2), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (kind === 'peak') {
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + w / 2, y);
        ctx.lineTo(x + w, y + h);
        ctx.closePath();
        ctx.fill();
      } else {
        // 城市天际线：错落的方块 + 零星亮窗
        rr(ctx, x, y + h * 0.25, w * 0.6, h * 0.9, 4);
        ctx.fill();
        rr(ctx, x + w * 0.55, y + h * 0.05, w * 0.5, h * 1.05, 4);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,220,140,.35)';
        for (let k = 0; k < 5; k++) {
          if (hash(i * 13.7 + k) < 0.55) continue;
          ctx.fillRect(x + w * 0.62 + hash(i * 3 + k) * w * 0.3, y + h * 0.2 + k * (h * 0.16), 3, 4);
        }
        ctx.fillStyle = color;
      }
    }
  }

  drawTiles() {
    const ctx = this.ctx;
    const map = this.map;
    const th = map.theme;
    const tx0 = Math.max(0, Math.floor(this.cam.x / T) - 1);
    const tx1 = Math.min(map.cols - 1, tx0 + Math.ceil(VIEW.w / T) + 2);
    const ty0 = Math.max(0, Math.floor(this.cam.y / T) - 1);
    const ty1 = Math.min(map.rows - 1, ty0 + Math.ceil(VIEW.h / T) + 2);

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = tileAt(map, tx, ty);
        if (t === TI.AIR) continue;
        const px = tx * T;
        const py = ty * T;

        if (t === TI.SPIKE) {
          ctx.fillStyle = '#ff5470';
          for (let k = 0; k < 2; k++) {
            ctx.beginPath();
            ctx.moveTo(px + k * 16, py + T);
            ctx.lineTo(px + k * 16 + 8, py + 6);
            ctx.lineTo(px + k * 16 + 16, py + T);
            ctx.closePath();
            ctx.fill();
          }
          ctx.fillStyle = 'rgba(255,255,255,.35)';
          ctx.fillRect(px, py + T - 3, T, 3);
          continue;
        }

        const open = !isSolidAt(map, tx, ty - 1);
        if (t === TI.BRICK) {
          ctx.fillStyle = th.ground;
          ctx.fillRect(px, py, T, T);
          ctx.strokeStyle = 'rgba(0,0,0,.28)';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
          ctx.strokeStyle = 'rgba(255,255,255,.06)';
          ctx.beginPath();
          ctx.moveTo(px + T / 2, py); ctx.lineTo(px + T / 2, py + T);
          ctx.moveTo(px, py + T / 2); ctx.lineTo(px + T, py + T / 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = th.dirt;
          ctx.fillRect(px, py, T, T);
          ctx.fillStyle = 'rgba(255,255,255,.03)';
          ctx.fillRect(px + 4, py + 6, 8, 3);
          ctx.fillRect(px + 18, py + 20, 10, 3);
        }

        // 顶面草皮高光：一眼看出哪里可以站
        if (open) {
          ctx.fillStyle = th.grass;
          ctx.fillRect(px, py, T, 4);
          ctx.globalAlpha = 0.28;
          ctx.fillRect(px, py + 4, T, 5);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  drawCoins() {
    const ctx = this.ctx;
    for (const c of this.coins) {
      if (c.taken) continue;
      if (c.x < this.cam.x - 40 || c.x > this.cam.x + VIEW.w + 40) continue;
      c.draw(ctx, this.time);
    }
  }

  drawKey() {
    if (this.hasKey) return;
    const k = this.keyPickup;
    if (k.x < this.cam.x - 40 || k.x > this.cam.x + VIEW.w + 40) return;
    const ctx = this.ctx;
    // 竖直光柱：远处也能看到钥匙在哪座塔顶
    const grad = ctx.createLinearGradient(k.x, k.y - 260, k.x, k.y + 10);
    grad.addColorStop(0, 'rgba(255,209,102,0)');
    grad.addColorStop(1, 'rgba(255,209,102,.32)');
    ctx.fillStyle = grad;
    ctx.fillRect(k.x - 9, k.y - 260, 18, 270);
    k.draw(ctx, this.time);
  }

  drawChest() {
    const ctx = this.ctx;
    const c = this.map.chest;
    const x = c.x;
    const gy = c.groundY;
    const t = this.time;
    ctx.save();
    ctx.translate(x, gy);

    // 地面光晕
    const glow = ctx.createRadialGradient(0, -14, 4, 0, -14, 46);
    glow.addColorStop(0, this.hasKey ? 'rgba(255,209,102,.34)' : 'rgba(0,229,255,.16)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, -14, 46, 0, Math.PI * 2); ctx.fill();

    const bob = Math.sin(t * 2.4) * 1.2;
    ctx.translate(0, bob);

    // 箱体
    ctx.fillStyle = '#3a2a13';
    rr(ctx, -18, -28, 36, 28, 4); ctx.fill();
    ctx.fillStyle = '#54401d';
    rr(ctx, -18, -28, 36, 10, 4); ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(-18, -21, 36, 3);
    ctx.fillRect(-4, -28, 8, 28);

    // 箱盖（开箱后掀开）
    ctx.save();
    ctx.translate(0, -28);
    if (this.chestOpen) ctx.rotate(-0.9);
    ctx.fillStyle = '#6b4a18';
    rr(ctx, -19, -10, 38, 11, 4); ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(-19, -2, 38, 3);
    ctx.restore();

    // 锁扣 / 提示
    if (!this.chestOpen) {
      ctx.fillStyle = '#1a1408';
      rr(ctx, -5, -20, 10, 10, 2); ctx.fill();
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = this.hasKey ? '#ffd166' : 'rgba(255,255,255,.75)';
      ctx.fillText(this.hasKey ? 'OPEN' : '🔒', 0, -12);
      ctx.font = '8px monospace';
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.fillText(this.hasKey ? '走进箱子开箱' : '需要钥匙', 0, -34);
    }
    ctx.restore();
  }

  drawPlayer() {
    const ctx = this.ctx;
    const p = this.player;

    // 冲刺残影
    ctx.save();
    for (const t of this.trail) {
      ctx.globalAlpha = Math.max(0, t.life / 0.22) * 0.4;
      ctx.fillStyle = '#7ef9ff';
      rr(ctx, t.x - 7, t.y - 14, 14, 28, 6);
      ctx.fill();
    }
    ctx.restore();

    p.draw(ctx, this.time);

    // 挥砍弧光
    if (p.slash > 0) {
      const a = Math.min(1, p.slash);
      const cx = p.x + p.facing * 6;
      const cy = p.y;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(p.facing, 1);
      ctx.globalAlpha = a * 0.85;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.arc(0, 0, 30, -0.85 + (1 - a) * 0.9, 0.85 + (1 - a) * 0.3);
      ctx.stroke();
      ctx.globalAlpha = a * 0.4;
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.restore();
    }
  }

  drawFx() {
    const ctx = this.ctx;
    for (const q of this.particles) {
      const a = Math.max(0, q.life / q.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      const s = q.size * (0.5 + a * 0.5);
      ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px ui-monospace, SFMono-Regular, Menlo, monospace';
    for (const f of this.floats) {
      const a = Math.max(0, f.life / f.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  /** 屏幕边缘的目标指示（钥匙 / 宝箱），避免在大关卡里迷路 */
  drawGuide() {
    const ctx = this.ctx;
    const p = this.player;
    if (!p) return;
    const target = this.hasKey ? this.map.chest.x : this.keyPickup.x;
    const icon = this.hasKey ? '🎁' : '🔑';
    const tip = this.hasKey ? '终点宝箱' : '钥匙';
    const sx = clamp(target - this.cam.x, 26, VIEW.w - 26);
    const off = target - this.cam.x;
    if (off > 30 && off < VIEW.w - 30 && Math.abs((this.hasKey ? this.map.chest.groundY : this.keyPickup.y) - this.cam.y) < VIEW.h) return;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.textAlign = 'center';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(icon, sx, 26);
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255,255,255,.78)';
    ctx.fillText(off > VIEW.w - 30 ? `${tip} →` : off < 30 ? `← ${tip}` : `${tip} ↑`, sx, 40);
    ctx.restore();
  }
}
