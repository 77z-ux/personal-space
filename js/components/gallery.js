/**
 * components/gallery.js —— 更多演示视频（竖屏画廊）
 * 数据：config.js GALLERY；点击复用 projects.js 注册的视频弹层。
 */
import { GALLERY } from '../config.js';

export function renderGallery() {
  const el = document.getElementById('gallery');
  el.innerHTML = `
    <div class="section-head reveal">
      <p class="section-kicker">Demos</p>
      <h2 class="section-title">更多演示</h2>
    </div>
    <div class="gallery-grid">
      ${GALLERY.map((g, i) => `
        <div class="gallery-item reveal" data-delay="${i * 0.1}"
             data-video="${g.video}" data-poster="${g.poster}" data-title="${g.title}"
             role="button" tabindex="0" aria-label="播放 ${g.title}">
          <img src="${g.poster}" alt="${g.title} 封面" loading="lazy" />
          <div class="gallery-caption">
            ${g.title}
            <small>${g.hint}</small>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}
