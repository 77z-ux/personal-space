/**
 * ============================================================
 * core/fx.js —— 科技感背景：粒子星尘 + 透视网格 + 鼠标视差
 * ------------------------------------------------------------
 * 单 canvas 渲染，requestAnimationFrame 驱动；
 * 尊重 prefers-reduced-motion；页面不可见时自动暂停省电。
 * 扩展：调 CONFIG 中的数量/速度/网格行数即可改氛围。
 * ============================================================
 */

const CONFIG = {
  particleCount: 90,     // 粒子数
  particleSpeed: 0.22,   // 粒子上浮速度
  linkDistance: 120,     // 粒子连线距离
  gridRows: 14,          // 透视网格行数
  gridSpeed: 0.0016,     // 网格滚动速度
  colors: ['#00e5ff', '#7c4dff', '#ff4081'],
};

export function initBackground() {
  const canvas = document.getElementById('fx-bg');
  if (!canvas) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = 1;
  let particles = [];
  let gridOffset = 0;
  let mouse = { x: 0.5, y: 0.5 };
  let running = true;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawn() {
    particles = Array.from({ length: CONFIG.particleCount }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.8 + 0.4,
      vy: -(Math.random() * CONFIG.particleSpeed + 0.05),
      vx: (Math.random() - 0.5) * 0.12,
      c: CONFIG.colors[(Math.random() * CONFIG.colors.length) | 0],
      a: Math.random() * 0.5 + 0.25,
    }));
  }

  function drawGrid() {
    const horizon = h * 0.62;
    const vanX = w / 2 + (mouse.x - 0.5) * 40;

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.07)';
    ctx.lineWidth = 1;

    // 纵向放射线（汇聚到消失点）
    const cols = 26;
    for (let i = 0; i <= cols; i++) {
      const bx = (i / cols) * w * 2 - w / 2;
      ctx.beginPath();
      ctx.moveTo(vanX, horizon);
      ctx.lineTo(bx, h);
      ctx.stroke();
    }

    // 横向线（向地平线压缩 + 滚动）
    for (let i = 0; i < CONFIG.gridRows; i++) {
      const p = ((i / CONFIG.gridRows + gridOffset) % 1);
      const y = horizon + (h - horizon) * p * p; // 平方制造透视压缩
      const alpha = 0.02 + p * 0.10;
      ctx.strokeStyle = `rgba(124, 77, 255, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
    gridOffset = (gridOffset + CONFIG.gridSpeed) % (1 / CONFIG.gridRows);
  }

  function drawParticles() {
    const mx = (mouse.x - 0.5) * 18;
    const my = (mouse.y - 0.5) * 18;

    // 连线
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i], b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < CONFIG.linkDistance * CONFIG.linkDistance) {
          const alpha = (1 - Math.sqrt(d2) / CONFIG.linkDistance) * 0.14;
          ctx.strokeStyle = `rgba(0, 229, 255, ${alpha.toFixed(3)})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(a.x + mx * a.r * 0.4, a.y + my * a.r * 0.4);
          ctx.lineTo(b.x + mx * b.r * 0.4, b.y + my * b.r * 0.4);
          ctx.stroke();
        }
      }
    }

    // 粒子本体
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;

      ctx.globalAlpha = p.a;
      ctx.fillStyle = p.c;
      ctx.shadowColor = p.c;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(p.x + mx * p.r * 0.4, p.y + my * p.r * 0.4, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  function frame() {
    if (!running) return;
    ctx.clearRect(0, 0, w, h);
    drawGrid();
    drawParticles();
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => { resize(); spawn(); }, { passive: true });
  window.addEventListener('pointermove', (e) => {
    mouse.x = e.clientX / w;
    mouse.y = e.clientY / h;
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) requestAnimationFrame(frame);
  });

  resize();
  spawn();
  requestAnimationFrame(frame);
}
