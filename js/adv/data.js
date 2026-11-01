/**
 * ============================================================
 * adv/data.js —— 横版卷轴平台跳跃（马里奥式）的数据源
 * ------------------------------------------------------------
 * 生涯节点直接 import 贪吃蛇那份 MILESTONES：
 *  - 内容、顺序、复古科技风文案完全一致（12 个节点）
 *  - 解锁条件：每打开一个终点宝箱 -> 顺序解锁下一个节点
 *  - 进度保存口径一致：localStorage 记录最佳成绩与已解锁节点
 *
 * 【玩法】每关一条从左到右的卷轴路线：
 *   跳跃跑图 → 拿到钥匙 → 走到终点宝箱 → 冻结展示节点 → 按任意键进入下一关
 * 关卡章节名与配色集中在 LEVEL_THEMES，新增关卡只需 push 一条。
 * ============================================================
 */

import { MILESTONES } from '../snake/data.js';

/** 生涯节点：与贪吃蛇共用同一份数据，改一处两边同步 */
export const NODES = MILESTONES;
export const NODE_COUNT = NODES.length;

/**
 * 虚拟分辨率：渲染始终按这个尺寸作画，再等比缩放到画布。
 * 720×416 ≈ 22.5 × 13 格，保证一屏内能看清完整的跳跃路线。
 */
export const VIEW = { w: 720, h: 416 };

export const CONFIG = {
  tile: 32,
  levelRows: 15, // 世界高度 480px（比可视区高 64px，镜头可轻微上下跟随）
  levelCols: (i) => Math.min(150, 92 + i * 4),

  player: {
    hp: 100,
    hw: 9, hh: 14, // 像素小人碰撞盒：18 × 28
    speed: 208,
    accel: 1900,
    friction: 2300,
    airAccel: 1350,
    gravity: 1900,
    jumpV: 620, // 起跳初速 → 跳高 ≈ 101px ≈ 3.2 格
    gravityCut: 2.4, // 松开跳跃键后的额外重力（可变跳跃高度）
    maxJumps: 2, // 二段跳：容错更高，整体难度更低
    maxFall: 880,
    coyote: 0.11, // 土狼时间
    jumpBuffer: 0.13, // 跳跃缓冲（落地前提前按键也算）
    damage: 16,
    stompMul: 1.6, // 踩踏伤害倍率
    atkCd: 0.36,
    atkRange: 44,
    crit: 0.08,
    critMul: 2,
    lifesteal: 0,
    dashSpeed: 560,
    dashTime: 0.16,
    dashCd: 1.1,
    invuln: 0.9, // 受击后无敌时间
  },

  combat: {
    knockback: 110,
    enemyTouchCd: 0.8,
    potionHeal: 30,
    pitDamage: 8, // 掉坑只扣少量血，并在最近安全点重生
    spikeDamage: 8,
    stompBounce: 430, // 踩怪后的弹跳初速
  },

  score: { node: 100, kill: 12, coin: 5, winBonus: 400 },
  xpNeed: (lv) => 18 + lv * 14,
};

/**
 * 12 个关卡的章节名与配色。
 * 横版侧视角需要「天空 / 远景 / 中景 / 地面 / 泥土 / 草皮高光」六层配色，
 * decor 决定远景画法：cloud 云海 / hill 山峦 / city 城市天际线。
 * 想加关卡：push 一条即可；实际关卡数 = min(NODES.length, LEVEL_THEMES.length)。
 */
export const LEVEL_THEMES = [
  {
    chapter: '序章 · 启程', accent: '#00e5ff',
    sky: ['#0d2a4a', '#050810'], far: '#0b1b34', mid: '#101f3c',
    ground: '#1d3459', dirt: '#0c1526', grass: '#00e5ff', decor: 'cloud',
  },
  {
    chapter: '第一章 · 基石', accent: '#69f0ae',
    sky: ['#123a2c', '#050f0b'], far: '#0c2a20', mid: '#123a2b',
    ground: '#1c4a37', dirt: '#0a1a12', grass: '#69f0ae', decor: 'hill',
  },
  {
    chapter: '第二章 · 集结', accent: '#7c4dff',
    sky: ['#231a4d', '#08060f'], far: '#1a1240', mid: '#241a52',
    ground: '#2e2159', dirt: '#100b23', grass: '#7c4dff', decor: 'city',
  },
  {
    chapter: '第三章 · 立项', accent: '#4d8bff',
    sky: ['#122b57', '#050a16'], far: '#0d1f45', mid: '#132a55',
    ground: '#1f3a6b', dirt: '#0a1226', grass: '#4d8bff', decor: 'hill',
  },
  {
    chapter: '第四章 · 科研', accent: '#26e0d0',
    sky: ['#0d3a3d', '#04100f'], far: '#0a2c2e', mid: '#0f3d3f',
    ground: '#164f52', dirt: '#06181a', grass: '#26e0d0', decor: 'city',
  },
  {
    chapter: '第五章 · 试炼', accent: '#ffb74d',
    sky: ['#40270d', '#120b05'], far: '#331f0c', mid: '#452b10',
    ground: '#5a3a15', dirt: '#20140a', grass: '#ffb74d', decor: 'hill',
  },
  {
    chapter: '第六章 · 锋芒', accent: '#ff4081',
    sky: ['#3f1029', '#120610'], far: '#320d22', mid: '#451433',
    ground: '#5c1e3c', dirt: '#210a16', grass: '#ff4081', decor: 'city',
  },
  {
    chapter: '第七章 · 远征', accent: '#8c9eff',
    sky: ['#17204f', '#06071a'], far: '#121944', mid: '#1b2560',
    ground: '#27356e', dirt: '#0b1029', grass: '#8c9eff', decor: 'cloud',
  },
  {
    chapter: '第八章 · 淬炼', accent: '#aed581',
    sky: ['#25360f', '#0a1005'], far: '#1e2c0d', mid: '#2b3f13',
    ground: '#3c541a', dirt: '#11180a', grass: '#aed581', decor: 'hill',
  },
  {
    chapter: '第九章 · 荣光', accent: '#ff6b6b',
    sky: ['#4a1418', '#150608'], far: '#3a1014', mid: '#53181d',
    ground: '#6a2229', dirt: '#230a0e', grass: '#ff6b6b', decor: 'city',
  },
  {
    chapter: '第十章 · 传承', accent: '#ce93d8',
    sky: ['#33184d', '#0d0714'], far: '#291340', mid: '#3a1a58',
    ground: '#4b2765', dirt: '#180b24', grass: '#ce93d8', decor: 'cloud',
  },
  {
    chapter: '终章 · 轨迹', accent: '#ffd166',
    sky: ['#4a3610', '#160f05'], far: '#3c2b0e', mid: '#523813',
    ground: '#6b4a18', dirt: '#241708', grass: '#ffd166', decor: 'city',
  },
];

/** 怪物图鉴（横版行为：地面巡逻 + 空中飞行两种 AI） */
export const MONSTERS = [
  {
    id: 'slime', name: '导电史莱姆', icon: '🟢',
    hp: 22, dmg: 6, speed: 42, chase: 78, hw: 12, hh: 11, xp: 8, color: '#69f0ae',
    walk: true, aggro: 230,
    note: '在一段地面上巡逻，靠近才提速；踩一下就瘪',
  },
  {
    id: 'moth', name: '循迹飞蛾', icon: '🦇',
    hp: 14, dmg: 5, speed: 58, chase: 88, hw: 11, hh: 9, xp: 7, color: '#7c4dff',
    fly: true, aggro: 270,
    note: '沿正弦轨迹飘，跳跃时要看清它的位置',
  },
  {
    id: 'golem', name: '守护石魔', icon: '🗿',
    hp: 56, dmg: 11, speed: 30, chase: 54, hw: 15, hh: 16, xp: 18, color: '#ff4081',
    walk: true, aggro: 190, elite: true,
    note: '血厚但很慢，通常守在钥匙阶梯塔附近',
  },
];

/** 升级三选一：apply 直接改玩家的 stats 对象 */
export const PERKS = [
  { id: 'dmg', name: '锋锐', icon: '⚔️', desc: '攻击力 +6', apply: (s) => (s.damage += 6) },
  { id: 'aspd', name: '疾流派', icon: '⏱️', desc: '攻击冷却 -12%', apply: (s) => (s.atkCd *= 0.88) },
  { id: 'speed', name: '疾行靴', icon: '👟', desc: '移动速度 +12%', apply: (s) => (s.speed *= 1.12) },
  { id: 'hp', name: '坚韧之芯', icon: '❤️', desc: '生命上限 +25 并回复等量生命', apply: (s) => { s.maxHp += 25; s.hp = Math.min(s.maxHp, s.hp + 25); } },
  { id: 'range', name: '长锋', icon: '📏', desc: '攻击范围 +10', apply: (s) => (s.atkRange += 10) },
  { id: 'crit', name: '洞察', icon: '🎯', desc: '暴击率 +10%', apply: (s) => (s.crit += 0.1) },
  { id: 'steal', name: '汲取', icon: '🩸', desc: '造成伤害的 8% 转化为生命', apply: (s) => (s.lifesteal += 0.08) },
  { id: 'dash', name: '残影', icon: '💨', desc: '冲刺冷却 -25%', apply: (s) => (s.dashCd *= 0.75) },
  { id: 'jump', name: '弹力核心', icon: '⬆️', desc: '跳跃高度 +14%', apply: (s) => (s.jumpV *= 1.14) },
  { id: 'stomp', name: '重踏', icon: '🥾', desc: '踩踏伤害 +80%', apply: (s) => (s.stompMul += 0.8) },
];
