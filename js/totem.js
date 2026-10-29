/* Modo totem: teclado na tela, volta ao início depois de um tempo sem toque e tela de descanso
   com a programação do dia (tv.html em retrato). Roda por cima de app.js (window.TCE_APP.reset). */
(function () {
  'use strict';
  const T = window.TCE; const I = T.icon; const C = window.TCE_TOTEM; const root = document.getElementById('app');
  const IDLE_MS = C.idle * 1000;
  let idleTimer = null; let attractEl = null; let keyboardEl = null; let input = null;

  // ---------- tela de descanso ----------
  function tvUrl() {
    const p = new URLSearchParams();
    p.set('local', C.local); p.set('orientation', 'portrait');
    for (const k of ['t', 'd', 'theme', 'zoom']) if (T.params.get(k)) p.set(k, T.params.get(k));
    if (C.app) p.set('app', C.app);
    return `tv.html?${p.toString()}`;
  }
  function showAttract() {
    if (attractEl) return;
    hideKeyboard();
    try { window.TCE_APP.reset(); } catch { /* app ainda carregando */ }
    attractEl = document.createElement('div'); attractEl.className = 'attract';
    attractEl.innerHTML = `<iframe src="${tvUrl()}" title="Programação do dia" tabindex="-1"></iframe><div class="attract-bar"><span class="attract-cta">${I('phone')}Toque na tela para explorar</span></div><button class="attract-tap" aria-label="Toque para começar"></button>`;
    document.body.appendChild(attractEl);
  }
  function hideAttract() {
    if (!attractEl) return;
    const el = attractEl; attractEl = null;
    el.classList.add('hiding'); setTimeout(() => el.remove(), 250);
    try { window.TCE_APP.reset(); } catch { /* */ }
  }
  function touch() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(showAttract, IDLE_MS);
  }

  // ---------- teclado na tela ----------
  const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjklç', 'zxcvbnm'];
  function buildKeyboard() {
    const el = document.createElement('div'); el.className = 'osk'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Teclado');
    el.innerHTML = ROWS.map((r, i) => `<div class="osk-row">${[...r].map((k) => `<button type="button" data-key="${k}">${k}</button>`).join('')}${i === ROWS.length - 1 ? `<button type="button" class="wide" data-key="⌫" aria-label="Apagar">${I('back')}</button>` : ''}</div>`).join('')
      + `<div class="osk-row"><button type="button" class="wide danger" data-key="clear">Limpar</button><button type="button" class="space" data-key=" ">espaço</button><button type="button" class="wide primary" data-key="done">${I('check')}Pronto</button></div>`;
    el.addEventListener('pointerdown', (e) => e.preventDefault()); // mantém o foco no campo
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-key]'); if (!b || !input) return;
      const k = b.dataset.key;
      if (k === 'done') { const inp = input; hideKeyboard(); inp.blur(); return; }
      if (k === 'clear') input.value = '';
      else if (k === '⌫') input.value = input.value.slice(0, -1);
      else input.value += k;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return el;
  }
  function showKeyboard(inp) {
    input = inp;
    if (!keyboardEl) { keyboardEl = buildKeyboard(); root.appendChild(keyboardEl); }
    root.classList.add('osk-open');
  }
  function hideKeyboard() {
    if (keyboardEl) { keyboardEl.remove(); keyboardEl = null; }
    root.classList.remove('osk-open'); input = null;
  }
  document.addEventListener('focusin', (e) => { const inp = e.target.closest('[data-search]'); if (inp) showKeyboard(inp); });
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.osk') || e.target.closest('[data-search]')) return;
    if (keyboardEl && !e.target.closest('.search')) hideKeyboard();
  });

  // ---------- eventos ----------
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, touch, { passive: true });
  document.addEventListener('click', (e) => { if (e.target.closest('.attract')) { e.preventDefault(); hideAttract(); touch(); } }, true);
  document.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'f' && !e.target.closest('input')) { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {}); } });
  // Bloqueia links externos (o totem não deve sair do app): o QR Code faz esse papel.
  document.addEventListener('click', (e) => { const a = e.target.closest('a[href]'); if (a && /^https?:/.test(a.getAttribute('href')) && !a.closest('.attract')) e.preventDefault(); }, true);
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  setInterval(() => { const h = new Date().getHours(); if (h === 4 && new Date().getMinutes() < 2) location.reload(); }, 60000);

  showAttract();
})();
