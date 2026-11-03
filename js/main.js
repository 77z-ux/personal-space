/**
 * ============================================================
 * main.js —— 应用入口：装配所有模块
 * ------------------------------------------------------------
 * 新增一个页面模块的标准流程：
 *   1. 在 js/config.js 注册数据
 *   2. 在 js/components/ 新建渲染函数（向 <section id="xxx"> 注入内容）
 *   3. 在 index.html 加一个 <section id="xxx">
 *   4. 在 core/router.js 的 ROUTES 登记 {hash:'#xxx', id:'xxx', label:'…'}
 *   5. 在下方 init() 中调用渲染函数
 * ============================================================
 */

import { FX } from './config.js';
import { initBackground } from './core/fx.js';
import { initReveal, observeReveals } from './core/reveal.js';
import { initRouter, ROUTES, currentHash } from './core/router.js';
import { audio, bindSfx } from './core/audio.js';

import { renderNav } from './components/nav.js';
import { renderHero } from './components/hero.js';
import { renderTimeline } from './components/timeline.js';
import { renderSkills } from './components/skills.js';
import { renderProjects } from './components/projects.js';
import { renderGallery } from './components/gallery.js';
import { renderContact, renderFooter } from './components/contact.js';
import { initQrModal } from './components/qrmodal.js';
import { mountViewCounter } from './components/views.js';
import { initRecruiterMode } from './components/recruiter.js';
import { initMotion } from './core/motion.js';
import { initCircuit } from './core/circuit.js';

function init() {
  // 1. 渲染各内容模块（顺序 = 页面区块顺序）
  renderNav();
  renderHero();
  renderTimeline();
  renderSkills();
  renderGallery();  // 注意：必须先渲染 gallery，renderProjects 内的弹层绑定才能覆盖到 gallery 项
  renderProjects();
  renderContact();
  renderFooter();
  mountViewCounter(); // 页脚访问计数（依赖 renderFooter 生成的容器）

  // 2. 背景特效 + 滚动入场 + hash 路由
  if (FX.particles) initBackground();
  initReveal();
  observeReveals();
  initRouter();
  initCircuit(); // 电路走线滚动叙事（依赖各区块已渲染 + 路由表）

  // 3. 二维码弹窗 + 静音开关 + 求职模式（依赖导航里渲染出的切换按钮）
  initQrModal();
  initSoundToggle();
  initRecruiterMode();

  // 4. 全局音效绑定（hover/click）+ 细节动效（光标柔光 / 磁吸按钮）
  bindSfx();
  initMotion();

  // 5. 初始 hash 定位（例如直接访问 /#/projects）
  //    用 instant 并延时一帧，覆盖浏览器的滚动位置恢复行为
  const h = currentHash();
  const route = ROUTES.find((r) => r.hash === h);
  if (route && h !== '#home') {
    setTimeout(() => {
      document.getElementById(route.id)?.scrollIntoView({ behavior: 'instant', block: 'start' });
    }, 80);
  }
}

/** 悬浮静音开关：图标/状态与 localStorage 同步 */
function initSoundToggle() {
  const btn = document.getElementById('sound-toggle');
  const icon = document.getElementById('sound-icon');

  const paint = () => {
    const on = audio.enabled;
    icon.textContent = on ? '🔊' : '🔇';
    btn.classList.toggle('on', on);
    btn.title = on ? '音效：开（点击静音）' : '音效：关（点击开启）';
  };

  btn.addEventListener('click', () => {
    audio.toggle();
    paint();
  });
  // 首次交互导致的「默认启用」也要刷新图标
  document.addEventListener('sound:state', paint);
  paint();
}

document.addEventListener('DOMContentLoaded', init);
