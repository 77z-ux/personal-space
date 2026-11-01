/**
 * ============================================================
 * adv/entities.js —— 实体层：玩家 / 怪物 / 拾取物
 * ------------------------------------------------------------
 * 玩家：八向自由移动 + 扇形近战 + 冲刺位移；stats 是唯一的成长入口，
 *       所有 perk 都只改这个对象，方便结算与调试。
 * 怪物：基础追击 AI（直线牵引 + 飘忽扰动），支持墙体绕行、击退、受击闪白。
 * 拾取物：宝藏（解锁生涯节点）/ 药水（回血）。
 * ============================================================
 */

import { CONFIG, MONSTERS } from './data.js';
import { circleHitsWall } from './dungeon.js';

/** 通用：按轴推进并在撞墙时自动贴墙滑行 */
function moveWithCollision(e, map, dt) {
  const nx = e.x + e.vx * dt;
  if (!circleHitsWall(map, nx, e.y, e.r)) e.x = nx;
  else e.vx = 0;
  const ny = e.y + e.vy * dt;
  if (!circleHitsWall(map, e.x, ny, e.r)) e.y = ny;
  else e.vy = 0;
}

/* ------------------------------ 玩家 ------------------------------ */
export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = 11;
    this.stats = { ...CONFIG.player, maxHp: CONFIG.player.hp };
    this.hp = this.stats.maxHp;
    this.level = 1;
    this.xp = 0;
    this.aim = 0; // 朝向弧度
    this.atkTimer = 0;
    this.slash = 0; // 挥砍动画进度 1→0
    this.dashTimer = 0;
    this.dashCd = 0;
    this.invuln = 0;
    this.hitFlash = 0;
    this.kx = 0;
    this.ky = 0;
    this.vx = 0;
    this.vy = 0;
  }

  get xpNeed() { return CONFIG.xpNeed(this.level); }

  update(dt, input, map) {
    const s = this.stats;
    this.atkTimer = Math.max(0, this.atkTimer - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.dashTimer = Math.max(0, this.dashTimer - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.slash = Math.max(0, this.slash - dt * 5.5);

    // 朝向：有输入就以移动方向为准
    let mx = input.mx || 0;
    let my = input.my || 0;
    const len = Math.hypot(mx, my);
    if (len > 0.05) {
      mx /= len; my /= len;
      this.aim = Math.atan2(my, mx);
    }

    // 冲刺：短时间高速位移，结束后残留少量惯性
    if (this.dashTimer > 0) {
      this.vx = Math.cos(this.dashDir) * s.dashSpeed;
      this.vy = Math.sin(this.dashDir) * s.dashSpeed;
    } else {
      this.vx = mx * s.speed;
      this.vy = my * s.speed;
    }

    moveWithCollision(this, map, dt);

    // 受击击退衰减
    this.x += this.kx * dt;
    this.y += this.ky * dt;
    if (circleHitsWall(map, this.x, this.y, this.r)) { this.kx = 0; this.ky = 0; }
    const decay = Math.pow(0.001, dt);
    this.kx *= decay;
    this.ky *= decay;
  }

  canAttack() { return this.atkTimer <= 0; }

  /** 触发一次挥砍，返回本次攻击的参数（命中判定在 game 里做） */
  attack() {
    if (!this.canAttack()) return null;
    this.atkTimer = this.stats.atkCd;
    this.slash = 1;
    return { x: this.x, y: this.y, angle: this.aim, range: this.stats.atkRange, arc: this.stats.atkArc };
  }

  tryDash() {
    if (this.dashCd > 0 || this.dashTimer > 0) return false;
    this.dashTimer = this.stats.dashTime;
    this.dashCd = this.stats.dashCd;
    this.dashDir = this.aim;
    return true;
  }

  takeDamage(dmg, fromX, fromY) {
    if (this.invuln > 0) return 0;
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = this.stats.invuln;
    this.hitFlash = 0.28;
    const a = Math.atan2(this.y - fromY, this.x - fromX);
    this.kx = Math.cos(a) * 260;
    this.ky = Math.sin(a) * 260;
    return dmg;
  }

  heal(n) {
    const before = this.hp;
    this.hp = Math.min(this.stats.maxHp, this.hp + n);
    return Math.round(this.hp - before);
  }

  /** 加经验，返回本次升级的次数 */
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
}

/* ------------------------------ 怪物 ------------------------------ */
export class Enemy {
  constructor(typeId, x, y, rng = Math.random) {
    const t = MONSTERS.find((m) => m.id === typeId) || MONSTERS[0];
    this.type = t;
    this.x = x;
    this.y = y;
    this.r = t.radius;
    this.hp = t.hp;
    this.maxHp = t.hp;
    this.touchCd = 0;
    this.flash = 0;
    this.hpBar = 0;
    this.kx = 0;
    this.ky = 0;
    this.vx = 0;
    this.vy = 0;
    this.seed = rng() * 10;
    this.dead = false;
    this.bob = rng() * 6.28;
  }

  update(dt, player, map, time, aggro = 330) {
    this.touchCd = Math.max(0, this.touchCd - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.hpBar = Math.max(0, this.hpBar - dt);

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist < aggro && dist > 1) {
      let ang = Math.atan2(dy, dx);
      if (this.type.wobble) ang += Math.sin(time * 3.1 + this.seed) * 0.55;
      this.vx = Math.cos(ang) * this.type.speed;
      this.vy = Math.sin(ang) * this.type.speed;
      this.aim = ang;
    } else {
      // 脱战：慢慢停下
      this.vx *= 0.86;
      this.vy *= 0.86;
    }

    moveWithCollision(this, map, dt);

    // 击退
    this.x += this.kx * dt;
    this.y += this.ky * dt;
    if (circleHitsWall(map, this.x, this.y, this.r)) { this.kx = 0; this.ky = 0; }
    const decay = Math.pow(0.0008, dt);
    this.kx *= decay;
    this.ky *= decay;
  }

  takeDamage(dmg, fromX, fromY) {
    this.hp -= dmg;
    this.flash = 0.16;
    this.hpBar = 1.8;
    const a = Math.atan2(this.y - fromY, this.x - fromX);
    const power = this.type.elite ? 90 : CONFIG.combat.knockback;
    this.kx = Math.cos(a) * power;
    this.ky = Math.sin(a) * power;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    return dmg;
  }
}

/* ------------------------------ 拾取物 ------------------------------ */
export class Pickup {
  /** @param {'chest'|'potion'} kind */
  constructor(kind, x, y, payload = null) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.r = kind === 'chest' ? 14 : 10;
    this.payload = payload; // 宝藏携带的节点序号
    this.taken = false;
    this.bob = Math.random() * 6.28;
  }
}
