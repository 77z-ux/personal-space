/**
 * ============================================================
 * adv/entities.js —— 横版实体层：像素小人 / 平台怪物 / 拾取物
 * ------------------------------------------------------------
 * 玩家：受重力的 AABB 碰撞盒，支持
 *   · 左右加速/摩擦（地面与空中有不同加速度）
 *   · 二段跳 + 土狼时间 + 跳跃缓冲 + 可变跳跃高度
 *   · 空中冲刺（零重力 + 短暂无敌，用来救回落点）
 *   · 踩踏判定所需的下落速度、着地事件
 *   外观不是几何圆块，而是一个有头 / 身体 / 四肢的像素小人，
 *   带行走摆臂摆腿与跳跃姿态（见 Player.draw）。
 * 怪物：地面巡逻怪（悬崖转身，不会自己跳坑）+ 空中正弦飞行怪。
 * ============================================================
 */

import { CONFIG, MONSTERS } from './data.js';
import { moveAxisX, moveAxisY, overlapsSolid, overlapsTile, TI, ledgeAhead } from './level.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** 画布辅助：整数圆角矩形，保证像素小人不糊 */
export function rr(ctx, x, y, w, h, r = 2) {
  const rr2 = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr2, y);
  ctx.lineTo(x + w - rr2, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr2);
  ctx.lineTo(x + w, y + h - rr2);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr2, y + h);
  ctx.lineTo(x + rr2, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr2);
  ctx.lineTo(x, y + rr2);
  ctx.quadraticCurveTo(x, y, x + rr2, y);
  ctx.closePath();
}

/* ------------------------------ 玩家 ------------------------------ */
export class Player {
  constructor(x, groundY) {
    const s = CONFIG.player;
    this.hw = s.hw;
    this.hh = s.hh;
    this.x = x;
    this.y = groundY - this.hh - 1;
    this.vx = 0;
    this.vy = 0;
    this.grounded = false;
    this.facing = 1;
    this.jumpsLeft = s.maxJumps;
    this.coyote = s.coyote;
    this.buffer = 0;
    this.jumpHeld = false;
    this._usedLedge = false;

    this.stats = { ...s, maxHp: s.hp };
    this.hp = this.stats.maxHp;
    this.level = 1;
    this.xp = 0;

    this.atkTimer = 0;
    this.slash = 0;
    this.dashTimer = 0;
    this.dashCd = 0;
    this.invuln = 0;
    this.hitFlash = 0;
    this.kx = 0;
    this.runPhase = 0;
    this.justLanded = false;
    this.headBump = false;
    this.lastSafe = { x: this.x, y: this.y };
  }

  get xpNeed() { return CONFIG.xpNeed(this.level); }
  get alive() { return this.hp > 0; }

  /** 按下跳跃键：进入缓冲，落地或土狼时间内会自动兑现 */
  pressJump() { this.buffer = this.stats.jumpBuffer; }

  /**
   * 台阶辅助：被墙挡住时，尝试抬高最多一格（36px）再前进。
   * 只在贴地且确实有位移意图时调用，避免「贴墙自动爬墙」。
   * @returns 是否成功踏上去
   */
  stepUp(map, dx) {
    const ox = this.x;
    const oy = this.y;
    for (let up = 5; up <= 36; up += 5) {
      const ny = oy - up;
      if (overlapsSolid(map, ox, ny, this.hw, this.hh)) break; // 头顶空间不够
      this.x = ox;
      this.y = ny;
      moveAxisX(this, map, dx);
      if (Math.abs(this.x - ox) > Math.abs(dx) * 0.6) { this.grounded = true; return true; }
      this.x = ox;
      this.y = oy;
    }
    this.x = ox;
    this.y = oy;
    return false;
  }

  tryDash() {
    if (this.dashCd > 0 || this.dashTimer > 0) return false;
    this.dashTimer = this.stats.dashTime;
    this.dashCd = this.stats.dashCd;
    this.dashDir = this.facing;
    return true;
  }

  canAttack() { return this.atkTimer <= 0; }

  /** 触发一次挥砍，返回攻击盒描述（命中判定在 game 里做） */
  attack() {
    if (!this.canAttack()) return null;
    this.atkTimer = this.stats.atkCd;
    this.slash = 1;
    const range = this.stats.atkRange;
    return {
      dir: this.facing,
      x: this.x + this.facing * (this.hw + range / 2),
      y: this.y,
      hw: range / 2,
      hh: this.hh + 6,
    };
  }

  update(dt, input, map) {
    const s = this.stats;
    this.atkTimer = Math.max(0, this.atkTimer - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.dashTimer = Math.max(0, this.dashTimer - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.slash = Math.max(0, this.slash - dt * 4.6);
    this.buffer = Math.max(0, this.buffer - dt);

    const wasGrounded = this.grounded;

    /* 朝向与水平输入 */
    let dir = input.mx || 0;
    if (Math.abs(dir) < 0.2) dir = 0;
    if (dir) this.facing = dir > 0 ? 1 : -1;

    /* 冲刺：水平爆发 + 零重力，方便救回落点 */
    if (this.dashTimer > 0) {
      this.vx = (this.dashDir || this.facing) * s.dashSpeed;
      this.vy = 0;
      this.invuln = Math.max(this.invuln, 0.02);
    } else {
      const desired = dir * s.speed;
      const accel = this.grounded ? (dir ? s.accel : s.friction) : s.airAccel;
      const diff = desired - this.vx;
      const step = accel * dt;
      this.vx += clamp(diff, -step, step);
      // 重力（松开跳跃键时上升段额外加重 -> 可变跳跃高度）
      let g = s.gravity;
      if (this.vy < 0 && !input.jumpHeld) g *= s.gravityCut;
      this.vy = Math.min(s.maxFall, this.vy + g * dt);
    }

    /* 跳跃：土狼时间 + 缓冲 */
    if (this.grounded) {
      this.coyote = s.coyote;
      this.jumpsLeft = s.maxJumps;
      this._usedLedge = false;
    } else {
      this.coyote = Math.max(0, this.coyote - dt);
      if (this.coyote <= 0 && !this._usedLedge) {
        this._usedLedge = true;
        this.jumpsLeft = Math.max(0, s.maxJumps - 1); // 走下悬崖后只剩空中跳
      }
    }
    if (this.buffer > 0) {
      if (this.coyote > 0) {
        this.vy = -s.jumpV;
        this.jumpsLeft = Math.max(0, s.maxJumps - 1);
        this.coyote = 0;
        this.jumpedNow = true;
      } else if (this.jumpsLeft > 0) {
        this.vy = -s.jumpV * 0.94;
        this.jumpsLeft -= 1;
        this.doubleJumpNow = true;
      }
      this.buffer = 0;
    }

    /* 移动与碰撞（分轴推进，避免穿墙与卡角） */
    let hitX = moveAxisX(this, map, this.vx * dt);
    // 自动踏上一格台阶：丘陵地形不用一路狂按跳跃，难度更低、跑图更顺
    if (hitX && this.grounded && Math.abs(this.vx) > 6) {
      if (this.stepUp(map, this.vx * dt)) hitX = false;
    }
    if (hitX) this.vx = 0;
    const hitY = moveAxisY(this, map, this.vy * dt);
    if (hitY) {
      if (this.vy > 0) this.vy = 0;
      else { this.vy = 0; this.headBump = true; }
    }

    /* 受击击退 */
    if (this.kx) {
      moveAxisX(this, map, this.kx * dt);
      this.kx *= Math.pow(0.0005, dt);
      if (Math.abs(this.kx) < 4) this.kx = 0;
    }

    /* 事件：落地 / 起跳 */
    this.justLanded = !wasGrounded && this.grounded;

    /* 安全点：站在地面且没踩到尖刺时刷新 */
    if (this.grounded && !overlapsTile(map, this.x, this.y, this.hw, this.hh, TI.SPIKE)) {
      this.lastSafe.x = this.x;
      this.lastSafe.y = this.y - 1;
    }

    /* 行走动画相位 */
    if (this.grounded) this.runPhase += Math.abs(this.vx) * dt * 0.09;
    else this.runPhase += dt * 2;
  }

  takeDamage(dmg, fromX) {
    if (this.invuln > 0 || dmg <= 0) return 0;
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = this.stats.invuln;
    this.hitFlash = 0.3;
    this.kx = (this.x >= fromX ? 1 : -1) * CONFIG.combat.knockback;
    this.vy = Math.min(this.vy, -160); // 轻微弹起，避免被压在地上连续掉血
    return dmg;
  }

  /** 掉出世界：扣少量血 + 回到最近的安全点 */
  fall(safe, dmg = CONFIG.combat.pitDamage) {
    this.hp = Math.max(0, this.hp - dmg);
    this.x = safe.x;
    this.y = safe.y;
    this.vx = 0;
    this.vy = 0;
    this.kx = 0;
    this.invuln = Math.max(this.invuln, 1.0);
    this.hitFlash = 0.3;
    return dmg;
  }

  heal(n) {
    const before = this.hp;
    this.hp = Math.min(this.stats.maxHp, this.hp + n);
    return Math.round(this.hp - before);
  }

  gainXp(n) {
    this.xp += n;
    let ups = 0;
    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.level += 1;
      ups += 1;
    }
    return ups;
  }

  /* ------------------------------ 外观：像素小人 ------------------------------ */
  draw(ctx, time) {
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    const f = this.facing;
    const moving = this.grounded && Math.abs(this.vx) > 12;
    const airborne = !this.grounded;
    const swing = moving ? Math.sin(this.runPhase * 2.1) : 0;
    const bob = moving ? Math.abs(Math.sin(this.runPhase * 2.1)) * 1 : 0;

    ctx.save();
    ctx.translate(x, y - bob);

    // 落地影子
    if (airborne) {
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(0, this.hh + 2, 9, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const SUIT = '#dbe9ff';
    const SUIT_D = '#9fb6dd';
    const TRIM = '#00e5ff';
    const BOOT = '#ff6b6b';
    const SKIN = '#ffd7b0';
    const HELM = '#16213c';

    if (this.invuln > 0 && Math.floor(time * 18) % 2 === 0) ctx.globalAlpha = 0.45;

    /* 披风 / 能量巾（在身后飘） */
    ctx.fillStyle = TRIM;
    ctx.globalAlpha *= 0.75;
    const flap = Math.sin(time * 9) * 2;
    ctx.beginPath();
    ctx.moveTo(-f * 5, -4);
    ctx.lineTo(-f * (13 + Math.abs(this.vx) * 0.02), -8 + flap);
    ctx.lineTo(-f * (12 + Math.abs(this.vx) * 0.02), 1 + flap);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = this.invuln > 0 && Math.floor(time * 18) % 2 === 0 ? 0.45 : 1;

    /* 腿 */
    let legFront = 0;
    let legBack = 0;
    let legLift = 0;
    if (airborne) {
      legFront = f * 4;
      legBack = -f * 3;
      legLift = this.vy < 0 ? 2 : 0;
    } else {
      legFront = swing * 4;
      legBack = -swing * 4;
    }
    const drawLeg = (off, lift, dark) => {
      ctx.fillStyle = dark ? SUIT_D : SUIT;
      rr(ctx, off - 2.5, this.hh - 11 - lift, 5, 8, 1.5);
      ctx.fill();
      ctx.fillStyle = BOOT;
      rr(ctx, off - 3.5 + (f > 0 ? 0 : 0), this.hh - 4 - lift, 7, 4, 1.5);
      ctx.fill();
    };
    drawLeg(legBack, 0, true);
    drawLeg(legFront, legLift, false);

    /* 身体 */
    const bodyG = ctx.createLinearGradient(0, -6, 0, 8);
    bodyG.addColorStop(0, '#ffffff');
    bodyG.addColorStop(1, SUIT_D);
    ctx.fillStyle = bodyG;
    rr(ctx, -6, -6, 12, 14, 3);
    ctx.fill();
    ctx.fillStyle = TRIM;
    rr(ctx, -6, -1, 12, 3, 1); // 腰带高光
    ctx.fill();

    /* 手臂 */
    const armSwing = airborne ? (this.vy < 0 ? -5 : 5) : -swing * 5;
    const drawArm = (off, c) => {
      ctx.fillStyle = c;
      rr(ctx, off - 1.5, -4, 3.5, 9, 1.5);
      ctx.fill();
      ctx.fillStyle = SKIN;
      rr(ctx, off - 1.5, 4.5, 3.5, 3, 1);
      ctx.fill();
    };
    drawArm(-f * 5 + armSwing * 0.4, SUIT_D);
    // 攻击时前臂前伸
    if (this.slash > 0) drawArm(f * 8, SUIT);
    else drawArm(f * 5 - armSwing * 0.4, SUIT);

    /* 头 */
    ctx.fillStyle = SKIN;
    rr(ctx, -5, -17, 10, 10, 3);
    ctx.fill();
    ctx.fillStyle = HELM;
    rr(ctx, -5.5, -18.5, 11, 6, 3); // 头盔
    ctx.fill();
    ctx.fillStyle = TRIM;
    rr(ctx, f > 0 ? 0 : -5, -15, 5, 3.4, 1.5); // 面罩目光
    ctx.fill();
    ctx.fillStyle = '#0a1a2a';
    rr(ctx, f > 0 ? 2.5 : -2.5, -14.6, 2, 2.2, 1); // 瞳孔
    ctx.fill();

    /* 受击闪白 */
    if (this.hitFlash > 0) {
      ctx.globalAlpha = Math.min(0.75, this.hitFlash * 2.4);
      ctx.fillStyle = '#fff';
      rr(ctx, -8, -19, 16, 34, 5);
      ctx.fill();
    }
    ctx.restore();
  }
}

/* ------------------------------ 怪物 ------------------------------ */
export class Enemy {
  constructor(typeId, x, y, rng = Math.random) {
    const t = MONSTERS.find((m) => m.id === typeId) || MONSTERS[0];
    this.type = t;
    this.id = typeId;
    this.x = x;
    this.y = y;
    this.baseY = y;
    this.hw = t.hw;
    this.hh = t.hh;
    this.dir = rng() < 0.5 ? -1 : 1;
    this.vx = this.dir * t.speed;
    this.vy = 0;
    this.grounded = false;
    this.touchCd = 0;
    this.flash = 0;
    this.hpBar = 0;
    this.seed = rng() * 6.28;
    this.dead = false;
    this.hp = t.hp;
    this.maxHp = t.hp;
    this.squash = 0;
  }

  update(dt, player, map, time) {
    this.touchCd = Math.max(0, this.touchCd - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.hpBar = Math.max(0, this.hpBar - dt);
    this.squash = Math.max(0, this.squash - dt * 3);

    const t = this.type;
    const dx = player.x - this.x;
    const dist = Math.abs(dx);

    if (t.fly) {
      // 空中怪：正弦起伏；玩家靠近时缓慢逼近
      const chase = dist < t.aggro ? t.chase : t.speed;
      const target = dist < t.aggro ? Math.sign(dx || 1) : this.dir;
      this.dir = dist < t.aggro ? target : this.dir;
      this.vx = target * chase;
      const before = this.x;
      if (moveAxisX(this, map, this.vx * dt)) this.dir *= -1;
      this.x = before + (this.x - before);
      this.baseY += (player.y - this.baseY) * Math.min(1, dt * 0.45) * (dist < t.aggro ? 1 : 0);
      this.y = this.baseY + Math.sin(time * 2.2 + this.seed) * 16;
      return;
    }

    // 地面巡逻怪：附近有坡度蒙皮的追击 + 悬崖/撞墙转身
    const aggro = dist < t.aggro && Math.abs(player.y - this.y) < 90;
    const speed = aggro ? t.chase : t.speed;
    if (aggro) this.dir = Math.sign(dx || this.dir);
    this.vx = this.dir * speed;

    const hitX = moveAxisX(this, map, this.vx * dt);
    this.vy = Math.min(700, this.vy + CONFIG.player.gravity * dt);
    moveAxisY(this, map, this.vy * dt);
    if (this.grounded) this.vy = 0;

    if (hitX || (this.grounded && ledgeAhead(map, this.x, this.y, this.hw, this.hh, this.dir))) {
      this.dir *= -1;
      this.vx = this.dir * speed;
    }
  }

  takeDamage(dmg, fromX) {
    this.hp -= dmg;
    this.flash = 0.16;
    this.hpBar = 1.8;
    this.squash = 1;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    return dmg;
  }

  /* ---------------- 外观 ---------------- */
  draw(ctx, time) {
    const t = this.type;
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    ctx.save();
    ctx.translate(x, y);
    if (this.flash > 0) ctx.globalAlpha = 0.8;

    if (this.id === 'slime') {
      const sq = 1 + this.squash * 0.25 - Math.sin(time * 4 + this.seed) * 0.08;
      const hh = this.hh * (2 - sq);
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.moveTo(-this.hw, hh);
      ctx.quadraticCurveTo(-this.hw + 2, -hh - 2, 0, -hh);
      ctx.quadraticCurveTo(this.hw - 2, -hh - 2, this.hw, hh);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath();
      ctx.ellipse(-this.hw * 0.35, -hh * 0.55, 2.4, 1.8, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#06251a';
      rr(ctx, -4.5, -2, 3, 3.4, 1); ctx.fill();
      rr(ctx, 1.8, -2, 3, 3.4, 1); ctx.fill();
    } else if (this.id === 'moth') {
      const flap = Math.sin(time * 16 + this.seed) * 5;
      ctx.fillStyle = 'rgba(124,77,255,.85)';
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.quadraticCurveTo(-this.hw * 2.2, -8 - flap, -this.hw * 2.6, 2 - flap * 0.4);
      ctx.quadraticCurveTo(-this.hw, 3, 0, 3);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.quadraticCurveTo(this.hw * 2.2, -8 - flap, this.hw * 2.6, 2 - flap * 0.4);
      ctx.quadraticCurveTo(this.hw, 3, 0, 3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#2a1c50';
      rr(ctx, -4, -this.hh, 8, this.hh + 5, 3); ctx.fill();
      ctx.fillStyle = '#ff6b6b';
      rr(ctx, -2.4, -this.hh + 3, 2, 2, 1); ctx.fill();
      rr(ctx, 0.8, -this.hh + 3, 2, 2, 1); ctx.fill();
    } else {
      // 石魔：方块身体 + 发光核心
      ctx.fillStyle = '#5a4a6a';
      rr(ctx, -this.hw, -this.hh, this.hw * 2, this.hh * 2, 4); ctx.fill();
      ctx.fillStyle = '#3d3149';
      rr(ctx, -this.hw + 2, -this.hh + 4, this.hw * 2 - 4, 6, 2); ctx.fill();
      ctx.fillStyle = t.color;
      const glow = 0.6 + Math.sin(time * 5 + this.seed) * 0.4;
      ctx.globalAlpha = glow;
      rr(ctx, -6, -2, 12, 5, 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#8a7a9a';
      rr(ctx, -this.hw - 3, 2, 4, 8, 1.5); ctx.fill();
      rr(ctx, this.hw - 1, 2, 4, 8, 1.5); ctx.fill();
    }

    if (this.type.elite) {
      ctx.strokeStyle = 'rgba(255,64,129,.5)';
      ctx.lineWidth = 1;
      rr(ctx, -this.hw - 3, -this.hh - 3, this.hw * 2 + 6, this.hh * 2 + 6, 5);
      ctx.stroke();
    }

    // 血条（受击后短暂显示）
    if (this.hpBar > 0 && !this.dead) {
      const w = this.hw * 2 + 6;
      const p = Math.max(0, this.hp / this.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      rr(ctx, -w / 2, -this.hh - 9, w, 4, 2); ctx.fill();
      ctx.fillStyle = p > 0.5 ? '#69f0ae' : p > 0.25 ? '#ffd166' : '#ff4081';
      rr(ctx, -w / 2 + 0.5, -this.hh - 8.5, (w - 1) * p, 3, 1.5); ctx.fill();
    }
    ctx.restore();
  }
}

/* ------------------------------ 拾取物 ------------------------------ */
export class Pickup {
  /** @param {'coin'|'potion'|'key'} kind */
  constructor(kind, x, y) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.hw = kind === 'key' ? 12 : kind === 'potion' ? 9 : 7;
    this.hh = kind === 'key' ? 12 : kind === 'potion' ? 11 : 7;
    this.taken = false;
    this.bob = Math.random() * 6.28;
  }

  draw(ctx, time) {
    if (this.taken) return;
    const y = this.y + Math.sin(time * 3 + this.bob) * 3;
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(y));
    if (this.kind === 'coin') {
      const px = Math.abs(Math.cos(time * 4 + this.bob));
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.ellipse(0, 0, 6 * px + 1, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.beginPath();
      ctx.ellipse(-1.5, -2, 1.6 * px + 0.4, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.kind === 'potion') {
      ctx.fillStyle = 'rgba(105,240,174,.25)';
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#cfe9ff';
      rr(ctx, -6, -9, 12, 14, 4); ctx.fill();
      ctx.fillStyle = '#69f0ae';
      rr(ctx, -5, -3, 10, 7, 3); ctx.fill();
      ctx.fillStyle = '#ffd166';
      rr(ctx, -2.5, -12, 5, 4, 1.5); ctx.fill();
    } else {
      // 钥匙：金环 + 齿，带光柱
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
      g.addColorStop(0, 'rgba(255,209,102,.35)');
      g.addColorStop(1, 'rgba(255,209,102,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0, -4, 5.5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 1.5); ctx.lineTo(0, 11); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(4.5, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 10.5); ctx.lineTo(3.6, 10.5); ctx.stroke();
    }
    ctx.restore();
  }
}
