/**
 * ============================================================
 * views.js —— 访问量计数（纯静态站点的可行性方案）
 * ------------------------------------------------------------
 * 静态站点没有后端，浏览量的常规做法是接入第三方计数服务。
 * 这里使用「不蒜子」(busuanzi) 的公开 JSONP 接口：
 *   GET https://busuanzi.ibruce.info/busuanzi?jsonpCallback=xxx
 *   → { site_pv, page_pv, site_uv }
 * 一次请求同时拿到：全站访问量(PV)、当前页访问量、全站访客数(UV)。
 *
 * 设计要点：
 *  1. JSONP 而非 fetch：该接口不返回 CORS 头，只能用 script 回调。
 *  2. 4 秒超时：服务不可用时不能让页脚一直空着。
 *  3. 失败降级：优先读取上次成功缓存的数值（localStorage），
 *     并在 title 中注明「缓存」，绝不杜撰一个假数字。
 *  4. 数字滚动动画 + 千分位：与站点的霓虹科技风保持一致。
 *
 * 想换服务商？只需替换 fetchStats()，外部接口（mountViewCounter）不变。
 * ============================================================
 */

import { SITE } from '../config.js';

const ENDPOINT = 'https://busuanzi.ibruce.info/busuanzi';
const TIMEOUT_MS = 4000;
const CACHE_KEY = 'ps:views:cache';

/** 本次页面加载只统计一次，避免重复挂载导致重复计数 */
let mounted = false;

/** JSONP：动态 script + 全局回调 */
function jsonp(url, timeout = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const cbName = `BusuanziCallback_${Math.floor(Math.random() * 1e12)}`;
    const script = document.createElement('script');
    let settled = false;

    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { delete window[cbName]; } catch { window[cbName] = undefined; }
      script.remove();
      fn(arg);
    };

    const timer = setTimeout(() => finish(reject, new Error('busuanzi timeout')), timeout);

    window[cbName] = (data) => finish(resolve, data);
    script.src = `${url}?jsonpCallback=${cbName}`;
    script.referrerPolicy = 'no-referrer-when-downgrade';
    script.onerror = () => finish(reject, new Error('busuanzi network error'));
    document.head.appendChild(script);
  });
}

/** 拉取统计数据；失败返回 null */
async function fetchStats() {
  try {
    const d = await jsonp(ENDPOINT);
    if (!d || typeof d.site_pv !== 'number') return null;
    const stat = { pv: d.site_pv, uv: d.site_uv, at: Date.now() };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(stat)); } catch { /* 隐私模式忽略 */ }
    return stat;
  } catch (err) {
    console.warn('[views] 访问量获取失败：', err.message);
    return null;
  }
}

/** 读取上次成功的缓存（用于服务不可用时降级展示） */
function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return typeof s.pv === 'number' ? s : null;
  } catch {
    return null;
  }
}

/** 数字滚动：0 → 目标值，900ms 缓出 */
function countUp(el, target, duration = 900) {
  const fmt = (n) => n.toLocaleString('zh-CN');
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(Math.round(target * eased));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** 本地预览（localhost / file://）不做统计：
 *  busuanzi 按域名计数，127.0.0.1 这个 key 是全世界本地调试共用的，
 *  数字毫无参考价值（实测上千万）。部署到正式域名后才真实统计。 */
function isLocalPreview() {
  const h = location.hostname;
  return location.protocol === 'file:' || h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '';
}

/**
 * 挂载访问计数到指定容器。
 * 调用时机：页脚渲染完成后（DOM 已存在）。
 */
export function mountViewCounter(host = document.getElementById('footer-views')) {
  if (!host || mounted || SITE?.views?.enabled === false) return;
  mounted = true;

  const local = isLocalPreview();

  host.innerHTML = `
    <div class="view-chip" id="view-chip" title="${local ? '本地预览不参与统计，部署到正式域名后自动生效' : '全站累计访问量 · 数据服务：不蒜子'}">
      <span class="view-pulse" aria-hidden="true"></span>
      <span class="view-item">👁 累计访问 <b class="view-num mono" id="view-pv">—</b> 次</span>
      <span class="view-divider" aria-hidden="true"></span>
      <span class="view-item">访客 <b class="view-num mono" id="view-uv">—</b> 位</span>
    </div>
  `;

  const chip = host.querySelector('#view-chip');
  const pvEl = host.querySelector('#view-pv');
  const uvEl = host.querySelector('#view-uv');

  // 本地预览：只展示占位，不发请求（避免污染统计）
  if (local) {
    chip.classList.add('is-preview');
    return;
  }

  fetchStats().then((stat) => {
    if (stat) {
      countUp(pvEl, stat.pv);
      countUp(uvEl, stat.uv);
      return;
    }
    // 降级：用上次成功的缓存值，并明确标注为缓存
    const cached = readCache();
    if (cached) {
      pvEl.textContent = cached.pv.toLocaleString('zh-CN');
      uvEl.textContent = cached.uv.toLocaleString('zh-CN');
      const when = new Date(cached.at).toLocaleDateString('zh-CN');
      chip.classList.add('is-cached');
      chip.title = `计数服务暂时不可用，显示 ${when} 的缓存值`;
    } else {
      host.hidden = true; // 从未成功过：干脆不显示，避免出现假数据
    }
  });
}
