/**
 * ============================================================
 * adv/dungeon.js —— 【附加功能 1】随机地牢生成
 * ------------------------------------------------------------
 * 思路：地图切成 4×3 个单元，每单元里随机挖一个矩形房间，
 * 再用 L 形走廊把房间串起来 → 每局布局都不一样，但一定连通。
 * 格子存一张 Uint8Array：1=墙，0=地面。
 * 同时维护 explored（迷雾：走过的房间在小地图点亮）。
 * ============================================================
 */

import { CONFIG } from './data.js';

/** 可复现随机数（mulberry32） */
export function makeRng(seed = Date.now()) {
  let a = seed >>> 0;
  const rng = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (min, max) => min + rng() * (max - min);
  rng.int = (min, max) => Math.floor(rng.range(min, max + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  return rng;
}

const CELL_COLS = 4;
const CELL_ROWS = 3;

export function generateDungeon(rng) {
  const cols = CONFIG.mapCols;
  const rows = CONFIG.mapRows;
  const grid = new Uint8Array(cols * rows).fill(1); // 默认全是墙
  const rooms = [];

  const cellW = Math.floor(cols / CELL_COLS);
  const cellH = Math.floor(rows / CELL_ROWS);

  const carveRect = (x, y, w, h) => {
    for (let ty = y; ty < y + h; ty++) {
      for (let tx = x; tx < x + w; tx++) {
        if (tx > 0 && ty > 0 && tx < cols - 1 && ty < rows - 1) grid[ty * cols + tx] = 0;
      }
    }
  };
  /** L 形走廊（宽 2 格，避免角色卡住） */
  const carveCorridor = (a, b) => {
    const horizontalFirst = rng() > 0.5;
    const stepX = () => {
      const [x1, x2] = a.x < b.x ? [a.x, b.x] : [b.x, a.x];
      for (let x = x1; x <= x2; x++) carveRect(x, a.y, 1, 2);
    };
    const stepY = () => {
      const [y1, y2] = a.y < b.y ? [a.y, b.y] : [b.y, a.y];
      for (let y = y1; y <= y2; y++) carveRect(b.x, y, 1, 2);
    };
    if (horizontalFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
  };

  // 1) 挖房间
  for (let r = 0; r < CELL_ROWS; r++) {
    for (let c = 0; c < CELL_COLS; c++) {
      const w = rng.int(6, 10);
      const h = rng.int(5, 8);
      const x = c * cellW + rng.int(1, Math.max(1, cellW - w - 1));
      const y = r * cellH + rng.int(1, Math.max(1, cellH - h - 1));
      const room = {
        x, y, w, h,
        cx: Math.floor(x + w / 2),
        cy: Math.floor(y + h / 2),
        index: rooms.length,
      };
      carveRect(x, y, w, h);
      rooms.push(room);
    }
  }

  // 2) 串联房间（保证连通）
  for (let i = 1; i < rooms.length; i++) {
    const prev = rooms[i - 1];
    const cur = rooms[i];
    carveCorridor({ x: prev.cx, y: prev.cy }, { x: cur.cx, y: cur.cy });
  }
  // 额外随机加一条环路，让地图不像一条直线
  const extra = rooms[rng.int(2, rooms.length - 1)];
  carveCorridor({ x: rooms[0].cx, y: rooms[0].cy }, { x: extra.cx, y: extra.cy });

  const map = {
    cols, rows, grid, rooms,
    explored: new Uint8Array(cols * rows),
    worldW: cols * CONFIG.tile,
    worldH: rows * CONFIG.tile,
  };

  /** 房间里随机一个地面格子（像素中心坐标） */
  map.randomSpotIn = (room, pad = 1) => ({
    x: (room.x + pad + rng.int(0, Math.max(0, room.w - pad * 2))) * CONFIG.tile + CONFIG.tile / 2,
    y: (room.y + pad + rng.int(0, Math.max(0, room.h - pad * 2))) * CONFIG.tile + CONFIG.tile / 2,
  });

  return map;
}

/* ---------------- 碰撞与地形查询（像素坐标） ---------------- */

/**
 * 地形类型（dungeon.js 的随机地牢与 level.js 的关卡制共用同一套编码）：
 *  FLOOR 0 可通行地面
 *  WALL  1 实心墙（谁都过不去）
 *  PIT   2 深渊（玩家可进入但会掉落扣血；怪物视其为障碍，不会跨越）
 */
export const TILE = { FLOOR: 0, WALL: 1, PIT: 2 };

export const tileAt = (map, x, y) => {
  const tx = Math.floor(x / CONFIG.tile);
  const ty = Math.floor(y / CONFIG.tile);
  if (tx < 0 || ty < 0 || tx >= map.cols || ty >= map.rows) return 1;
  return map.grid[ty * map.cols + tx];
};

export const isWall = (map, x, y) => tileAt(map, x, y) === 1;

/** 圆形 vs 墙体：采样圆心 + 8 个方向点 */
export function circleHitsWall(map, x, y, r) {
  if (isWall(map, x, y)) return true;
  const d = r * 0.82;
  const pts = [
    [d, 0], [-d, 0], [0, d], [0, -d],
    [d * 0.72, d * 0.72], [-d * 0.72, d * 0.72], [d * 0.72, -d * 0.72], [-d * 0.72, -d * 0.72],
  ];
  for (const [ox, oy] of pts) if (isWall(map, x + ox, y + oy)) return true;
  return false;
}

/** 像素坐标是否落在深渊里（中心点判定，手感更宽容） */
export const inPit = (map, x, y) => tileAt(map, x, y) === TILE.PIT;

/**
 * 圆形 vs 「墙或深渊」。
 * 怪物专用：怪物没有冲刺，深渊对它们等同于墙，于是它们会各自守在
 * 被深渊切分出的区段里，不会出现整图怪物一窝蜂追到出生点的情况。
 */
export function circleHitsSolid(map, x, y, r) {
  if (circleHitsWall(map, x, y, r)) return true;
  if (tileAt(map, x, y) === TILE.PIT) return true;
  const d = r * 0.72;
  const pts = [[d, 0], [-d, 0], [0, d], [0, -d]];
  for (const [ox, oy] of pts) if (tileAt(map, x + ox, y + oy) === TILE.PIT) return true;
  return false;
}

/** 点亮玩家周围的迷雾（半径单位为格） */
export function markExplored(map, px, py, radiusTiles = 7) {
  const cx = Math.floor(px / CONFIG.tile);
  const cy = Math.floor(py / CONFIG.tile);
  for (let ty = cy - radiusTiles; ty <= cy + radiusTiles; ty++) {
    for (let tx = cx - radiusTiles; tx <= cx + radiusTiles; tx++) {
      if (tx < 0 || ty < 0 || tx >= map.cols || ty >= map.rows) continue;
      if ((tx - cx) ** 2 + (ty - cy) ** 2 > radiusTiles * radiusTiles) continue;
      map.explored[ty * map.cols + tx] = 1;
    }
  }
}
