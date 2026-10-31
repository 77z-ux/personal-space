/**
 * components/nav.js —— 顶部导航（路由链接由 core/router.js 驱动）
 */
import { ROUTES } from '../core/router.js';
import { PROFILE } from '../config.js';

export function renderNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = `
    <a class="nav-logo" href="#home">
      <span class="logo-dot"></span>
      <span>${PROFILE.name}<span class="grad-text">.dev</span></span>
    </a>
    <nav class="nav-links">
      ${ROUTES.map((r) => `<a href="${r.hash}">${r.label}</a>`).join('')}
    </nav>
  `;
}
