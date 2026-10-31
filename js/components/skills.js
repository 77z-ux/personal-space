/**
 * components/skills.js —— 能力标签矩阵
 * 数据源：config.js 的 SKILLS；新增分组只需 push 配置
 */
import { SKILLS } from '../config.js';

export function renderSkills() {
  const el = document.getElementById('skills');
  el.innerHTML = `
    <div class="section-head reveal">
      <p class="section-kicker">Skills</p>
      <h2 class="section-title">能力矩阵</h2>
    </div>
    <div class="skills-grid">
      ${SKILLS.map((g, i) => `
        <div class="skill-group reveal" data-delay="${i * 0.08}">
          <div class="skill-group-head">
            <span class="skill-icon">${g.icon}</span>
            <span>${g.group}</span>
          </div>
          <div class="skill-items">
            ${g.items.map((it) => `<span class="tag">${it}</span>`).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}
