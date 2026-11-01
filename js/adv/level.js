/**
 * ============================================================
 * adv/level.js —— 【横版卷轴】马里奥式关卡生成 + 地形碰撞
 * ------------------------------------------------------------
 * 侧视角布局：世界是一条从左到右的卷轴，镜头跟着角色横向滚动。
 * 每关结构（随关卡序号缓慢变难，但整体偏简单）：
 *   · 地表轮廓 ：随机游走 + 平滑，形成平缓丘陵台阶（单格落差）
 *   · 深坑     ：2~3 格宽，数量很少（1~4 个），二段跳轻松跨越
 *   · 浮空砖台 ：水平间距 2~4 格、垂直落差 ≤2 格，保证一定可达
 *   · 钥匙阶梯 ：三级台阶，逐级上升 2 格，必定能爬到顶端拿到钥匙
 *   · 尖刺     ：极少量，触碰只掉少量血
 *   · 金币     ：铺在跳跃路线上，起「指路」作用
 *   · 终点宝箱 ：最右侧平地，必须先有钥匙才能打开
 *
 * 地形编码：AIR 空气 / SOLID 实心土 / BRICK 砖块（地表与平台外皮）/ SPIKE 尖刺
 * 对外接口：generateLevel(index, rng) -> map
 *   map.grid / cols / rows / worldW / worldH / theme
 *   map.spawn   {x, groundY}  出生点（像素）
 *   map.chest   {x, groundY}  终点宝箱脚下的地面
 *   map.key     {x, y}        钥匙位置
 *   map.enemies [{id,x,y}]    敌人出生点
 *   map.pickups [{kind,x,y}]  药水
 *   map.coins   [{x,y}]       金币
 * ============================================================
 */

import { CONFIG, LEVEL_THEMES, MONSTERS } from './data.js';
import { makeRng } from './dungeon.js';

export { makeRng };

/** 地形类型（横版专用，与旧的俯视地牢编码无关） */
export const TI = { AIR: 0, SOLID: 1, BRICK: 2, SPIKE: 3 };

const T = CONFIG.tile;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rint = (rng, a, b) => rng.int(a, b);

/* ---------------------- 地形查询（像素坐标） ---------------------- */

export function tileAt(map, tx, ty) {
  if (ty < 0 || ty >= map.rows) return TI.AIR; // 上下边界视为空气（掉出去 = 掉坑）
  if (tx < 0 || tx >= map.cols) return TI.SOLID; // 左右边界是隐形墙
  return map.grid[ty * map.cols + tx];
}

export const isSolidAt = (map, tx, ty) => {
  const t = tileAt(map, tx, ty);
  return t === TI.SOLID || t === TI.BRICK;
};

/** 实体（中心点 + 半宽半高）是否与实心砖重叠 */
export function overlapsSolid(map, x, y, hw, hh) {
  const x0 = Math.floor((x - hw) / T);
  const x1 = Math.floor((x + hw - 0.001) / T);
  const y0 = Math.floor((y - hh) / T);
  const y1 = Math.floor((y + hh - 0.001) / T);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) if (isSolidAt(map, tx, ty)) return true;
  }
  return false;
}

/** 是否踩到某种特殊地形（如尖刺） */
export function overlapsTile(map, x, y, hw, hh, type) {
  const x0 = Math.floor((x - hw) / T);
  const x1 = Math.floor((x + hw - 0.001) / T);
  const y0 = Math.floor((y - hh) / T);
  const y1 = Math.floor((y + hh - 0.001) / T);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) if (tileAt(map, tx, ty) === type) return true;
  }
  return false;
}

/** 单轴推进：按 3px 步进，撞到实心就停下。返回是否撞击 */
function sweep(e, map, axis, amount) {
  const dir = Math.sign(amount);
  let rest = Math.abs(amount);
  let hit = false;
  while (rest > 0) {
    const step = Math.min(rest, 3);
    const nx = axis === 'x' ? e.x + dir * step : e.x;
    const ny = axis === 'y' ? e.y + dir * step : e.y;
    if (overlapsSolid(map, nx, ny, e.hw, e.hh)) { hit = true; break; }
    e.x = nx;
    e.y = ny;
    rest -= step;
  }
  return hit;
}

export function moveAxisX(e, map, dx) {
  if (!dx) return false;
  return sweep(e, map, 'x', dx);
}

export function moveAxisY(e, map, dy) {
  e.grounded = false;
  if (!dy) {
    if (overlapsSolid(map, e.x, e.y + 0.8, e.hw, e.hh)) e.grounded = true;
    return false;
  }
  const hit = sweep(e, map, 'y', dy);
  if (hit && dy > 0) e.grounded = true;
  else if (!hit && overlapsSolid(map, e.x, e.y + 0.8, e.hw, e.hh)) e.grounded = true;
  return hit;
}

/** 前方是否悬崖（巡逻怪据此转身，保证它们不会自己跳进坑里） */
export function ledgeAhead(map, x, y, hw, hh, dir) {
  const tx = Math.floor((x + dir * (hw + 3)) / T);
  const ty = Math.floor((y + hh + 3) / T);
  return !isSolidAt(map, tx, ty);
}

/* ---------------------- 关卡生成 ---------------------- */

export function generateLevel(index, rng) {
  const cols = Math.min(150, CONFIG.levelCols(index));
  const rows = CONFIG.levelRows;
  const grid = new Uint8Array(cols * rows);
  const isPit = new Uint8Array(cols);
  const setT = (tx, ty, v) => {
    if (tx >= 0 && tx < cols && ty >= 0 && ty < rows) grid[ty * cols + tx] = v;
  };
  const getT = (tx, ty) => (tx >= 0 && tx < cols && ty >= 0 && ty < rows ? grid[ty * cols + tx] : TI.SOLID);

  const GROUND = rows - 3; // 地表基准行（下方 3 行实心土层）

  /* ---------- 1) 地表轮廓：随机游走 + 平滑 → 平缓丘陵 ---------- */
  const surf = new Array(cols).fill(GROUND);
  let h = GROUND;
  for (let x = 8; x < cols - 9; x++) {
    if (rng() < 0.52) { /* 保持高度，形成小平台 */ } else h += rng() < 0.5 ? -1 : 1;
    h = clamp(h, GROUND - 3, GROUND);
    surf[x] = h;
  }
  for (let pass = 0; pass < 2; pass++) {
    const c = surf.slice();
    for (let x = 1; x < cols - 1; x++) surf[x] = Math.round((c[x - 1] + c[x] * 2 + c[x + 1]) / 4);
  }
  for (let x = 0; x < 8; x++) surf[x] = GROUND; // 出生区平整
  for (let x = cols - 12; x < cols; x++) surf[x] = GROUND; // 终点区平整

  /* ---------- 2) 深坑：很少、很窄，容错高 ---------- */
  const wantPits = clamp(1 + Math.floor(index / 3), 1, 4);
  const pits = [];
  let guard = 0;
  while (pits.length < wantPits && guard++ < 240) {
    const x = rint(rng, 22, Math.max(23, cols - 30));
    const w = rint(rng, 2, 3); // 2~3 格（64~96px），二段跳必定跨得过
    if (x + w >= cols - 16) continue;
    let ok = true;
    for (let i = -6; i < w + 6; i++) if (isPit[x + i]) ok = false;
    if (!ok) continue;
    for (let i = 0; i < w; i++) isPit[x + i] = 1;
    // 两岸拉平，起跳与落地都稳
    const flat = Math.min(surf[Math.max(0, x - 1)], surf[Math.min(cols - 1, x + w)]);
    for (let i = Math.max(0, x - 3); i < x; i++) surf[i] = flat;
    for (let i = x + w; i < Math.min(cols, x + w + 3); i++) surf[i] = flat;
    pits.push({ x, w });
  }

  /* ---------- 3) 填充地表 ---------- */
  for (let x = 0; x < cols; x++) {
    if (isPit[x]) continue;
    const top = surf[x];
    for (let ty = top; ty < rows; ty++) setT(x, ty, ty === top ? TI.BRICK : TI.SOLID);
  }

  /* ---------- 4) 浮空砖台：始终高出地表 ≥3 格，绝不会变成挡路的矮墙 ---------- */
  const platforms = [];
  let px = 13;
  let prow = GROUND - 4;
  while (px < cols - 18) {
    const w = rint(rng, 3, 5);
    const want = clamp(prow + rng.pick([-2, -1, -1, 0, 1, 1, 2]), GROUND - 7, GROUND - 3);
    // 取所跨越各列地表再往上 3 格中的最高者（行号最小），保证角色能从头下走过
    let minRow = GROUND - 3;
    for (let i = 0; i < w; i++) minRow = Math.min(minRow, surf[Math.min(cols - 1, px + i)] - 3);
    const row = Math.max(3, Math.min(want, minRow));
    for (let i = 0; i < w; i++) setT(px + i, row, TI.BRICK);
    platforms.push({ x0: px, x1: px + w - 1, y: row, w });
    prow = row;
    px += w + rint(rng, 2, 4);
  }

  /* ---------- 4.5) 通行性兜底：地表上方 3 格一律清空，保证跑图不会被卡住 ---------- */
  for (let x = 0; x < cols; x++) {
    if (isPit[x]) continue;
    for (let y = surf[x] - 3; y < surf[x]; y++) {
      if (y >= 0 && getT(x, y) !== TI.AIR) setT(x, y, TI.AIR);
    }
  }

  /* ---------- 5) 尖刺：少量，只在靠后的关卡出现 ---------- */
  const spikes = [];
  const wantSpikes = index < 2 ? 0 : Math.min(5, Math.floor((index - 1) / 2));
  let sg = 0;
  while (spikes.length < wantSpikes && sg++ < 200) {
    const x = rint(rng, 20, Math.max(21, cols - 18));
    if (isPit[x] || isPit[x - 1] || isPit[x + 1]) continue;
    if (surf[x - 1] !== surf[x] || surf[x + 1] !== surf[x]) continue; // 只放在平地
    if (spikes.some((s) => Math.abs(s - x) < 12)) continue;
    setT(x, surf[x] - 1, TI.SPIKE);
    spikes.push(x);
  }

  /* ---------- 6) 钥匙塔：单格抬升的连续楼梯，走过去就能一路登顶 ---------- */
  let kx = clamp(Math.round(cols * 0.62), 26, cols - 22);
  for (let tries = 0; tries < 40; tries++) {
    let ok = true;
    for (let i = -12; i <= 10; i++) if (isPit[kx + i]) ok = false;
    if (ok) break;
    kx -= 2;
    if (kx < 26) { kx = clamp(Math.round(cols * 0.62), 26, cols - 22); break; }
  }
  const entryCol = Math.max(1, kx - 9);
  const baseRow = surf[entryCol]; // 从入口地面起算，保证第一级只高 1 格
  const steps = [];
  for (let i = 0; i < 6; i++) {
    const row = Math.max(3, baseRow - 1 - i);
    const c0 = entryCol + i * 2;
    for (let j = 0; j < 2; j++) setT(c0 + j, row, TI.BRICK);
    steps.push({ col: c0, row, w: 2 });
  }
  // 塔顶小平台：再抬 1 格，宽 3 格，钥匙就放在这里
  const topRow = Math.max(3, baseRow - 7);
  const topCol = entryCol + 12;
  for (let j = 0; j < 3; j++) setT(topCol + j, topRow, TI.BRICK);
  const topStep = { col: topCol, row: topRow, w: 3 };
  const key = { x: (topStep.col + 1) * T + T / 2, y: topStep.row * T - 16 };

  /* ---------- 7) 金币：铺在路上 + 深坑上方拱形提示起跳点 ---------- */
  const coins = [];
  for (let x = 6; x < cols - 6; x += 3) {
    if (isPit[x]) continue;
    if (Math.abs(x - kx) < 12) continue; // 塔区单独铺
    coins.push({ x: x * T + T / 2, y: surf[x] * T - 16 });
  }
  pits.forEach(({ x, w }) => {
    const base = Math.min(surf[Math.max(0, x - 1)], surf[Math.min(cols - 1, x + w)]);
    for (let i = 0; i < w + 2; i++) {
      const t = (i + 0.5) / (w + 2);
      coins.push({ x: (x - 1 + i) * T + T / 2, y: (base - 2 - Math.sin(t * Math.PI) * 1.2) * T });
    }
  });
  platforms.forEach((p) => {
    for (let i = 0; i < p.w; i++) coins.push({ x: (p.x0 + i) * T + T / 2, y: p.y * T - 14 });
  });
  steps.forEach((s) => {
    for (let j = 0; j < s.w; j++) coins.push({ x: (s.col + j) * T + T / 2, y: s.row * T - 14 });
  });
  for (let j = 0; j < topStep.w; j++) coins.push({ x: (topStep.col + j) * T + T / 2, y: topStep.row * T - 14 });

  /* ---------- 8) 药水补给 ---------- */
  const pickups = [];
  const potionCount = index < 3 ? 2 : 1;
  for (let i = 0; i < potionCount; i++) {
    for (let tries = 0; tries < 30; tries++) {
      const x = rint(rng, 26, Math.max(27, cols - 20));
      if (isPit[x]) continue;
      if (Math.abs(x - kx) < 6) continue;
      pickups.push({ kind: 'potion', x: x * T + T / 2, y: surf[x] * T - 16 });
      break;
    }
  }

  /* ---------- 9) 敌人：数量少、分布稀疏 ---------- */
  const enemies = [];
  const enemyCount = clamp(2 + Math.floor(index / 2), 2, 7);
  const pool = index < 2 ? ['slime'] : index < 5 ? ['slime', 'moth'] : ['slime', 'moth', 'golem'];
  let placed = 0;
  let eg = 0;
  while (placed < enemyCount && eg++ < 300) {
    const x = rint(rng, 18, Math.max(19, cols - 16));
    if (isPit[x] || getT(x, surf[x] - 1) === TI.SPIKE) continue;
    let nearPit = false;
    for (let i = -5; i <= 5; i++) if (isPit[x + i]) nearPit = true;
    if (nearPit) continue; // 敌人离坑边远一点，避免把玩家撞进坑里
    if (Math.abs(x - kx) < 5) continue; // 别堵在塔底
    if (enemies.some((e) => Math.abs(e.x / T - x) < 8)) continue;
    const id = pool[rint(rng, 0, pool.length - 1)];
    if (id === 'golem' && enemies.some((e) => e.id === 'golem')) continue; // 精英怪最多一只
    const type = MONSTERS.find((m) => m.id === id) || MONSTERS[0];
    const row = surf[x];
    enemies.push({ id, x: x * T + T / 2, y: type.fly ? (row - 4) * T : row * T - type.hh - 1 });
    placed++;
  }
  // 靠后的关卡在钥匙塔旁固定放一只精英，营造「守塔」感但仍然好打
  if (index >= 3 && !enemies.some((e) => e.id === 'golem')) {
    const t = MONSTERS.find((m) => m.id === 'golem');
    const gx = Math.min(cols - 2, kx + 6);
    enemies.push({ id: 'golem', x: gx * T + T / 2, y: surf[gx] * T - t.hh - 1 });
  }

  /* ---------- 10) 出生点 / 终点宝箱 ---------- */
  const spawn = { x: 3 * T + T / 2, groundY: surf[3] * T };
  const chestCol = cols - 6;
  const chest = { x: chestCol * T + T / 2, groundY: surf[chestCol] * T };

  /* ---------- 12) 远景装饰（一次性随机，渲染时保持一致） ---------- */
  const decor = [];
  for (let i = 0; i < 26; i++) {
    decor.push({
      x: rng() * cols * T,
      w: rng.range(70, 170),
      h: rng.range(70, 190),
      kind: rng() < 0.55 ? 'block' : 'peak',
    });
  }

  const theme = LEVEL_THEMES[index % LEVEL_THEMES.length];

  return {
    cols, rows, grid,
    worldW: cols * T,
    worldH: rows * T,
    spawn, chest, key, theme,
    enemies, pickups, coins,
    platforms, pits, decor, surf,
    isPitCol: (x) => x >= 0 && x < cols && isPit[x] === 1,
  };
}
