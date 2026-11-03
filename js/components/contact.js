/**
 * components/contact.js —— 联系方式 + 外部链接 + 页尾
 * 数据：config.js CONTACT / LINKS
 */
import { CONTACT, LINKS, SITE, PROFILE, RECRUITER } from '../config.js';

export function renderContact() {
  const el = document.getElementById('contact');
  el.innerHTML = `
    <div class="section-head reveal">
      <p class="section-kicker">Contact</p>
      <h2 class="section-title">${CONTACT.title}</h2>
    </div>
    <div class="contact-grid">
      ${CONTACT.items.map((c, i) => `
        <a class="contact-card reveal" data-anim="scale" data-delay="${i * 0.08}"
           ${c.href ? `href="${c.href}"` : ''} ${c.href && (c.href.startsWith('http') || c.file) ? 'target="_blank" rel="noopener noreferrer"' : ''}
           ${c.file ? `download="${RECRUITER.resumeFileName || ''}"` : ''}>
          <span class="contact-icon">${c.icon}</span>
          <span>
            <span class="contact-label">${c.label}</span><br />
            <span class="contact-value">${c.value}</span>
          </span>
        </a>
      `).join('')}
    </div>
    <div class="links-row reveal" data-delay="0.2">
      ${LINKS.filter((l) => l.key !== 'email').map((l) => `
        <a class="link-chip" href="${l.url}" target="_blank" rel="noopener noreferrer" title="${l.note}">
          ${l.key === 'github' ? '⌥' : '⎇'} ${l.label}
        </a>
      `).join('')}
    </div>
  `;
}

export function renderFooter() {
  const el = document.getElementById('footer');
  el.innerHTML = `
    <p class="footer-poem">${CONTACT.footerLine}</p>
    <p>© ${new Date().getFullYear()} ${PROFILE.name} · ${SITE.title}</p>
    <p class="mono" style="margin-top:6px;opacity:.7">Built with vanilla JS · Hash Router · WebAudio</p>
    <div class="footer-views" id="footer-views"></div>
  `;
}
