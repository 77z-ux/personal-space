/**
 * ============================================================
 * adv/main.js —— 冒险游戏装配层
 * ------------------------------------------------------------
 * 把「关卡生成 + 引擎 + 音效」接到 DOM：HUD、关卡章节、生涯节点侧栏、
 * 怪物图鉴、宝藏冻结展示卡片、升级三选一、结算界面、键鼠与触屏输入、存档。
 * 生涯节点的外观/解锁顺序/存档口径与贪吃蛇完全一致。
 *
 * 关卡流程：开始 → 第 N 关（跑图清怪、找钥匙）→ 打开终点宝箱
 *          → 冻结并展示该关节点详情 → 按任意键 → 下一关
 *          → 第 12 关结束后进入通关结算（完整成长轨迹回顾）
 * ============================================================
 */

import { NODES, NODE_COUNT, MONSTERS, PERKS, LEVEL_THEMES } from './data.js';
import { AdventureGame, LEVEL_COUNT } from './game.js';
import { sfx } from './sfx.js';

const BEST_KEY = 'zjj_adv_best';
const SEEN_KEY = 'zjj_adv_seen'; // 累计发现的怪物种类
const NODE_KEY = 'zjj_adv_nodes'; // 累计解锁过的节点（跨局保留）

const $ = (id) => document.getElementById(id);
const el = {
  canvas: $('adv-canvas'),
  stage: $('stage-wrap'),
  overlay: $('overlay'),
  ovIcon: $('ov-icon'), ovTitle: $('ov-title'), ovDesc: $('ov-desc'), ovBtn: $('ov-btn'), ovTip: $('ov-tip'),
  hpFill: $('hp-fill'), hpText: $('hp-text'), xpFill: $('xp-fill'), lvText: $('lv-text'),
  score: $('score'), kills: $('kills'), timer: $('timer'),
  btnPause: $('btn-pause'),
  lcIdx: $('lc-idx'), lcTotal: $('lc-total'), lcChapter: $('lc-chapter'),
  keyIcon: $('key-icon'), keyText: $('key-text'), keyChip: $('key-chip'),
  nodeCount: $('unlock-count'), nodeTotal: $('unlock-total'), progress: $('progress-bar'),
  sideSub: $('side-sub'), nodeList: $('node-list'),
  bestiaryList: $('bestiary-list'), bestiaryCount: $('bestiary-count'), bestScore: $('best-score'),
  lvlModal: $('lvl-modal'), lvlCards: $('lvl-cards'), lvlSub: $('lvl-sub'),
  revealModal: $('reveal-modal'), rvChapter: $('rv-chapter'), rvIdx: $('rv-idx'), rvTotal: $('rv-total'),
  rvEmoji: $('rv-emoji'), rvYear: $('rv-year'), rvTag: $('rv-tag'), rvTitle: $('rv-title'),
  rvText: $('rv-text'), rvBar: $('rv-bar'), rvNext: $('rv-next'), rvGo: $('rv-go'),
  resModal: $('res-modal'), resBadge: $('res-badge'), resTitle: $('res-title'), resDesc: $('res-desc'),
  resScore: $('res-score'), resNodes: $('res-nodes'), resKills: $('res-kills'), resTime: $('res-time'),
  resBestiary: $('res-bestiary'), resTimeline: $('res-timeline'), resTimelineTitle: $('res-timeline-title'),
  resAgain: $('res-again'),
  joystick: $('joystick'), knob: $('joystick-knob'),
  btnAttack: $('btn-attack'), btnDash: $('btn-dash'), btnJump: $('btn-jump'),
  soundBtn: $('sound-toggle'), soundIcon: $('sound-icon'),
};

/* ---------------- 存档 ---------------- */
const readJSON = (k, def) => { try { return JSON.parse(localStorage.getItem(k) || '') ?? def; } catch { return def; } };
let bestScore = Number(localStorage.getItem(BEST_KEY) || 0);
let seenMonsters = new Set(readJSON(SEEN_KEY, []));
let everNodes = new Set(readJSON(NODE_KEY, []));

/* ---------------- 侧栏：生涯节点 ---------------- */
el.nodeTotal.textContent = String(NODE_COUNT);
el.lcTotal.textContent = String(LEVEL_COUNT);
el.bestScore.textContent = String(bestScore);

function renderLockedNodes() {
  el.nodeList.innerHTML = NODES.map(
    (_, i) => `<li class="ms-locked" data-lock="${i}"><span class="lock-dot"></span>节点 ${String(i + 1).padStart(2, '0')} · 待解锁</li>`
  ).join('');
}

function unlockCard(index) {
  const m = NODES[index];
  if (!m) return;
  const li = document.createElement('li');
  li.className = 'ms-item';
  li.innerHTML = `<div class="ms-top">
      <span class="ms-year">${m.year}</span>
      <span class="ms-tag">${m.tag}</span>
      <span class="ms-idx">#${String(index + 1).padStart(2, '0')}</span>
    </div>
    <div class="ms-title"><span>${m.icon}</span><span>${m.title}</span></div>
    <p class="ms-text">${m.text}</p>`;
  const placeholder = el.nodeList.querySelector(`[data-lock="${index}"]`);
  if (placeholder) placeholder.replaceWith(li);
  else el.nodeList.appendChild(li);
  el.nodeList.scrollTo({ top: el.nodeList.scrollHeight, behavior: 'smooth' });
  el.sideSub.textContent = `最新解锁 · ${m.title}`;
}

/* ---------------- 侧栏：怪物图鉴 ---------------- */
function renderBestiary() {
  el.bestiaryList.innerHTML = MONSTERS.map((m) => {
    const known = seenMonsters.has(m.id);
    return `<li class="${known ? 'known' : 'unknown'}">
      <span class="b-icon">${known ? m.icon : '❔'}</span>
      <span class="b-main">
        <b>${known ? m.name : '未知生物'}</b>
        <em>${known ? m.note : '尚未遭遇'}</em>
      </span>
      <span class="b-stats">${known ? `HP ${m.hp} · DMG ${m.dmg}` : '—'}</span>
    </li>`;
  }).join('');
  el.bestiaryCount.textContent = `${seenMonsters.size} / ${MONSTERS.length}`;
}

function meetMonster(type) {
  if (seenMonsters.has(type.id)) return;
  seenMonsters.add(type.id);
  localStorage.setItem(SEEN_KEY, JSON.stringify([...seenMonsters]));
  renderBestiary();
}

/* ---------------- 小提示（钥匙 / 药水 / 上锁） ---------------- */
/** 在棋盘顶部中间弹出一条轻提示，不遮挡操作，1.8s 自动消失 */
function showHint(emoji, title, text, cls = '') {
  const node = document.createElement('div');
  node.className = `hint-toast${cls ? ' ' + cls : ''}`;
  node.innerHTML = `<div class="ht-card">
      <span class="ht-emoji">${emoji}</span>
      <span class="ht-title">${title}</span>
      <span class="ht-text">${text}</span>
    </div>`;
  el.stage.appendChild(node);
  setTimeout(() => node.remove(), 1800);
}

/* ---------------- 宝藏冻结：节点详情大卡片 ---------------- */
let revealAt = 0;

function showReveal(index) {
  const m = NODES[index];
  if (!m) return;
  const theme = LEVEL_THEMES[index % LEVEL_THEMES.length];
  el.rvChapter.textContent = theme.chapter;
  el.rvIdx.textContent = String(index + 1).padStart(2, '0');
  el.rvTotal.textContent = String(LEVEL_COUNT);
  el.rvEmoji.textContent = m.icon;
  el.rvYear.textContent = m.year;
  el.rvTag.textContent = m.tag;
  el.rvTitle.textContent = m.title;
  el.rvText.textContent = m.text;
  el.rvBar.style.width = `${((index + 1) / LEVEL_COUNT) * 100}%`;
  const last = index + 1 >= LEVEL_COUNT;
  el.rvNext.textContent = last ? '查看完整成长轨迹' : `进入第 ${index + 2} 关`;
  document.documentElement.style.setProperty('--lv-accent', theme.accent);
  el.revealModal.hidden = false;
  revealAt = performance.now();
}

/** 任意键 / 任意点击：关掉卡片继续下一关 */
function tryContinue() {
  if (!game || game.state !== 'reveal') return false;
  if (performance.now() - revealAt < 360) return false; // 防误触：刚开箱时正在按的键不算
  el.revealModal.hidden = true;
  sfx.blip({ freq: 660, dur: 0.1 });
  game.continueAfterReveal();
  return true;
}

/* ---------------- HUD ---------------- */
function fmtTime(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function updateHUD() {
  const p = game.player;
  const hpPct = Math.max(0, (p.hp / p.stats.maxHp) * 100);
  el.hpFill.style.width = `${hpPct}%`;
  el.hpFill.classList.toggle('low', hpPct < 30);
  el.hpText.textContent = `${Math.ceil(p.hp)}/${Math.round(p.stats.maxHp)}`;
  el.xpFill.style.width = `${Math.min(100, (p.xp / p.xpNeed) * 100)}%`;
  el.lvText.textContent = `Lv.${p.level}`;
  el.score.textContent = String(game.score);
  el.kills.textContent = String(game.kills);
  el.timer.textContent = fmtTime(game.timeMs);
  el.nodeCount.textContent = String(game.nodesFound);
  el.progress.style.width = `${(game.nodesFound / NODE_COUNT) * 100}%`;
  el.lcIdx.textContent = String(game.levelIndex + 1);
  const has = !!game.hasKey;
  el.keyIcon.textContent = has ? '🔑' : '🔒';
  el.keyText.textContent = has ? '钥匙已到手 · 冲向终点宝箱' : '先找到钥匙';
  el.keyChip.classList.toggle('got', has);
}
setInterval(() => { if (game) updateHUD(); }, 120);

/* ---------------- 遮罩 ---------------- */
function showOverlay({ icon, title, desc, btn, tip }) {
  el.ovIcon.textContent = icon;
  el.ovTitle.textContent = title;
  el.ovDesc.textContent = desc;
  el.ovBtn.textContent = btn;
  el.ovTip.textContent = tip;
  el.overlay.hidden = false;
}
const hideOverlay = () => { el.overlay.hidden = true; };

/* ---------------- 引擎 ---------------- */
const game = new AdventureGame(el.canvas, {
  onLevel({ index, theme }) {
    document.documentElement.style.setProperty('--lv-accent', theme.accent);
    el.lcIdx.textContent = String(index + 1);
  },
  onNode(index, x, y) {
    unlockCard(index);
    everNodes.add(index);
    localStorage.setItem(NODE_KEY, JSON.stringify([...everNodes]));
    showReveal(index);   // 冻结展示节点详情，等玩家按键
    sfx.pickupNode();
  },
  onKill(type) {
    meetMonster(type);
    sfx.kill();
  },
  onMeet(type) {
    // 进入视野就记进图鉴（不必打死）
    meetMonster(type);
  },
  onHit({ crit }) {
    if (crit) sfx.crit(); else sfx.hit();
  },
  onHurt() {
    sfx.hurt();
  },
  onPickup({ kind, healed }) {
    if (kind === 'coin') {
      sfx.blip({ freq: 1180, dur: 0.06, vol: 0.14 });
    } else if (kind === 'key') {
      showHint('🔑', '获得钥匙', '钥匙到手！冲向关卡最右侧的宝箱', 'gold');
      sfx.blip({ freq: 990, dur: 0.12 });
      sfx.blip({ freq: 1320, t: 0.08, dur: 0.14 });
    } else if (kind === 'potion') {
      showHint('🧪', `恢复 ${healed} 点生命`, '继续前进', 'green');
      sfx.potion();
    } else if (kind === 'locked') {
      showHint('🔒', '宝箱上锁', '先找到散落的钥匙', 'pink');
      sfx.blip({ freq: 180, type: 'square', dur: 0.12 });
    }
  },
  onLevelUp(picks) {
    renderPerks(picks);
    sfx.levelUp();
  },
  onEnd(res) {
    // 通关时先把最后一条节点同步进侧栏，再弹结算
    setTimeout(() => showResult(res), 420);
  },
  onStateChange(s) {
    el.btnPause.textContent = s === 'running' ? '暂停' : s === 'paused' ? '继续' : '暂停';
    if (s === 'running') hideOverlay();
    if (s === 'paused') {
      showOverlay({ icon: '⏸', title: '已暂停', desc: '喘口气，关卡一直在这里等你', btn: '继续冒险', tip: 'P 或 Esc 继续 · R 重开一局' });
    }
  },
});

/* ---------------- 升级三选一 ---------------- */
function renderPerks(picks) {
  el.lvlSub.textContent = `等级 ${game.player.level} · 击杀怪物可获得经验`;
  el.lvlCards.innerHTML = picks
    .map(
      (p) => `<button class="perk-card" type="button" data-perk="${p.id}">
        <span class="perk-icon">${p.icon}</span>
        <span class="perk-name">${p.name}</span>
        <span class="perk-desc">${p.desc}</span>
      </button>`
    )
    .join('');
  el.lvlModal.hidden = false;
}

el.lvlCards.addEventListener('click', (e) => {
  const card = e.target.closest('[data-perk]');
  if (!card) return;
  sfx.blip({ freq: 880, dur: 0.1 });
  game.choosePerk(card.dataset.perk);
  el.lvlModal.hidden = true;
});

/* ---------------- 结算 ---------------- */
function showResult(res) {
  const win = res.reason === 'win';
  const score = Math.max(res.score, 0);
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem(BEST_KEY, String(bestScore));
  }
  el.bestScore.textContent = String(bestScore);

  el.resBadge.textContent = win ? '🏆' : '💀';
  el.resTitle.textContent = win ? '通关：轨迹已完整' : '阵亡：轨迹中断';
  el.resDesc.textContent = win
    ? `你走完了目前为止的全部 ${NODE_COUNT} 个成长节点`
    : `倒在第 ${res.levelIndex + 1} 关，已解锁 ${res.nodes} / ${NODE_COUNT} 段经历`;
  el.resScore.textContent = String(score);
  el.resNodes.textContent = String(res.nodes);
  el.resKills.textContent = String(res.kills);
  el.resTime.textContent = fmtTime(res.timeMs);

  el.resBestiary.innerHTML = res.bestiary.length
    ? res.bestiary.map((id) => {
      const m = MONSTERS.find((x) => x.id === id);
      return `<span class="chip">${m.icon} ${m.name}</span>`;
    }).join('')
    : '<span class="chip dim">本局未遭遇怪物</span>';

  // 通关才展示完整成长轨迹（与贪吃蛇一致），阵亡时隐藏该区块
  el.resTimelineTitle.hidden = !win;
  el.resTimeline.hidden = !win;
  if (win) {
    el.resTimeline.innerHTML = NODES.map(
      (m, i) => `<li style="animation-delay:${i * 0.055}s">
        <span class="wt-year">${m.year}</span>
        <span class="wt-title">${m.icon} ${m.title}</span>
        <span class="wt-text">${m.text}</span>
      </li>`
    ).join('');
  }

  el.resModal.hidden = false;
  document.body.style.overflow = 'hidden';
  if (win) sfx.win(); else sfx.over();
}

function closeResult() {
  el.resModal.hidden = true;
  document.body.style.overflow = '';
}
el.resModal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeResult(); });

/** 开新的一局 */
function startNewRun() {
  closeResult();
  el.lvlModal.hidden = true;
  el.revealModal.hidden = true;
  el.stage.querySelectorAll('.hint-toast').forEach((n) => n.remove());
  renderLockedNodes();
  el.nodeCount.textContent = '0';
  el.progress.style.width = '0%';
  el.sideSub.textContent = '还没有解锁任何经历，先去开一个宝箱吧';
  game.start();
  updateHUD();
}

el.resAgain.addEventListener('click', startNewRun);
el.rvGo.addEventListener('click', tryContinue);
el.ovBtn.addEventListener('click', () => {
  if (game.state === 'paused') game.resume();
  else startNewRun();
});
el.btnPause.addEventListener('click', () => {
  if (game.state === 'idle') game.start();
  else game.togglePause();
});

/* ---------------- 键盘输入 ---------------- */
const KEY_DIR = {
  ArrowLeft: 'left', ArrowRight: 'right', a: 'left', d: 'right',
};
const KEY_JUMP = { ArrowUp: 1, w: 1, W: 1, k: 1, ' ': 1 };
const keys = new Set();

function syncInput() {
  let mx = 0;
  if (keys.has('left')) mx -= 1;
  if (keys.has('right')) mx += 1;
  game.input.mx = mx;
}

window.addEventListener('keydown', (e) => {
  // 宝藏展示中：任意键继续（消耗掉这次按键，不做其它动作）
  if (tryContinue()) { e.preventDefault(); return; }
  if (e.target.matches('input, textarea')) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (KEY_JUMP[e.key] || KEY_JUMP[e.key.toLowerCase?.()]) {
    e.preventDefault();
    if (!e.repeat) {
      if (game.state === 'idle' || game.state === 'over') startNewRun();
      game.pressJump();
    }
    return;
  }
  const dir = KEY_DIR[e.key] || KEY_DIR[key];
  if (dir) {
    e.preventDefault();
    keys.add(dir);
    syncInput();
    if (game.state === 'idle') game.start();
    return;
  }
  if (key === 'j') {
    e.preventDefault();
    sfx.swing();
    game.tryAttack();
    return;
  }
  if (e.key === 'Shift') { e.preventDefault(); sfx.dash(); game.tryDash(); return; }
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
    if (!el.resModal.hidden) closeResult();
    else game.togglePause();
  }
  if (e.key === 'r' || e.key === 'R') startNewRun();
});

window.addEventListener('keyup', (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (KEY_JUMP[e.key] || KEY_JUMP[e.key.toLowerCase?.()]) { game.releaseJump(); return; }
  const dir = KEY_DIR[e.key] || KEY_DIR[key];
  if (dir) { keys.delete(dir); syncInput(); }
});
window.addEventListener('blur', () => { keys.clear(); syncInput(); game.releaseJump(); if (game.state === 'running') game.pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'running') game.pause(); });

/* ---------------- 触屏：虚拟摇杆 ---------------- */
let joyId = null;
const JOY_R = 46;
el.joystick.addEventListener('pointerdown', (e) => {
  joyId = e.pointerId;
  el.joystick.setPointerCapture(e.pointerId);
  moveJoystick(e);
  if (game.state === 'idle') game.start();
});
el.joystick.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) moveJoystick(e); });
['pointerup', 'pointercancel'].forEach((evt) => el.joystick.addEventListener(evt, () => {
  joyId = null;
  el.knob.style.transform = 'translate(0px, 0px)';
  game.input.mx = 0;
  joyJumping = false;
  game.releaseJump();
}));

// 摇杆向上推也能跳（手机上单手也能推进）：推过阈值触发一次，拉回才解除
let joyJumping = false;
function moveJoystick(e) {
  const r = el.joystick.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  let dx = e.clientX - cx;
  let dy = e.clientY - cy;
  const d = Math.hypot(dx, dy);
  if (d > JOY_R) { dx = (dx / d) * JOY_R; dy = (dy / d) * JOY_R; }
  el.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  game.input.mx = dx / JOY_R;
  const up = dy / JOY_R < -0.5;
  if (up && !joyJumping) { joyJumping = true; game.pressJump(); }
  else if (!up && joyJumping) { joyJumping = false; game.releaseJump(); }
}

// 按住持续攻击
let attackTimer = 0;
const startAttackHold = () => {
  sfx.swing();
  game.tryAttack();
  clearInterval(attackTimer);
  attackTimer = setInterval(() => { sfx.swing(); game.tryAttack(); }, 220);
};
const stopAttackHold = () => clearInterval(attackTimer);
el.btnAttack.addEventListener('pointerdown', (e) => { e.preventDefault(); startAttackHold(); });
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.btnAttack.addEventListener(ev, stopAttackHold));
el.btnDash.addEventListener('pointerdown', (e) => { e.preventDefault(); sfx.dash(); game.tryDash(); });
// 跳跃：按下即可，按住更高（可变跳跃高度），松开停止上升
['pointerdown'].forEach((ev) => el.btnJump.addEventListener(ev, (e) => {
  e.preventDefault();
  if (game.state === 'idle' || game.state === 'over') startNewRun();
  game.pressJump();
}));
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.btnJump.addEventListener(ev, () => game.releaseJump()));

// 宝藏展示中：点遮罩任意位置也能继续（手机友好）
el.revealModal.addEventListener('pointerdown', (e) => { if (e.target.closest('.modal-mask')) tryContinue(); });
el.stage.addEventListener('touchmove', (e) => { if (e.target.closest('.joystick, .tbtn')) return; e.preventDefault(); }, { passive: false });
window.addEventListener('pointerdown', () => tryContinue(), { passive: true });

/* ---------------- 音效开关 ---------------- */
function syncSoundIcon() {
  el.soundIcon.textContent = sfx.enabled ? '🔊' : '🔇';
  el.soundBtn.title = sfx.enabled ? '音效已开启（点击静音）' : '音效已静音（点击开启）';
}
el.soundBtn.addEventListener('click', () => { sfx.toggle(); syncSoundIcon(); });
document.addEventListener('adv:sound', syncSoundIcon);

/* ---------------- 首屏 ---------------- */
renderLockedNodes();
renderBestiary();
updateHUD();
showOverlay({
  icon: '🕹️',
  title: '生涯闯关',
  desc: `12 关横版平台跳跃：踩/打怪物、爬上阶梯塔拿到钥匙，再到最右侧打开宝箱`,
  btn: '开始闯关',
  tip: '← → 移动 · 空格 / ↑ 跳跃（可二段跳）· 踩怪头顶或 J 键攻击 · Shift 冲刺',
});
syncSoundIcon();

// 调试钩子（控制台可查看状态，不影响玩法）
window.__adv = game;
window.__advRestart = startNewRun;
