/**
 * ============================================================
 * snake/main.js —— 页面装配层
 * ------------------------------------------------------------
 * 把「数据（data.js） + 引擎（game.js） + 音效（sfx.js）」接到 DOM：
 *  - 分数看板 / 进度条 / 已解锁经历列表
 *  - 开始、暂停、失败、通关四种遮罩
 *  - 键盘、滑动、虚拟方向键三套输入
 *  - 通关弹窗：完整成长轨迹回顾
 * 改内容只动 data.js；改手感只动 game.js；这里只负责界面联动。
 * ============================================================
 */

import { MILESTONES, META } from './data.js';
import { SnakeGame } from './game.js';
import { sfx } from './sfx.js';

const BEST_KEY = 'zjj_snake_best';

/* ---------------- DOM ---------------- */
const $ = (id) => document.getElementById(id);
const el = {
  board: $('board'),
  overlay: $('overlay'),
  ovIcon: $('ov-icon'),
  ovTitle: $('ov-title'),
  ovDesc: $('ov-desc'),
  ovBtn: $('ov-btn'),
  ovTip: $('ov-tip'),
  scoreCur: $('score-cur'),
  scoreBest: $('score-best'),
  scoreTarget: $('score-target'),
  scoreTime: $('score-time'),
  btnPause: $('btn-pause'),
  btnRestart: $('btn-restart'),
  unlockCount: $('unlock-count'),
  unlockTotal: $('unlock-total'),
  progress: $('progress-bar'),
  list: $('milestones'),
  sideSub: $('side-sub'),
  soundBtn: $('sound-toggle'),
  soundIcon: $('sound-icon'),
  dpad: $('dpad'),
  winModal: $('win-modal'),
  winTimeline: $('win-timeline'),
  winScore: $('win-score'),
  winTime: $('win-time'),
  winBest: $('win-best'),
  winAgain: $('win-again'),
};

/** 棋盘外层容器：浮动提示与滑动手势都挂在这里（canvas 会被遮罩盖住） */
const boardWrap = document.querySelector('.board-wrap');

const TOTAL = MILESTONES.length;
let best = Number(localStorage.getItem(BEST_KEY) || 0);
let timeTimer = 0;

/* ---------------- 初始化静态文案 ---------------- */
el.scoreTarget.textContent = String(TOTAL);
el.unlockTotal.textContent = String(TOTAL);
el.scoreBest.textContent = String(best);
document.title = `${META.title} | 赵佳杰`;

/** 未解锁占位行 */
function renderLocked() {
  el.list.innerHTML = MILESTONES.map(
    (_, i) =>
      `<li class="ms-locked" data-lock="${i}"><span class="lock-dot"></span>节点 ${String(i + 1).padStart(2, '0')} · 待解锁</li>`
  ).join('');
}

/** 一条已解锁经历卡片 */
function cardHTML(m, index) {
  return `<li class="ms-item">
    <div class="ms-top">
      <span class="ms-year">${m.year}</span>
      <span class="ms-tag">${m.tag}</span>
      <span class="ms-idx">#${String(index + 1).padStart(2, '0')}</span>
    </div>
    <div class="ms-title"><span>${m.icon}</span><span>${m.title}</span></div>
    <p class="ms-text">${m.text}</p>
  </li>`;
}

/** 解锁第 index 条（把对应占位替换为卡片） */
function unlockCard(index) {
  const m = MILESTONES[index];
  if (!m) return;
  const placeholder = el.list.querySelector(`[data-lock="${index}"]`);
  const li = document.createElement('li');
  li.className = 'ms-item';
  li.innerHTML = cardHTML(m, index).replace(/^<li[^>]*>/, '').replace(/<\/li>$/, '');
  if (placeholder) placeholder.replaceWith(li);
  else el.list.appendChild(li);

  // 自动滚到最新一条
  el.list.scrollTo({ top: el.list.scrollHeight, behavior: 'smooth' });
  el.sideSub.textContent = `最新解锁 · ${m.title}`;
}

/* ---------------- 吃豆浮动提示（不遮挡操作、自动消失） ---------------- */
/**
 * 在豆子被吃掉的位置附近弹出该节点的名称与简介。
 *  - 用 left/top 百分比定位，窗口缩放时仍然贴合格子；
 *  - 靠近边缘自动内收、靠近顶部改为向下弹，避免被棋盘裁掉；
 *  - pointer-events:none，绝不拦截转向与滑动；
 *  - 出现 0.25s → 停留 → 上浮淡出，约 2.3s 后自动移除。
 */
function showBeanToast(index, cell) {
  const m = MILESTONES[index];
  if (!m || !cell) return;

  const left = Math.min(82, Math.max(18, ((cell.x + 0.5) / game.cols) * 100));
  const topPct = ((cell.y + 0.5) / game.rows) * 100;
  const below = topPct < 30; // 顶部空间不够就往豆子下方弹

  const node = document.createElement('div');
  node.className = `bean-toast${below ? ' below' : ''}`;
  node.style.left = `${left}%`;
  node.style.top = `${topPct}%`;
  node.innerHTML = `<div class="bt-card">
      <div class="bt-head">
        <span class="bt-emoji">${m.icon}</span>
        <span class="bt-no">节点 ${String(index + 1).padStart(2, '0')}</span>
        <span class="bt-plus">+1</span>
      </div>
      <div class="bt-title">${m.title}</div>
      <p class="bt-text">${m.text}</p>
    </div>`;

  // 同屏最多保留 3 个，避免连续吃豆时堆满画面
  const existing = boardWrap.querySelectorAll('.bean-toast');
  if (existing.length >= 3) existing[0].remove();

  boardWrap.appendChild(node);
  setTimeout(() => node.remove(), 2350);
}

function clearBeanToasts() {
  boardWrap.querySelectorAll('.bean-toast').forEach((n) => n.remove());
}

/* ---------------- 数值刷新 ---------------- */
function pop(node) {
  node.classList.remove('pop');
  void node.offsetWidth;
  node.classList.add('pop');
}

function updateScore(score) {
  el.scoreCur.textContent = String(score);
  pop(el.scoreCur);
  el.unlockCount.textContent = String(score);
  el.progress.style.width = `${(score / TOTAL) * 100}%`;
  if (score > best) {
    best = score;
    el.scoreBest.textContent = String(best);
    localStorage.setItem(BEST_KEY, String(best));
    pop(el.scoreBest);
  }
}

function fmtTime(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function tickTime() {
  el.scoreTime.textContent = fmtTime(game.timeMs);
}

/* ---------------- 遮罩 ---------------- */
function showOverlay({ icon, title, desc, btn, tip }) {
  el.ovIcon.textContent = icon;
  el.ovTitle.textContent = title;
  el.ovDesc.textContent = desc;
  el.ovBtn.textContent = btn;
  el.ovTip.textContent = tip;
  el.overlay.hidden = false;
}
function hideOverlay() {
  el.overlay.hidden = true;
}

/* ---------------- 通关回顾 ---------------- */
function buildWinRecap(score, ms) {
  el.winScore.textContent = String(score);
  el.winTime.textContent = fmtTime(ms);
  el.winBest.textContent = String(best);
  el.winTimeline.innerHTML = MILESTONES.map(
    (m, i) => `<li style="animation-delay:${i * 0.055}s">
      <span class="wt-year">${m.year}</span>
      <span class="wt-title">${m.icon} ${m.title}</span>
      <span class="wt-text">${m.text}</span>
    </li>`
  ).join('');
}

function openWin(score, ms) {
  buildWinRecap(score, ms);
  el.winModal.hidden = false;
  document.body.style.overflow = 'hidden';
  sfx.win();
}

function closeWin() {
  el.winModal.hidden = true;
  document.body.style.overflow = '';
  // 通关后关掉回顾弹窗，棋盘上留一个「重看 / 再来一次」的入口
  if (game.state === 'won') {
    showOverlay({
      icon: '🏆',
      title: META.winTitle,
      desc: `全部 ${TOTAL} 段经历已解锁 · 用时 ${fmtTime(game.timeMs)}`,
      btn: '再玩一次',
      tip: '点「重开」可再次挑战',
    });
  }
}

/* ---------------- 引擎实例 ---------------- */
const game = new SnakeGame(el.board, {
  target: TOTAL,
  cols: 19,
  rows: 19,
  stepMs: 155,
  minStepMs: 92,
  onEat(index, score, cell) {
    unlockCard(index);
    updateScore(score);
    showBeanToast(index, cell);
    sfx.eat(score - 1);
  },
  onWin({ score, ms }) {
    clearInterval(timeTimer);
    el.scoreTime.textContent = fmtTime(ms);
    updateScore(score);
    setTimeout(() => {
      if (game.state === 'won') openWin(score, ms); // 让最后一颗豆的动效播完
    }, 420);
  },
  onOver({ score, reason }) {
    clearInterval(timeTimer);
    updateScore(score);
    sfx.over();
    showOverlay({
      icon: '💥',
      title: '轨迹中断',
      desc: `${reason} · 已解锁 ${score} / ${TOTAL} 段经历`,
      btn: '再来一次',
      tip: '未解锁的经历还在等着你',
    });
  },
  onStateChange(state) {
    el.btnPause.textContent = state === 'running' ? '暂停' : state === 'paused' ? '继续' : '暂停';
    if (state === 'running') {
      hideOverlay();
      clearInterval(timeTimer);
      timeTimer = setInterval(tickTime, 200);
    } else if (state === 'paused') {
      clearInterval(timeTimer);
      showOverlay({
        icon: '⏸',
        title: '已暂停',
        desc: '休息一下，轨迹不会消失',
        btn: '继续游戏',
        tip: '空格 / 点击继续',
      });
    } else if (state === 'idle') {
      clearInterval(timeTimer);
      el.scoreTime.textContent = '0:00';
    }
  },
});

/* ---------------- 开始 / 暂停 / 重开 ---------------- */
function startGame() {
  clearBeanToasts();
  renderLocked();
  el.list.scrollTop = 0;
  el.unlockCount.textContent = '0';
  el.progress.style.width = '0%';
  el.sideSub.textContent = '还没有解锁任何经历，先吃一颗豆子吧';
  el.scoreTime.textContent = '0:00';
  game.restart();
}

function restartGame() {
  closeWin();
  startGame();
}

el.ovBtn.addEventListener('click', () => {
  if (game.state === 'paused') game.resume();
  else if (game.state === 'over' || game.state === 'won') restartGame();
  else game.start();
});

el.btnPause.addEventListener('click', () => {
  if (game.state === 'idle') game.start();
  else {
    game.togglePause();
    sfx.pause(game.state === 'paused');
  }
});

el.btnRestart.addEventListener('click', () => {
  sfx.blip({ freq: 480, dur: 0.06 });
  restartGame();
});

el.winAgain.addEventListener('click', restartGame);

el.winModal.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeWin();
});

/* ---------------- 输入：键盘 ---------------- */
const KEYMAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  W: 'up', S: 'down', A: 'left', D: 'right',
};

window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea')) return;
  const dir = KEYMAP[e.key];
  if (dir) {
    e.preventDefault();
    game.setDirection(dir);
    return;
  }
  if (e.code === 'Space') {
    e.preventDefault();
    if (game.state === 'idle') game.start();
    else if (game.state === 'over' || game.state === 'won') restartGame();
    else {
      game.togglePause();
      sfx.pause(game.state === 'paused');
    }
  }
  if (e.key === 'r' || e.key === 'R') restartGame();
  if (e.key === 'Escape') closeWin();
});

/* ---------------- 输入：触屏滑动 ---------------- */
// 监听挂在外层容器而非 canvas：这样「开始/暂停」遮罩显示时也能滑动开局
let touchStart = null;
boardWrap.addEventListener(
  'pointerdown',
  (e) => {
    touchStart = { x: e.clientX, y: e.clientY, t: Date.now() };
  },
  { passive: true }
);
boardWrap.addEventListener(
  'pointerup',
  (e) => {
    if (!touchStart) return;
    const dx = e.clientX - touchStart.x;
    const dy = e.clientY - touchStart.y;
    touchStart = null;
    if (Math.hypot(dx, dy) < 22) {
      // 轻点棋盘只负责「开始 / 继续」，暂停交给按钮，避免误触
      if (game.state === 'idle') game.start();
      else if (game.state === 'paused') game.resume();
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) game.setDirection(dx > 0 ? 'right' : 'left');
    else game.setDirection(dy > 0 ? 'down' : 'up');
    sfx.turn();
  },
  { passive: true }
);
boardWrap.addEventListener('pointercancel', () => { touchStart = null; });
boardWrap.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

/* ---------------- 输入：虚拟方向键 ---------------- */
el.dpad.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-dir]');
  if (!btn) return;
  game.setDirection(btn.dataset.dir);
  sfx.turn();
});

/* ---------------- 音效开关 ---------------- */
function syncSoundIcon() {
  el.soundIcon.textContent = sfx.enabled ? '🔊' : '🔇';
  el.soundBtn.title = sfx.enabled ? '音效已开启（点击静音）' : '音效已静音（点击开启）';
  el.soundBtn.classList.toggle('on', sfx.enabled);
}
el.soundBtn.addEventListener('click', () => {
  sfx.toggle();
  syncSoundIcon();
});
document.addEventListener('snake:sound', syncSoundIcon);
syncSoundIcon();

/* ---------------- 后台自动暂停 ---------------- */
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'running') game.pause();
});
window.addEventListener('blur', () => {
  if (game.state === 'running') game.pause();
});

/* ---------------- 首屏 ---------------- */
// 调试钩子：控制台可用 __snake 查看/驱动游戏（不影响正常玩法）
window.__snake = game;

renderLocked();
showOverlay({
  icon: '▶',
  title: '准备出发',
  desc: `吃掉 ${TOTAL} 个成长豆，逐条解锁我的经历`,
  btn: '开始游戏',
  tip: '方向键 / WASD · 手机可滑动',
});
