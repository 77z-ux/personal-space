/**
 * components/nav.js —— 顶部导航（路由链接由 core/router.js 驱动）
 * ------------------------------------------------------------
 * 移动端（≤640px）导航链接收进抽屉：点击 ☰ 展开，链接点击后自动收起，
 * 保证每个点击目标都 ≥44px（原先 6 个链接挤在一行，单链接仅约 30×28px）。
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
    <nav class="nav-links" id="nav-links" aria-label="主导航">
      ${ROUTES.map((r) => `<a href="${r.hash}">${r.label}</a>`).join('')}
    </nav>
    <div class="nav-right">
      <button class="nav-cta" id="recruiter-toggle" type="button" aria-pressed="false"
              title="一屏看完求职信息"><span aria-hidden="true">⚡</span> 招聘速览</button>
      <button class="nav-toggle" id="nav-toggle" type="button"
              aria-expanded="false" aria-controls="nav-links" aria-label="展开导航菜单">
        <span class="nav-toggle-bars" aria-hidden="true"></span>
      </button>
    </div>
  `;

  bindDrawer(nav);
}

/** 移动端抽屉：开合 + 点击链接/遮罩/Esc 关闭 */
function bindDrawer(nav) {
  const btn = nav.querySelector('#nav-toggle');
  const links = nav.querySelector('#nav-links');
  if (!btn || !links) return;

  const setOpen = (open) => {
    nav.classList.toggle('nav-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? '收起导航菜单' : '展开导航菜单');
    document.body.classList.toggle('nav-drawer-open', open);
  };

  btn.addEventListener('click', () => setOpen(!nav.classList.contains('nav-open')));
  links.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('click', (e) => {
    if (!nav.classList.contains('nav-open')) return;
    if (e.target.closest('#nav')) return;
    setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('nav-open')) setOpen(false);
  });
  // 回到桌面宽度时强制收起，避免状态残留
  window.matchMedia('(min-width: 641px)').addEventListener('change', (ev) => {
    if (ev.matches) setOpen(false);
  });
}
