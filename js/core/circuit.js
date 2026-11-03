/**
 * ============================================================
 * core/circuit.js —— 电路走线滚动叙事（方案 3）
 * ------------------------------------------------------------
 * 页面背后一条垂直「电路总线」，随滚动逐段通电：
 *   - 主干：SVG path，按滚动进度用 stroke-dashoffset 揭示
 *   - 节点：6 个区块各一个接线柱（branch + pad + 标签），
 *     滚到即点亮（发丝光 + 标签变亮）
 *   - 火花：一个小光点沿主干跟随滚动位置移动（可关：
 *     prefers-reduced-motion）
 * 布局测量基于真实 DOM（各 section 的 offsetTop），
 * resize / 字体加载 / 图片加载后自动重算。
 * 仅桌面（≥641px）显示；求职模式下由 CSS 隐藏。
 * ============================================================
 */

import { ROUTES } from './router.js';
import { FX } from '../config.js';

/** 节点旁的电路术语代号（呼应机器人启动流程） */
const NODE_CODES = {
  home: 'PWR',
  experience: 'MEM',
  skills: 'SYS',
  projects: 'APP',
  gallery: 'DEMO',
  contact: 'LINK',
};

const NS = 'http://www.w3.org/2000/svg';

export function initCircuit() {
  if (!FX.circuit) return;
  const layer = document.getElementById('circuit-layer');
  if (!layer) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 构建 SVG 骨架 ---------- */
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'circuit-svg');
  svg.setAttribute('aria-hidden', 'true');
  layer.appendChild(svg);

  // 主干：暗线（槽）+ 亮线（通电部分，dashoffset 揭示）
  const trunkDark = mk('path', { class: 'circuit-trunk-dark', fill: 'none' });
  const trunkLit = mk('path', { class: 'circuit-trunk-lit', fill: 'none' });
  // 火花光点（跟随滚动）
  const sparkGlow = mk('circle', { class: 'circuit-spark-glow', r: 10 });
  const spark = mk('circle', { class: 'circuit-spark', r: 3 });
  svg.append(trunkDark, trunkLit, sparkGlow, spark);

  // 起点端子
  const capStart = mk('rect', { class: 'circuit-cap', width: 8, height: 8, rx: 2 });
  svg.appendChild(capStart);

  // 每个区块一个节点组：支线 + 接线柱 + 代号标签
  const nodes = ROUTES.map((r) => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'circuit-node');
    g.dataset.id = r.id;

    const branch = mk('path', { class: 'circuit-branch', fill: 'none' });
    const pad = mk('rect', { class: 'circuit-pad', width: 7, height: 7, rx: 1.5 });
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('class', 'circuit-label');
    const idx = String(ROUTES.indexOf(r) + 1).padStart(2, '0');
    label.textContent = `${idx}·${NODE_CODES[r.id] || 'IO'}`;

    g.append(branch, pad, label);
    svg.appendChild(g);
    return { g, branch, pad, label, id: r.id, y: 0, frac: 0, lit: false };
  });

  /* ---------- 布局测量：按真实 DOM 位置画线 ---------- */
  let geo = null;

  function measure() {
    if (window.innerWidth < 641) { geo = null; return; } // 移动端不绘制

    // 干道 x：内容区左缘往左 34px，最小 22px
    const maxW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--max-w')) || 1080;
    const contentLeft = Math.max(0, (window.innerWidth - Math.min(maxW, window.innerWidth)) / 2);
    const x = Math.max(22, Math.round(contentLeft - 34));

    const sections = ROUTES
      .map((r) => document.getElementById(r.id))
      .filter(Boolean);
    if (sections.length < 2) { geo = null; return; }

    const bodyH = document.documentElement.scrollHeight;
    const y0 = sections[0].offsetTop + Math.min(140, sections[0].offsetHeight * 0.22);
    const yEnd = Math.min(bodyH - 120, sections[sections.length - 1].offsetTop + 130);

    svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${bodyH}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.width = '100%';
    svg.style.height = `${bodyH}px`;
    // 层是 absolute 且无定位祖先，height:100% 只等于视口高——必须显式撑到文档高
    layer.style.height = `${bodyH}px`;

    const d = `M ${x} ${Math.max(24, y0 - 36)} L ${x} ${yEnd}`;
    trunkDark.setAttribute('d', d);
    trunkLit.setAttribute('d', d);

    capStart.setAttribute('x', x - 4);
    capStart.setAttribute('y', Math.max(24, y0 - 36) - 4);

    for (const n of nodes) {
      const sec = document.getElementById(n.id);
      if (!sec) continue;
      n.y = Math.round(sec.offsetTop + Math.min(120, sec.offsetHeight * 0.18));
      n.frac = (n.y - y0) / Math.max(1, yEnd - y0);
      // 支线从主干向右伸出 18px 接到接线柱
      n.branch.setAttribute('d', `M ${x} ${n.y} L ${x + 18} ${n.y}`);
      n.pad.setAttribute('x', x + 18);
      n.pad.setAttribute('y', n.y - 3.5);
      n.label.setAttribute('x', x + 32);
      n.label.setAttribute('y', n.y + 3.5);
    }

    geo = { x, y0, yEnd, len: yEnd - y0 };
    trunkLit.style.strokeDasharray = String(geo.len);
    update(true);
  }

  /* ---------- 滚动驱动：揭示进度 + 节点点亮 + 火花 ---------- */
  let lastP = -1;

  function update(force = false) {
    if (!geo) return;
    const mid = window.scrollY + window.innerHeight * 0.5;
    const p = clamp((mid - geo.y0) / geo.len, 0, 1);
    if (!force && p === lastP) return;
    lastP = p;

    trunkLit.style.strokeDashoffset = String(geo.len * (1 - p));

    // 火花跟随通电前端
    const sparkY = geo.y0 + geo.len * p;
    for (const el of [spark, sparkGlow]) {
      el.setAttribute('cx', geo.x);
      el.style.transform = `translateY(${sparkY}px)`;
      el.style.opacity = p > 0.01 && p < 0.99 ? '1' : '0';
    }

    // 节点点亮
    for (const n of nodes) {
      const should = n.frac <= p + 0.001;
      if (should !== n.lit) {
        n.lit = should;
        n.g.classList.toggle('lit', should);
      }
    }
  }

  /* ---------- 事件绑定 ---------- */
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking || !geo) return;
    ticking = true;
    requestAnimationFrame(() => { update(); ticking = false; });
  }, { passive: true });

  // 布局变化时重算（窗口尺寸、字体、图片、展开内容等）
  const ro = new ResizeObserver(() => measure());
  ro.observe(document.body);
  window.addEventListener('resize', measure);
  if (document.fonts?.ready) document.fonts.ready.then(measure);
  window.addEventListener('load', measure);
  measure();

  if (reduceMotion) layer.classList.add('no-motion');
}

/* ---------- 工具 ---------- */
function mk(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
