/**
 * ============================================================
 * components/projects.js —— 项目展示卡片（含视频）
 * ------------------------------------------------------------
 * 行为：
 *  - 卡片封面 = poster 帧；点击封面在弹层中播放完整视频（不自动播放，遵守浏览器策略）
 *  - 鼠标悬停时卡片做轻微 3D 倾斜（mousemove 驱动，离开复位）
 * 数据：config.js PROJECTS；新增项目 = push 配置，卡片自动出现。
 * ============================================================
 */

import { PROJECTS } from '../config.js';
import { audio } from '../core/audio.js';

export function renderProjects() {
  const el = document.getElementById('projects');
  el.innerHTML = `
    <div class="section-head reveal">
      <p class="section-kicker">Projects</p>
      <h2 class="section-title">项目展示</h2>
    </div>
    <div class="projects-grid">
      ${PROJECTS.map((p, i) => projectCard(p, i)).join('')}
    </div>
  `;

  // 注意：从 document 范围查找，因为画廊项（#gallery 区块）不在本组件的 section 内
  bindVideoModal(document);
  bindTilt(el);
}

function projectCard(p, i) {
  return `
    <article class="project-card reveal" data-anim="scale" data-delay="${(i % 2) * 0.1}" data-tilt>
      <div class="project-media ${p.orientation === 'portrait' ? 'portrait' : ''}"
           data-video="${p.video}" data-title="${p.title}" role="button" tabindex="0"
           aria-label="播放 ${p.title} 演示视频">
        <img src="${p.poster}" alt="${p.title} 视频封面" loading="lazy" width="${p.posterW || 1280}" height="${p.posterH || 720}" decoding="async" />
        ${p.award ? `<span class="project-award">🏆 ${p.award}</span>` : ''}
        <span class="play-badge"><span class="play-circle">▶</span></span>
      </div>
      <div class="project-body">
        <h3 class="project-title">${p.title}</h3>
        <p class="project-subtitle">${p.subtitle}</p>
        <p class="project-period">${p.period}</p>
        <p class="project-desc">${p.desc}</p>
        <ul class="project-highlights">
          ${p.highlights.map((h) => `<li>${h}</li>`).join('')}
        </ul>
        <div class="project-tech">${p.tech.map((t) => `<span class="tag">${t}</span>`).join('')}</div>
        ${p.repo ? `
          <div class="project-links">
            <a href="${p.repo}" target="_blank" rel="noopener noreferrer">⎋ 源码仓库</a>
          </div>` : ''}
      </div>
    </article>
  `;
}

/** 点击封面 → 弹层播放（用户手势触发，符合自动播放策略） */
function bindVideoModal(root) {
  const modal = document.getElementById('video-modal');
  const player = document.getElementById('video-player');
  const title = document.getElementById('video-title');

  root.querySelectorAll('.project-media[data-video], .gallery-item[data-video]').forEach((el) => {
    const open = () => {
      title.textContent = el.dataset.title;
      player.src = el.dataset.video;
      player.poster = el.dataset.poster || '';
      modal.hidden = false;
      audio.play('modal');
      player.play().catch(() => { /* 用户未交互时浏览器可能拒绝，保持暂停态即可 */ });
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });

  const close = () => {
    player.pause();
    player.removeAttribute('src');
    player.load();
    modal.hidden = true;
  };
  modal.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
}

/** 3D 倾斜：鼠标在卡片上的位置决定旋转角（尊重减少动效偏好） */
function bindTilt(root) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelectorAll('[data-tilt]').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${(-py * 5).toFixed(2)}deg) rotateY(${(px * 7).toFixed(2)}deg) translateY(-4px)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  });
}
