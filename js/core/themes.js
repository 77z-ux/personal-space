/**
 * ============================================================
 * core/themes.js —— 背景主题切换器
 * ------------------------------------------------------------
 * dock 按钮 🎨：点击在 5 套主题间循环，localStorage 记忆偏好；
 * 首次访问默认「极光夜幕」。真正的初始应用在 index.html 头部的
 * 内联脚本完成（DOM 解析前设置 data-theme，避免闪白/闪错主题）。
 *
 * 主题定义与样式见 css/themes.css，两处 id 必须保持一致。
 * ============================================================
 */

import { audio } from './audio.js';

const STORAGE_KEY = 'site-theme';

/** 与 css/themes.css 保持一致；顺序 = 点击循环顺序 */
const THEMES = [
  { id: 'aurora', name: '极光夜幕', icon: '🌌' },
  { id: 'neon', name: '深空霓虹', icon: '✨' },
  { id: 'blueprint', name: '工程蓝图', icon: '📐' },
  { id: 'paper', name: '墨纸留白', icon: '📜' },
  { id: 'terminal', name: '终端磷光', icon: '💾' },
];

function storedTheme() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function applyTheme(id) {
  document.documentElement.dataset.theme = id;
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* 隐私模式忽略 */ }
  // fx.js / 其它模块监听此事件同步配色（粒子、网格线颜色等）
  document.dispatchEvent(new CustomEvent('theme:change', { detail: { id } }));
}

export function initThemeSwitcher() {
  const btn = document.getElementById('theme-btn');
  if (!btn) return;
  const icon = document.getElementById('theme-icon');
  const toast = document.getElementById('theme-toast');

  // 内联脚本已设好初始主题；这里兜底并校验合法性
  let idx = THEMES.findIndex((t) => t.id === document.documentElement.dataset.theme);
  if (idx < 0) {
    const saved = storedTheme();
    idx = THEMES.findIndex((t) => t.id === saved);
    if (idx < 0) idx = 0;
    applyTheme(THEMES[idx].id);
  }

  const paint = () => {
    const t = THEMES[idx];
    if (icon) icon.textContent = t.icon;
    btn.title = `主题：${t.name}（点击切换）`;
    btn.setAttribute('aria-label', `切换背景主题，当前：${t.name}`);
  };

  let toastTimer = 0;
  const showToast = (t) => {
    if (!toast) return;
    toast.textContent = `${t.icon} ${t.name}`;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1400);
  };

  btn.addEventListener('click', () => {
    idx = (idx + 1) % THEMES.length;
    applyTheme(THEMES[idx].id);
    paint();
    showToast(THEMES[idx]);
    audio.play('click');
  });

  paint();
}
