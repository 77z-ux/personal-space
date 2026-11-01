/**
 * ============================================================
 * adv/level.js —— 【关卡制】横向线性关卡生成
 * ------------------------------------------------------------
 * 与 dungeon.js（自由探索随机地牢）的区别：这里是「闯关」结构——
 *   每关一条从左到右的路线，走到尽头打开宝箱即通关本关，
 *   解锁一个生涯节点后进入下一关，共 12 关。
 *
 * 关卡组成（全部可按 index 调难度）：
 *   · 起伏地形：每列地面高度做随机游走 + 两遍平滑
 *   · 深渊    ：宽 2 格贯通通道，必须冲刺跨越（掉下去扣血退回安全点）
 *   · 石柱    ：通道里的绕行障碍，逼出走位
 *   · 钥匙    ：散落在中段路上，拿到才能开终点宝箱
 *   · 药水    ：路上回血补给
 *
 * 地形值与 dungeon.js 兼容：0 地面 / 1 墙 / 2 深渊
 * 对外接口：generateLevel(index, rng) -> map
 *   map.spawn / map.exit  出生点与终点（像素中心）
 *   map.segments          被深渊切分出的若干可通行区段 [{x0,x1}]
 *   map.randomFloorIn(x0,x1) 取区段内一个地面点
 *   map.theme             关卡配色与章节名
 * ============================================================
 */

import { CONFIG, LEVEL_THEMES } from './data.js';
import { makeRng, TILE, tileAt } from './dungeon.js';

/** 地形类型统一由 dungeon.js 定义，这里转出一份方便关卡模块使用 */
export { TILE, tileAt, makeRng } from './dungeon.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function generateLevel(index, rng) {
  const cols = Math.min(CONFIG.mapCols, 34 + index * 2);
  const rows = CONFIG.levelRows;
  const grid = new Uint8Array(cols * rows).fill(TILE.WALL);
  const pitCol = new Uint8Array(cols);

  /* ---------- 1) 起伏地形：每列地面的顶部高度 ---------- */
  const minTop = Math.round(rows * 0.34);
  const maxTop = Math.round(rows * 0.68);
  let h = Math.round(rows * 0.52);
  const top = new Array(cols);
  for (let x = 0; x < cols; x++) {
    if (rng() < 0.32) h += rng.int(-1, 1);
    h = clamp(h, minTop, maxTop);
    top[x] = h;
  }
  // 两遍平滑，避免出现一格宽的尖刺台阶
  for (let pass = 0; pass < 2; pass++) {
    const c = top.slice();
    for (let x = 1; x < cols - 1; x++) top[x] = Math.round((c[x - 1] + c[x] + c[x + 1]) / 3);
  }

  /* ---------- 2) 深渊：宽 2 格，必须冲刺跨越 ---------- */
  const wantPits = Math.min(5, 1 + Math.floor(index / 2.5));
  const centers = [];
  let guard = 0;
  while (centers.length < wantPits && guard++ < 120) {
    const x = rng.int(12, Math.max(13, cols - 13));
    if (centers.some((c) => Math.abs(c - x) < 8)) continue;
    if (pitCol[x - 1] || pitCol[x] || pitCol[x + 1] || pitCol[x + 2]) continue;
    centers.push(x);
  }
  centers.forEach((x) => { pitCol[x] = 1; pitCol[x + 1] = 1; });
  // 深渊两侧拉平成平台，方便起跳与落地
  centers.forEach((x) => {
    const left = Math.max(0, x - 2);
    const right = Math.min(cols - 1, x + 3);
    const flat = Math.min(top[left], top[right]);
    for (let i = left; i <= x; i++) top[i] = flat;
    for (let i = x + 1; i <= right; i++) top[i] = flat;
  });

  /* ---------- 3) 挖通道 ---------- */
  const floorBottom = rows - 3;
  for (let x = 0; x < cols; x++) {
    if (pitCol[x]) {
      for (let y = 3; y <= floorBottom; y++) grid[y * cols + x] = TILE.PIT;
    } else {
      for (let y = top[x]; y <= floorBottom; y++) grid[y * cols + x] = TILE.FLOOR;
    }
  }

  /* ---------- 4) 石柱：通道中的绕行障碍 ---------- */
  const pillars = [];
  const wantPillars = Math.min(7, 2 + Math.floor(index / 2));
  let pg = 0;
  while (pillars.length < wantPillars && pg++ < 140) {
    const x = rng.int(8, Math.max(9, cols - 8));
    if (pitCol[x] || pitCol[x - 1] || pitCol[x + 1]) continue;
    if (pillars.some((p) => Math.abs(p.x - x) < 6)) continue;
    const t = top[x];
    if (floorBottom - t < 6) continue;
    const y = rng.int(t + 1, floorBottom - 3);
    grid[y * cols + x] = TILE.WALL;
    grid[(y + 1) * cols + x] = TILE.WALL;
    pillars.push({ x, y });
  }

  /* ---------- 5) 出生点 / 终点 ---------- */
  const spawnCol = 2;
  const exitCol = cols - 3;
  const spawn = {
    x: spawnCol * CONFIG.tile + CONFIG.tile / 2,
    y: (top[spawnCol] + 2) * CONFIG.tile + CONFIG.tile / 2,
  };
  const exit = {
    x: exitCol * CONFIG.tile + CONFIG.tile / 2,
    y: (top[exitCol] + 2) * CONFIG.tile + CONFIG.tile / 2,
  };

  /* ---------- 6) 区段：被深渊切分出的可通行区间 ---------- */
  const segments = [];
  let start = 0;
  for (let x = 0; x <= cols; x++) {
    if (x === cols || pitCol[x]) {
      if (x - start >= 5) segments.push({ x0: start, x1: x - 1 });
      start = x + 1;
    }
  }
  if (!segments.length) segments.push({ x0: 0, x1: cols - 1 });

  const theme = LEVEL_THEMES[index % LEVEL_THEMES.length];

  const map = {
    cols, rows, grid,
    rooms: [], // 关卡制不使用房间，保留字段以兼容旧接口
    explored: new Uint8Array(cols * rows),
    worldW: cols * CONFIG.tile,
    worldH: rows * CONFIG.tile,
    spawn,
    exit,
    theme,
    segments,
    /** 深渊列查询 */
    isPitCol: (x) => x >= 0 && x < cols && pitCol[x] === 1,
    /** 区段内随机地面点（像素中心） */
    randomFloorIn: (x0, x1) => {
      for (let i = 0; i < 40; i++) {
        const x = rng.int(Math.max(1, x0), Math.min(cols - 2, x1));
        if (pitCol[x]) continue;
        const y = rng.int(top[x] + 1, floorBottom - 1);
        return { x: x * CONFIG.tile + CONFIG.tile / 2, y: y * CONFIG.tile + CONFIG.tile / 2 };
      }
      return null;
    },
  };

  return map;
}
