/**
 * ============================================================
 * core/router.js —— Hash 路由 + 导航高亮 + 滚动进度条
 * ------------------------------------------------------------
 * 单页应用采用 hash 路由（#/home、#/projects …），
 * 兼容 GitHub Pages 等纯静态托管（无需服务端 rewrite）。
 * 扩展：ROUTES 数组登记 {hash, id, label}，导航与路由自动生效。
 * ============================================================
 */

import { audio } from './audio.js';

export const ROUTES = [
  { hash: '#home', id: 'home', label: '首页' },
  { hash: '#experience', id: 'experience', label: '经历' },
  { hash: '#skills', id: 'skills', label: '技能' },
  { hash: '#projects', id: 'projects', label: '项目' },
  { hash: '#gallery', id: 'gallery', label: '演示' },
  { hash: '#contact', id: 'contact', label: '联系' },
];

/** 当前 hash（空 hash 视为 #home；兼容 '#/projects' 与 '#projects' 两种写法） */
export function currentHash() {
  const raw = window.location.hash || '#home';
  return raw.startsWith('#/') ? `#${raw.slice(2)}` : raw;
}

/** 平滑滚动到对应区块 */
export function navigate(hash) {
  const route = ROUTES.find((r) => r.hash === hash);
  if (!route) return;
  const el = document.getElementById(route.id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    audio.play('whoosh');
  }
}

/** 根据可视区块更新导航高亮与进度条 */
export function initRouter() {
  const nav = document.getElementById('nav');
  const progress = document.getElementById('scroll-progress');

  // 导航链接拦截 → hash 路由
  nav.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    history.replaceState(null, '', a.getAttribute('href'));
    navigate(a.getAttribute('href'));
  });

  // 滚动：进度条 + 区块侦测
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const scrollTop = window.scrollY;
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = `${docH > 0 ? (scrollTop / docH) * 100 : 0}%`;
      nav.classList.toggle('scrolled', scrollTop > 10);

      // 找到当前处于视口上半部的区块
      let active = ROUTES[0].hash;
      for (const r of ROUTES) {
        const el = document.getElementById(r.id);
        if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.42) {
          active = r.hash;
        }
      }
      nav.querySelectorAll('.nav-links a').forEach((a) => {
        a.classList.toggle('active', a.getAttribute('href') === active);
      });
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // 浏览器前进后退（hashchange）
  window.addEventListener('hashchange', () => navigate(currentHash()));
}
