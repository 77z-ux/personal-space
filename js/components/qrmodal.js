/**
 * ============================================================
 * components/qrmodal.js —— 分享二维码弹窗
 * ------------------------------------------------------------
 * 地址解析优先级：
 *   localStorage('zjj_site_url')  >  config.SITE.url  >  当前页面地址
 * 部署后更新指向的两种方式（见 docs/DEPLOY.md）：
 *   ① 修改 js/config.js 的 SITE.url 后重新部署（推荐，长期生效）
 *   ② 打开弹窗粘贴新地址 →「设为默认地址」（存本机浏览器，即时生效）
 * 依赖：js/vendor/qrcode.js（kazuhikoarase/qrcode-generator，全局 qrcode）
 * ============================================================
 */

import { SITE } from '../config.js';
import { audio } from '../core/audio.js';

const LS_KEY = 'zjj_site_url';

/** 解析当前应生成二维码的地址 */
function resolveUrl() {
  return localStorage.getItem(LS_KEY) || SITE.url || window.location.href;
}

/** 用 vendor 库生成二维码 <img> */
function makeQrImage(text, size = 204) {
  // typeNumber=0 自动选版本；容错 M 级
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const cell = Math.floor(size / qr.getModuleCount());
  const margin = 2;
  const tag = qr.createImgTag(cell, margin);
  const div = document.createElement('div');
  div.innerHTML = tag;
  const img = div.firstChild;
  img.alt = '访问二维码';
  img.style.imageRendering = 'pixelated';
  return img;
}

export function initQrModal() {
  const modal = document.getElementById('qr-modal');
  const box = document.getElementById('qr-box');
  const urlText = document.getElementById('qr-url');
  const input = document.getElementById('qr-input');
  const shareBtn = document.getElementById('share-btn');

  function render(url) {
    box.innerHTML = '';
    try {
      box.appendChild(makeQrImage(url));
    } catch (err) {
      box.innerHTML = '<p style="color:#333;font-size:12px;padding:20px">地址过长，生成失败</p>';
    }
    urlText.textContent = url;
  }

  function open() {
    input.value = resolveUrl();
    render(input.value.trim());
    modal.hidden = false;
    audio.play('modal');
  }
  function close() { modal.hidden = true; }

  shareBtn.addEventListener('click', open);
  modal.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });

  document.getElementById('qr-regen').addEventListener('click', () => {
    const v = input.value.trim();
    if (v) render(v);
  });
  document.getElementById('qr-save').addEventListener('click', () => {
    const v = input.value.trim();
    if (!v) return;
    localStorage.setItem(LS_KEY, v);
    render(v);
    audio.play('toggleOn');
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); render(input.value.trim()); }
  });
}
