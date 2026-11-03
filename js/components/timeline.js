/**
 * components/timeline.js —— 经历时间线 + 荣誉墙
 * 数据源：config.js 的 TIMELINE / HONORS
 */
import { TIMELINE, HONORS } from '../config.js';

export function renderTimeline() {
  const el = document.getElementById('experience');
  el.innerHTML = `
    <div class="section-head reveal">
      <p class="section-kicker">Experience</p>
      <h2 class="section-title">经历时间线</h2>
    </div>

    <div class="timeline">
      ${TIMELINE.map((t, i) => `
        <div class="tl-item tl-${t.type} reveal" data-anim="slide" data-delay="${i * 0.08}">
          <p class="tl-date">${t.date} · ${t.org}</p>
          <div class="tl-card">
            <h3 class="tl-title">${t.title}</h3>
            <ul class="tl-points">
              ${t.points.map((p) => `<li>${p}</li>`).join('')}
            </ul>
            <div class="tl-tags">${t.tags.map((g) => `<span class="tag">${g}</span>`).join('')}</div>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="section-head reveal" style="margin-top:70px">
      <p class="section-kicker">Honors</p>
      <h2 class="section-title">荣誉与奖项</h2>
    </div>
    <div class="honors-grid">
      ${HONORS.map((h, i) => `
        <div class="honor-card reveal" data-anim="scale" data-delay="${i * 0.06}">
          <span class="honor-level">${h.level}</span>
          <p class="honor-name">${h.name}</p>
          ${h.note ? `<p class="honor-note">${h.note}</p>` : ''}
          ${h.date ? `<p class="honor-note mono">${h.date}</p>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}
