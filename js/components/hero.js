/**
 * ============================================================
 * components/hero.js —— 首屏：头像光环 + 打字机 Slogan + 数字看板
 * ------------------------------------------------------------
 * Slogan 打字机循环 PROFILE.slogans（两句轮换）；
 * 数字看板滚动到可视区时做 count-up 动画。
 * ============================================================
 */

import { PROFILE, FX, RECRUITER } from '../config.js';

export function renderHero() {
  const el = document.getElementById('home');
  const edu = PROFILE.education;

  el.innerHTML = `
    <div class="hero-grid">
      <div class="hero-text reveal">
        <p class="hero-role mono">${PROFILE.role}</p>
        <h1 class="hero-name">你好，我是<br><span class="grad-text">${PROFILE.name}</span></h1>
        <p class="hero-slogan"><span id="slogan-text"></span><span class="caret">▌</span></p>
        <div class="hero-meta">
          <span>🎓 ${edu.school} · ${edu.major}</span>
          <span>📍 ${edu.period}</span>
        </div>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#projects">查看项目 ↓</a>
          <a class="btn btn-ghost" href="#contact">联系我</a>
          <a class="btn btn-ghost" href="${RECRUITER.resumeFile || '#contact'}" target="_blank" rel="noopener noreferrer"
             title="在线预览 PDF 简历">⌕ 简历 PDF</a>
        </div>
      </div>

      <div class="hero-visual reveal" data-delay="0.15">
        <div class="hero-avatar-wrap">
          <div class="hero-avatar-orbit"></div>
          <div class="hero-avatar-ring"></div>
          <div class="hero-avatar">
            <img src="${PROFILE.avatar}" alt="${PROFILE.name}的头像" />
          </div>
        </div>
      </div>

      <div class="hero-stats">
        ${PROFILE.stats.map((s, i) => `
          <div class="stat-card reveal" data-anim="scale" data-delay="${0.1 + i * 0.08}">
            <div class="stat-value grad-text">
              <span class="mono">${s.prefix || ''}</span><span class="stat-num" data-target="${s.value}" data-decimals="${s.decimals}">0</span><span class="mono">${s.suffix}</span>
            </div>
            <div class="stat-label">${s.label}</div>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="scroll-hint">SCROLL</div>
  `;

  startTypewriter();
  initStatCounter(el);
}

/** 打字机：逐字打出 → 停留 → 逐字删除 → 切换下一句 */
function startTypewriter() {
  const target = document.getElementById('slogan-text');
  if (!target) return;
  const lines = PROFILE.slogans;
  let li = 0, ci = 0, deleting = false;

  function tick() {
    const line = lines[li];
    if (!deleting) {
      ci++;
      target.textContent = line.slice(0, ci);
      if (ci >= line.length) {
        deleting = true;
        setTimeout(tick, 2600); // 完整句停留
        return;
      }
      setTimeout(tick, FX.typewriterSpeed);
    } else {
      ci--;
      target.textContent = line.slice(0, ci);
      if (ci <= 0) {
        deleting = false;
        li = (li + 1) % lines.length;
        setTimeout(tick, 500);
        return;
      }
      setTimeout(tick, FX.typewriterSpeed / 2.2);
    }
  }
  tick();
}

/** 数字滚动（进入视口时触发一次） */
function initStatCounter(root) {
  const nums = root.querySelectorAll('.stat-num');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      const el = entry.target;
      const target = parseFloat(el.dataset.target);
      const decimals = parseInt(el.dataset.decimals, 10) || 0;
      const t0 = performance.now();
      const dur = 1400;
      function step(now) {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
        el.textContent = (target * eased).toFixed(decimals);
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }, { threshold: 0.4 });
  nums.forEach((n) => io.observe(n));
}
