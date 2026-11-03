/**
 * ============================================================
 * core/motion.js —— 细节动效层
 * ------------------------------------------------------------
 * 1) 光标柔光：一层跟随指针的径向渐变，给深色页面增加「有生命」的质感
 * 2) 磁吸按钮：指针靠近时按钮向光标偏移最多 4px（写 --mag-x/--mag-y 变量）
 * 全部在以下情况自动关闭：prefers-reduced-motion、触屏/无精确指针。
 * 只用一个 rAF 循环，停下即停止请求，避免空转耗电。
 * ============================================================
 */

const MAG_SELECTOR = '.btn, .nav-cta';
const MAG_MAX = 4; // 最大偏移像素，再大就显得「飘」

export function initMotion() {
  if (typeof window === 'undefined') return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (reduce.matches || !fine.matches) return;

  initCursorGlow();
  initMagnetic();
}

/* ---------------- 光标柔光 ---------------- */
function initCursorGlow() {
  const glow = document.createElement('div');
  glow.className = 'cursor-glow';
  glow.setAttribute('aria-hidden', 'true');
  document.body.appendChild(glow);

  let tx = 0, ty = 0;   // 目标位置
  let cx = 0, cy = 0;   // 当前（缓动）位置
  let started = false;
  let raf = 0;

  const loop = () => {
    cx += (tx - cx) * 0.14;
    cy += (ty - cy) * 0.14;
    glow.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
    if (Math.abs(tx - cx) > 0.4 || Math.abs(ty - cy) > 0.4) {
      raf = requestAnimationFrame(loop);
    } else {
      raf = 0;
    }
  };

  window.addEventListener('pointermove', (e) => {
    tx = e.clientX;
    ty = e.clientY;
    if (!started) {
      started = true;
      cx = tx; cy = ty;
      glow.classList.add('on');
    }
    if (!raf) raf = requestAnimationFrame(loop);
  }, { passive: true });

  document.addEventListener('pointerleave', () => glow.classList.remove('on'));
  window.addEventListener('blur', () => glow.classList.remove('on'));
}

/* ---------------- 磁吸按钮 ---------------- */
function initMagnetic(root = document) {
  root.querySelectorAll(MAG_SELECTOR).forEach((el) => {
    if (el.dataset.magBound) return; // 已绑定，避免重复监听
    el.dataset.magBound = '1';

    const move = (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const kx = Math.max(-1, Math.min(1, dx / (r.width / 2)));
      const ky = Math.max(-1, Math.min(1, dy / (r.height / 2)));
      el.style.setProperty('--mag-x', `${(kx * MAG_MAX).toFixed(2)}px`);
      el.style.setProperty('--mag-y', `${(ky * MAG_MAX).toFixed(2)}px`);
    };
    const reset = () => {
      el.style.setProperty('--mag-x', '0px');
      el.style.setProperty('--mag-y', '0px');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', reset);
    el.addEventListener('blur', reset);
  });
}

/** 元素动态渲染后（如求职模式）调用，为新按钮补上磁吸 */
export function refreshMagnetic(root = document) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  initMagnetic(root);
}
