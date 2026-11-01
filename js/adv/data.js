/**
 * ============================================================
 * adv/data.js —— 冒险小游戏的数据源
 * ------------------------------------------------------------
 * 生涯节点直接 import 贪吃蛇那份 MILESTONES：
 *  - 内容、顺序、复古科技风文案完全一致（12 个节点）
 *  - 解锁条件在这边变成：每打开一个宝藏 -> 顺序解锁下一个节点
 *  - 进度保存口径一致：localStorage 记录最佳成绩与已解锁节点
 * 新增职业数据的地方：CONFIG（数值）、MONSTERS（怪物）、PERKS（成长）
 * ============================================================
 */

import { MILESTONES } from '../snake/data.js';

/** 生涯节点：与贪吃蛇共用同一份数据，改一处两边同步 */
export const NODES = MILESTONES;
export const NODE_COUNT = NODES.length;

export const CONFIG = {
  tile: 32,
  mapCols: 62,
  mapRows: 44,

  player: {
    hp: 100,
    speed: 176,
    damage: 18,
    atkCd: 0.42,
    atkRange: 48,
    atkArc: 110, // 扇形角度（度）
    crit: 0.08,
    critMul: 2,
    lifesteal: 0,
    dashSpeed: 570,
    dashTime: 0.16,
    dashCd: 1.3,
    invuln: 0.65, // 受击后无敌时间
  },

  combat: {
    knockback: 165, // 怪物受击击退
    enemyTouchCd: 0.75, // 怪物接触伤害间隔
    potionHeal: 32,
  },

  score: { node: 100, kill: 12, winBonus: 400 },
  xpNeed: (lv) => 20 + lv * 16,
};

/** 怪物图鉴（三种基础 AI 行为） */
export const MONSTERS = [
  {
    id: 'slime', name: '导电史莱姆', icon: '🟢',
    hp: 26, dmg: 7, speed: 46, radius: 12, xp: 7, color: '#69f0ae',
    note: '缓慢但成群，贴身持续消耗血量',
  },
  {
    id: 'moth', name: '循迹飞蛾', icon: '🦇',
    hp: 16, dmg: 5, speed: 104, radius: 10, xp: 6, color: '#7c4dff',
    wobble: true, note: '高速且轨迹飘忽，考验预判与走位',
  },
  {
    id: 'golem', name: '守护石魔', icon: '🗿',
    hp: 68, dmg: 14, speed: 54, radius: 17, xp: 16, color: '#ff4081',
    elite: true, note: '血量厚伤害高，守着关键宝藏',
  },
];

/** 升级三选一：apply 直接改玩家的 stats 对象 */
export const PERKS = [
  { id: 'dmg', name: '锋锐', icon: '⚔️', desc: '攻击力 +6', apply: (s) => (s.damage += 6) },
  { id: 'aspd', name: '疾流派', icon: '⏱️', desc: '攻击冷却 -12%', apply: (s) => (s.atkCd *= 0.88) },
  { id: 'speed', name: '疾行靴', icon: '👟', desc: '移动速度 +12%', apply: (s) => (s.speed *= 1.12) },
  { id: 'hp', name: '坚韧之芯', icon: '❤️', desc: '生命上限 +25 并回满该部分', apply: (s) => { s.maxHp += 25; s.hp = Math.min(s.maxHp, s.hp + 25); } },
  { id: 'range', name: '长锋', icon: '📏', desc: '攻击范围 +8、扇形 +15°', apply: (s) => { s.atkRange += 8; s.atkArc += 15; } },
  { id: 'crit', name: '洞察', icon: '🎯', desc: '暴击率 +10%', apply: (s) => (s.crit += 0.1) },
  { id: 'steal', name: '汲取', icon: '🩸', desc: '造成伤害的 8% 转化为生命', apply: (s) => (s.lifesteal += 0.08) },
  { id: 'dash', name: '残影', icon: '💨', desc: '冲刺冷却 -25%', apply: (s) => (s.dashCd *= 0.75) },
];
