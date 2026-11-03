/**
 * ============================================================
 * components/recruiter.js —— 求职模式（给 HR 的一屏速览）
 * ------------------------------------------------------------
 * 设计目标：HR 停留通常不足 1 分钟。
 *  进入后折叠整站常规区块，只留「状态 + 定位 + 3 段经历 + 技术栈 + 联系方式 + 简历」，
 *  一屏读完，任何一步转化（发邮件 / 打电话 / 存简历）都只需一次点击。
 *
 * 触发：
 *  - 导航右侧「招聘速览」按钮（记住选择）
 *  - ?mode=recruiter 直达（可分享给 HR）；?mode=full 强制退出
 *  - #/recruiter 直达
 *  - Esc 退出
 * ============================================================
 */

import { RECRUITER, PROFILE, PROJECTS, LINKS } from '../config.js';
import { refreshMagnetic } from '../core/motion.js';

const STORE_KEY = 'recruiterMode';
let mounted = false;
let lastScroll = 0;

/* ---------------- 状态判定 ---------------- */

function readStore() {
  try { return localStorage.getItem(STORE_KEY) === '1'; } catch { return false; }
}
function writeStore(on) {
  try { on ? localStorage.setItem(STORE_KEY, '1') : localStorage.removeItem(STORE_KEY); } catch { /* 隐私模式忽略 */ }
}

/** URL 参数优先级最高：?mode=recruiter / ?mode=full */
function urlMode() {
  try {
    const m = new URLSearchParams(location.search).get('mode');
    if (m === 'recruiter') return true;
    if (m === 'full') return false;
  } catch { /* ignore */ }
  const h = location.hash;
  if (h === '#recruiter' || h === '#/recruiter') return true;
  return null;
}

/* ---------------- 渲染 ---------------- */

export function renderRecruiter() {
  const el = document.getElementById('recruiter');
  if (!el || mounted) return;
  mounted = true;

  const email = PROFILE.email;
  const phone = PROFILE.phone;
  const edu = PROFILE.education;
  const topProjects = PROJECTS.slice(0, 3);

  el.innerHTML = `
    <div class="rc-wrap">
      <header class="rc-head">
        <div class="rc-identity">
          <img class="rc-avatar" src="${PROFILE.avatar}" width="88" height="88"
               alt="${PROFILE.name}的头像" />
          <div class="rc-id-text">
            <span class="rc-status">
              <i class="rc-dot" aria-hidden="true"></i>
              <b>${RECRUITER.status.label}</b>
              <span class="rc-status-sub">${RECRUITER.status.sub}</span>
            </span>
            <h1 class="rc-name">${PROFILE.name}<span class="rc-slash">/</span><span class="grad-text">${PROFILE.role}</span></h1>
            <p class="rc-pitch">${RECRUITER.pitch}</p>
          </div>
        </div>

        <div class="rc-actions">
          <a class="btn btn-primary rc-btn" href="mailto:${email}?subject=${encodeURIComponent('面试邀约 · ' + PROFILE.name)}">
            ✉ 发邮件
          </a>
          <button class="btn btn-ghost rc-btn" type="button" id="rc-copy" data-copy="${email}">复制邮箱</button>
          <button class="btn btn-ghost rc-btn" type="button" id="rc-print">⤓ 保存 PDF</button>
        </div>
      </header>

      <ul class="rc-facts">
        ${RECRUITER.facts.map((f) => `
          <li class="rc-fact">
            <span class="rc-fact-num mono">${f.value}</span>
            <span class="rc-fact-label">${f.label}</span>
          </li>
        `).join('')}
        <li class="rc-fact rc-fact-edu">
          <span class="rc-fact-num rc-fact-school">${edu.school}</span>
          <span class="rc-fact-label">${edu.major} · ${edu.period}</span>
        </li>
      </ul>

      <div class="rc-grid">
        <section class="rc-panel rc-panel-main" aria-labelledby="rc-exp-title">
          <h2 class="rc-panel-title" id="rc-exp-title">核心经历<span class="rc-panel-hint">3 段 / 只看相关</span></h2>
          <ol class="rc-exp">
            ${RECRUITER.experiences.map((e) => `
              <li class="rc-exp-item">
                <div class="rc-exp-meta">
                  <span class="rc-kicker">${e.kicker}</span>
                  <span class="rc-period mono">${e.period}</span>
                </div>
                <h3 class="rc-exp-title">${e.title}</h3>
                <ul class="rc-exp-points">
                  ${e.points.map((p) => `<li>${p}</li>`).join('')}
                </ul>
                <div class="rc-tags">${e.tags.map((t) => `<span class="tag">${t}</span>`).join('')}</div>
              </li>
            `).join('')}
          </ol>
        </section>

        <div class="rc-side">
          <section class="rc-panel" aria-labelledby="rc-stack-title">
            <h2 class="rc-panel-title" id="rc-stack-title">技术栈</h2>
            <div class="rc-stack">
              ${RECRUITER.stack.map((g) => `
                <div class="rc-stack-row">
                  <span class="rc-stack-group">${g.group}</span>
                  <div class="rc-tags">${g.items.map((i) => `<span class="tag">${i}</span>`).join('')}</div>
                </div>
              `).join('')}
            </div>
          </section>

          <section class="rc-panel" aria-labelledby="rc-proj-title">
            <h2 class="rc-panel-title" id="rc-proj-title">代表项目<span class="rc-panel-hint">可看演示视频</span></h2>
            <ul class="rc-proj">
              ${topProjects.map((p) => `
                <li class="rc-proj-item">
                  <span class="rc-proj-name">${p.title}</span>
                  <span class="rc-proj-sub">${p.subtitle}</span>
                </li>
              `).join('')}
            </ul>
            <a class="rc-more" href="#projects" data-rc-exit>查看完整项目与视频 →</a>
          </section>
        </div>
      </div>

      <footer class="rc-foot">
        <div class="rc-contact">
          <a class="rc-contact-item" href="tel:${phone}"><span>✆</span>${phone}</a>
          <a class="rc-contact-item" href="mailto:${email}"><span>✉</span>${email}</a>
          <span class="rc-contact-item"><span>⌂</span>${edu.school} · ${edu.major}</span>
          ${LINKS.filter((l) => l.key !== 'email').map((l) => `
            <a class="rc-contact-item" href="${l.url}" target="_blank" rel="noopener noreferrer"><span>⌥</span>${l.label}</a>
          `).join('')}
        </div>
        <p class="rc-note">${RECRUITER.footerNote}</p>
      </footer>

      <p class="rc-toast" id="rc-toast" role="status" aria-live="polite"></p>
    </div>
  `;

  bindRecruiterActions(el);
}

function bindRecruiterActions(root) {
  const toastEl = root.querySelector('#rc-toast');
  let toastTimer = 0;

  const toast = (msg) => {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  };

  // 复制邮箱（成功/失败都给可读反馈，满足 aria-live 播报）
  root.querySelector('#rc-copy')?.addEventListener('click', async (e) => {
    const email = e.currentTarget.dataset.copy;
    try {
      await navigator.clipboard.writeText(email);
      toast(`已复制 ${email}`);
    } catch {
      // 回退：选中临时输入框内容
      const ta = document.createElement('textarea');
      ta.value = email;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand && document.execCommand('copy');
      ta.remove();
      toast(ok ? `已复制 ${email}` : `复制失败，请手动记下 ${email}`);
    }
  });

  // 简历：没有 PDF 文件时走浏览器「打印 → 另存为 PDF」，样式由 @media print 专门适配
  root.querySelector('#rc-print')?.addEventListener('click', () => {
    if (RECRUITER.resumeFile) {
      const a = document.createElement('a');
      a.href = RECRUITER.resumeFile;
      a.download = RECRUITER.resumeFileName || '';
      a.click();
      toast('简历 PDF 开始下载');
      return;
    }
    toast('在打印窗口选择「另存为 PDF」即可保存');
    setTimeout(() => window.print(), 420);
  });

  // 「查看完整项目」等内部链接：先退出速览，再交给路由滚动
  root.querySelectorAll('[data-rc-exit]').forEach((a) => {
    a.addEventListener('click', () => exitRecruiter({ restoreScroll: false }));
  });
}

/* ---------------- 模式切换 ---------------- */

export function enterRecruiter({ persist = true } = {}) {
  if (document.body.classList.contains('mode-recruiter')) return;
  lastScroll = window.scrollY;
  renderRecruiter();
  const section = document.getElementById('recruiter');
  if (section) section.hidden = false;
  document.body.classList.add('mode-recruiter');
  if (persist) writeStore(true);
  syncToggle();
  refreshMagnetic(section || document);
  document.title = `${PROFILE.name} · 求职速览 | ${PROFILE.role}`;
  window.scrollTo({ top: 0, behavior: 'instant' });
  // 让读屏从速览标题开始
  section?.setAttribute('tabindex', '-1');
  section?.focus({ preventScroll: true });
}

export function exitRecruiter({ restoreScroll = false, persist = true } = {}) {
  if (!document.body.classList.contains('mode-recruiter')) return;
  document.body.classList.remove('mode-recruiter');
  const section = document.getElementById('recruiter');
  if (section) section.hidden = true;
  if (persist) writeStore(false);
  syncToggle();
  document.title = '赵佳杰 · 机器人系统开发';
  window.scrollTo({ top: restoreScroll ? lastScroll : 0, behavior: 'instant' });
}

function syncToggle() {
  const btn = document.getElementById('recruiter-toggle');
  if (!btn) return;
  const on = document.body.classList.contains('mode-recruiter');
  btn.classList.toggle('is-on', on);
  btn.setAttribute('aria-pressed', String(on));
  btn.innerHTML = on ? '<span aria-hidden="true">✕</span> 退出速览' : '<span aria-hidden="true">⚡</span> 招聘速览';
  btn.title = on ? '回到完整页面（Esc）' : '一屏看完求职信息';
}

/** 入口：读 URL / localStorage 决定初始状态，并绑定按钮与快捷键 */
export function initRecruiterMode() {
  if (!RECRUITER.enabled) return;

  const url = urlMode();
  if (url === true) enterRecruiter();
  else if (url === false) {
    writeStore(false);
    document.body.classList.remove('mode-recruiter');
  } else if (readStore()) enterRecruiter({ persist: false });

  document.getElementById('recruiter-toggle')?.addEventListener('click', () => {
    if (document.body.classList.contains('mode-recruiter')) {
      exitRecruiter({ restoreScroll: true });
      // 清掉 hash，避免刷新后又回到速览
      if (/^#\/?recruiter$/.test(location.hash)) {
        history.replaceState(null, '', location.pathname + location.search.replace(/[?&]mode=recruiter/, ''));
      }
    } else {
      enterRecruiter();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('mode-recruiter')) {
      exitRecruiter({ restoreScroll: true });
    }
  });

  // 浏览器前进/后退到 #/recruiter 时同步状态
  window.addEventListener('hashchange', () => {
    const h = location.hash;
    const on = h === '#recruiter' || h === '#/recruiter';
    if (on) enterRecruiter({ persist: false });
    else if (document.body.classList.contains('mode-recruiter') && !location.search.includes('mode=recruiter')) {
      exitRecruiter({ restoreScroll: false, persist: false });
    }
  });

  syncToggle();
}
