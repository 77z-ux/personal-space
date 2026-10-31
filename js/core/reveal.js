/**
 * ============================================================
 * core/reveal.js —— 滚动入场动画（IntersectionObserver）
 * ------------------------------------------------------------
 * 用法：元素加 class="reveal"，可选 data-delay="0.15"（秒，交错入场）
 * 组件动态渲染后调用 observeReveals() 重新扫描。
 * ============================================================
 */

import { FX } from '../config.js';

let observer = null;

export function initReveal() {
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          observer.unobserve(entry.target); // 只入场一次
        }
      }
    },
    { threshold: FX.revealThreshold, rootMargin: '0px 0px -6% 0px' }
  );
}

/** 扫描并监听所有未绑定的 .reveal 元素 */
export function observeReveals(root = document) {
  if (!observer) return;
  root.querySelectorAll('.reveal:not(.in)').forEach((el) => {
    if (el.dataset.revealBound) return;
    el.dataset.revealBound = '1';
    const delay = el.dataset.delay;
    if (delay) el.style.setProperty('--reveal-delay', `${delay}s`);
    observer.observe(el);
  });
}
