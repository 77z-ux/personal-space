/**
 * ============================================================
 * adv/data.js —— 冒险小游戏的数据源
 * ------------------------------------------------------------
 * 生涯节点直接 import 贪吃蛇那份 MILESTONES：
 *  - 内容、顺序、复古科技风文案完全一致（12 个节点）
 *  - 解锁条件在这边变成：每打开一个宝藏 -> 顺序解锁下一个节点
 *  - 进度保存口径一致：localStorage 记录最佳成绩与已解锁节点
 * 新增职业数据的地方：CONFIG（数值）、MONSTERS（怪物）、PERKS（成长）
 *
 * 【关卡制】每关对应一个节点，共 12 关，从左到右线性推进：
 *  跑图清怪 -> 找到钥匙 -> 打开终点宝箱 -> 冻结展示节点详情 -> 按任意键进入下一关
 * 关卡章节名与配色集中在 LEVEL_THEMES，新增关卡只需 push 一条。
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
  levelRows: 18, // 关卡制：单关高度（格）

  player: {
    hp: 100,
    speed: 182,
    damage: 18,
    atkCd: 0.42,
    atkRange: 48,
    atkArc: 110, // 扇形角度（度）
    crit: 0.08,
    critMul: 2,
    lifesteal: 0,
    // 冲刺要能跨越 2 格宽的深渊：640 * 0.18 ≈ 115px（1 格 32px）
    dashSpeed: 640,
    dashTime: 0.18,
    dashCd: 1.25,
    invuln: 0.65, // 受击后无敌时间
  },

  combat: {
    knockback: 165, // 怪物受击击退
    enemyTouchCd: 0.75, // 怪物接触伤害间隔
    potionHeal: 32,
    pitDamage: 14, // 掉进深渊的惩罚
  },

  score: { node: 100, kill: 12, winBonus: 400 },
  xpNeed: (lv) => 20 + lv * 16,
};

/**
 * 12 个关卡的章节名与配色。
 * 想加关卡：push 一条即可；LESS 关卡数 = min(NODES.length, LEVEL_THEMES.length)。
 */
export const LEVEL_THEMES = [
  { chapter: '序章 · 启程', wall: '#131c33', floor: '#0a1120', accent: '#00e5ff' },
  { chapter: '第一章 · 基石', wall: '#12261f', floor: '#08150f', accent: '#69f0ae' },
  { chapter: '第二章 · 集结', wall: '#1b1636', floor: '#0d0a1c', accent: '#7c4dff' },
  { chapter: '第三章 · 立项', wall: '#111c3a', floor: '#080e20', accent: '#4d8bff' },
  { chapter: '第四章 · 科研', wall: '#0f2a2e', floor: '#061418', accent: '#26e0d0' },
  { chapter: '第五章 · 试炼', wall: '#2a2110', floor: '#150f05', accent: '#ffb74d' },
  { chapter: '第六章 · 锋芒', wall: '#2c1226', floor: '#160a12', accent: '#ff4081' },
  { chapter: '第七章 · 远征', wall: '#171a3d', floor: '#0a0b1e', accent: '#8c9eff' },
  { chapter: '第八章 · 淬炼', wall: '#1d2a10', floor: '#0d1406', accent: '#aed581' },
  { chapter: '第九章 · 荣光', wall: '#2d1216', floor: '#16080a', accent: '#ff6b6b' },
  { chapter: '第十章 · 传承', wall: '#241338', floor: '#110820', accent: '#ce93d8' },
  { chapter: '终章 · 轨迹', wall: '#2e2410', floor: '#171105', accent: '#ffd166' },
];

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
